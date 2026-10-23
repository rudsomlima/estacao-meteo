import { BATTERY_CHEMS, INTEGER_FIELDS, LIMITS, SCHEMA_DEFAULTS } from './schema'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** ponto de encontro do tempo real (WebSocket), veja hub.ts */
  HUB: DurableObjectNamespace
  /** Client ID do Google (público) e e-mails dos administradores, separados por vírgula: veja wrangler.toml */
  GOOGLE_CLIENT_ID?: string
  ADMIN_EMAILS?: string
  /** só em desenvolvimento (.dev.vars): "1" liga a entrada sem senha em localhost. Nunca defina em produção. */
  DEV_LOGIN?: string
  /** só para testes: aponta as chaves do Google para um servidor local */
  GOOGLE_JWKS_URL?: string
  ADMIN_TOKEN: string
  /** só para testes: aponta o Telegram para um servidor local */
  TELEGRAM_API?: string
}

type Num = number

export interface Config {
  interval_min: Num; wind_window_s: Num; gust_window_s: Num; samples: Num; wifi_timeout_s: Num
  mm_per_tip: Num; k_wind: Num; dir_offset: Num
  slow_below_v: Num; slow_factor: Num; critical_v: Num
  charge_above_v: Num; charge_interval_min: Num
  send_every: Num; continuous_wind: Num; urgent_gust_kmh: Num; bench_min: Num; wifi_tx_save: Num
  idle_every: Num; env_sensor: Num; has_wind: Num; has_vane: Num; has_rain: Num; pin_sda: Num; pin_scl: Num; pin_wind: Num; pin_rain: Num; pin_vbat: Num
  battery_chem: 'li' | 'lfp' | 'lipo' | 'aa'; battery_mah: Num
  version: Num
}

export const DEFAULT_CONFIG: Config = { ...SCHEMA_DEFAULTS, battery_chem: 'li', version: 1 }

export const CHEMS = BATTERY_CHEMS
export const MAX_BATCH = 24
export const MAX_AGE_S = 7 * 86400 // leitura mais velha que isso é descartada pela estação

// limites, campos inteiros e padrões vêm de shared/board-schema.json (schema.ts, gerado)
export { INTEGER_FIELDS, LIMITS }

/** Medidas que podem faltar numa leitura: umidade (MS5611) e direção (sem biruta). As outras são obrigatórias. */
export const OPTIONAL_READINGS = ['hum', 'dir', 'wind', 'gust', 'rain']

export const READING_RANGES: Record<string, [Num, Num]> = {
  temp: [-60, 90], hum: [0, 100], pres: [300, 1100], wind: [0, 120], gust: [0, 150],
  dir: [0, 360], rain: [0, 200], vbat: [0, 5], rssi: [-120, 0],
}

export const EVENT_KINDS = ['boot', 'ota_fail', 'ota_ok', 'bench', 'tls', 'info']

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

// ---- bateria: mesma curva do site (web/src/lib/battery.ts)
const LI: [number, number][] = [[3.0, 0], [3.3, 5], [3.5, 15], [3.6, 28], [3.7, 45], [3.8, 60], [3.9, 72], [4.0, 85], [4.1, 94], [4.2, 100]]
const CURVES: Record<string, [number, number][]> = {
  li: LI,
  lfp: [[2.8, 0], [3.0, 5], [3.2, 20], [3.25, 40], [3.3, 70], [3.35, 90], [3.45, 97], [3.6, 100]],
  lipo: LI.map(([v, p]) => [Math.max(v, 3.3), p] as [number, number]),
  aa: [[2.0, 0], [2.2, 10], [2.4, 25], [2.6, 45], [2.8, 65], [3.0, 85], [3.2, 100]],
}

export function batteryPct(v: number, chem: string) {
  const c = CURVES[chem] ?? LI
  if (v <= c[0][0]) return 0
  for (let i = 1; i < c.length; i++) {
    if (v <= c[i][0]) {
      const [v0, p0] = c[i - 1], [v1, p1] = c[i]
      return Math.round(p0 + ((v - v0) / (v1 - v0)) * (p1 - p0))
    }
  }
  return 100
}

const CARD = ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
export const compass16 = (deg: number) => CARD[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
