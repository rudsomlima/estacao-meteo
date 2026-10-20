import { serverNow } from './clock'
import type { Reading } from '../types'

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
/** Rumo em 16 pontos; "—" quando não há direção (estação sem biruta). */
export const compass16 = (deg: number) => (Number.isFinite(deg) ? DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : '—')

export const kmh = (ms: number) => ms * 3.6

const BEAUFORT = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
const BEAUFORT_NAME = [
  'Calmaria', 'Aragem', 'Brisa leve', 'Brisa fraca', 'Brisa moderada', 'Brisa forte',
  'Vento fresco', 'Vento forte', 'Ventania', 'Ventania forte', 'Tempestade', 'Tempestade violenta', 'Furacão',
]
export function beaufort(ms: number) {
  const n = BEAUFORT.findIndex((limit) => ms < limit)
  const f = n === -1 ? 12 : n
  return { n: f, name: BEAUFORT_NAME[f] }
}

/** Ponto de orvalho (Magnus). */
export function dewPoint(t: number, rh: number) {
  const a = 17.62, b = 243.12
  const g = Math.log(Math.max(rh, 1) / 100) + (a * t) / (b + t)
  return (b * g) / (a - g)
}

/** Temperatura aparente (Steadman, com vento). */
export function feelsLike(t: number, rh: number, windMs: number) {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t))
  return t + 0.33 * e - 0.7 * windMs - 4
}

export function trend(readings: Reading[], pick: (r: Reading) => number, hours = 3) {
  if (readings.length < 2) return 0
  const last = readings[readings.length - 1]
  const target = last.ts - hours * 3600
  let ref = readings[0]
  for (const r of readings) if (r.ts <= target) ref = r
  return pick(last) - pick(ref)
}

export interface DayStats {
  tMin: number; tMax: number; gustMax: number; rainDay: number; rainHour: number; windAvg: number
}
export function dayStats(readings: Reading[]): DayStats {
  const now = readings[readings.length - 1]
  const mid = new Date(now.ts * 1000)
  mid.setHours(0, 0, 0, 0)
  const today = readings.filter((r) => r.ts >= mid.getTime() / 1000)
  const set = today.length ? today : [now]
  const hour = readings.filter((r) => r.ts > now.ts - 3600)
  return {
    tMin: Math.min(...set.map((r) => r.temp)),
    tMax: Math.max(...set.map((r) => r.temp)),
    gustMax: Math.max(...set.map((r) => r.gust)),
    rainDay: set.reduce((s, r) => s + r.rain, 0),
    rainHour: hour.reduce((s, r) => s + r.rain, 0),
    windAvg: set.reduce((s, r) => s + r.wind, 0) / set.length,
  }
}

/** Frequência por setor (16) e velocidade média, para a rosa dos ventos. */
export function windRose(readings: Reading[]) {
  const bins = Array.from({ length: 16 }, () => ({ n: 0, sum: 0 }))
  for (const r of readings) {
    if (r.wind < 0.3 || !Number.isFinite(r.dir)) continue
    const i = Math.round((((r.dir % 360) + 360) % 360) / 22.5) % 16
    bins[i].n++
    bins[i].sum += r.wind
  }
  const total = bins.reduce((s, b) => s + b.n, 0) || 1
  return bins.map((b) => ({ freq: b.n / total, avg: b.n ? b.sum / b.n : 0 }))
}

/** Idade até o segundo: "há 45s", "há 2min10s", "há 3h12min08s", "há 2d4h10min05s". */
export function ago(ts: number, now = serverNow()) {
  let s = Math.max(0, Math.floor(now - ts))
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (d || h) parts.push(`${h}h`)
  if (d || h || m) parts.push(`${d || h ? String(m).padStart(2, '0') : m}min`)
  parts.push(`${d || h || m ? String(s).padStart(2, '0') : s}s`)
  return `há ${parts.join('')}`
}

/** Visto há pouco: a placa falou com o servidor, mesmo sem leitura de sensor (por exemplo, sem BME280). */
/** Tempo esperado entre dois contatos da estação: intervalo × leituras por envio (ela junta N leituras antes de mandar). */
export const contactS = (c: { interval_min: number; send_every?: number; idle_every?: number; env_sensor?: number }) =>
  c.interval_min * 60 * Math.max(1, c.env_sensor === 0 ? (c.idle_every ?? 1) : (c.send_every ?? 1))
/** Passou disto sem contato: atrasada. 2,5 contatos + 1 min de folga, a mesma regra do alerta de offline do servidor. */
export const lateAfterS = (c: { interval_min: number; send_every?: number; idle_every?: number; env_sensor?: number }) => contactS(c) * 2.5 + 60

/** A estação falou com o servidor dentro do esperado (o envio pode ser só o sinal de vida, sem leitura de sensor). */
export function isSeen(s: { last_seen: number | null; config: { interval_min: number; send_every?: number } }, now = serverNow()) {
  return !!s.last_seen && now - s.last_seen < lateAfterS(s.config)
}

/** Qualidade do sinal Wi-Fi a partir do RSSI (dBm). */
export const wifiLabel = (rssi: number) => (rssi >= -60 ? 'ótimo' : rssi >= -70 ? 'bom' : rssi >= -80 ? 'fraco' : 'muito fraco')
export const wifiColor = (rssi: number) => (rssi >= -60 ? '#4ade80' : rssi >= -70 ? '#a3e635' : rssi >= -80 ? '#fbbf24' : '#f87171')

/** Online: o último contato (envio ou sinal de vida) ou, sem ele, a última leitura está dentro do esperado. */
export function isOnline(s: { last_seen?: number | null; latest: { ts: number } | null; config: { interval_min: number; send_every?: number } }, now = serverNow()) {
  const t = Math.max(s.last_seen ?? 0, s.latest?.ts ?? 0)
  return t > 0 && now - t < lateAfterS(s.config)
}

/** A última leitura de sensor ainda vale (para desenhar vento e temperatura no mapa). */
export function hasFreshReading(s: { latest: { ts: number } | null; config: { interval_min: number; send_every?: number } }, now = serverNow()) {
  return !!s.latest && now - s.latest.ts < lateAfterS(s.config)
}
