import type { BatteryChem, Reading, Station, StationConfig } from '../types'
import { CHEMS } from './battery'

export const DEFAULT_CONFIG: StationConfig = {
  interval_min: 10,
  wind_window_s: 8,
  gust_window_s: 3,
  samples: 8,
  wifi_timeout_s: 10,
  mm_per_tip: 0.2,
  k_wind: 0.42,
  dir_offset: 0,
  slow_below_v: CHEMS.li.slow_below_v,
  slow_factor: 3,
  critical_v: CHEMS.li.critical_v,
  charge_above_v: 0,
  charge_interval_min: 5,
  send_every: 3,
  continuous_wind: 0,
  urgent_gust_kmh: 0,
  bench_min: 2,
  battery_chem: 'li',
  battery_mah: 3000,
  version: 1,
}

interface DemoDef {
  id: string; name: string; city: string; lat: number; lon: number; alt: number
  t0: number; w0: number; d0: number; chem: BatteryChem; mah: number; offlineHours?: number
}

const DEFS: DemoDef[] = [
  { id: 'serra', name: 'Serra', city: 'Campos do Jordão', lat: -22.74, lon: -45.59, alt: 1628, t0: 15, w0: 14, d0: 225, chem: 'li', mah: 3000 },
  { id: 'costao', name: 'Costão', city: 'Paraty', lat: -23.22, lon: -44.74, alt: 6, t0: 26, w0: 9, d0: 150, chem: 'lfp', mah: 6000 },
  { id: 'praia', name: 'Praia', city: 'Ubatuba', lat: -23.4, lon: -45.12, alt: 3, t0: 25, w0: 11, d0: 120, chem: 'li', mah: 3400 },
  { id: 'capital', name: 'Capital', city: 'São Paulo', lat: -23.55, lon: -46.63, alt: 760, t0: 21, w0: 7, d0: 160, chem: 'lipo', mah: 2000 },
  { id: 'vale', name: 'Vale', city: 'São José dos Campos', lat: -23.22, lon: -45.89, alt: 600, t0: 22, w0: 8, d0: 90, chem: 'li', mah: 3000 },
  { id: 'planalto', name: 'Planalto', city: 'Campinas', lat: -22.91, lon: -47.06, alt: 680, t0: 23, w0: 10, d0: 200, chem: 'aa', mah: 2500 },
  { id: 'cidade', name: 'Cidade', city: 'Rio de Janeiro', lat: -22.85, lon: -43.2, alt: 10, t0: 28, w0: 12, d0: 110, chem: 'lfp', mah: 10000 },
  { id: 'mantiqueira', name: 'Mantiqueira', city: 'Itatiaia', lat: -22.45, lon: -44.62, alt: 800, t0: 12, w0: 6, d0: 300, chem: 'li', mah: 3000, offlineHours: 5 },
]

// ruído suave determinístico: soma de senos com fases diferentes
const wave = (t: number, periods: number[]) =>
  periods.reduce((s, p, i) => s + Math.sin((t / p) * Math.PI * 2 + i * 1.7), 0) / periods.length

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d

/** Leitura plausível para o instante `ts`, usada na demonstração e em testes sem hardware. */
export function demoReading(def: DemoDef, ts: number): Reading {
  const si = DEFS.indexOf(def)
  const h = new Date(ts * 1000)
  const hod = h.getHours() + h.getMinutes() / 60
  const sun = Math.max(0, Math.sin(((hod - 6) / 12) * Math.PI))
  const day = Math.sin(((hod - 9) / 24) * Math.PI * 2)
  const t = ts + si * 7919
  const front = wave(t, [172800, 91000])

  const temp = def.t0 + 5 * day + 2 * front
  const hum = Math.min(99, Math.max(28, 66 - 18 * day + 8 * front))
  const pres = 1013 - def.alt / 9 + 4 * wave(t, [259200, 140000])
  const wind = Math.max(0, def.w0 * 0.35 + def.w0 * 0.6 * sun + 3 * ((wave(t, [7200, 21000, 3000]) + 1) / 2))
  const gust = wind * (1.3 + 0.4 * ((wave(t, [3600, 5400]) + 1) / 2))
  const dir = (((def.d0 + 60 * wave(t, [30000, 11000, 52000])) % 360) + 360) % 360
  const wet = wave(t, [86400 * 1.3 + si * 5000, 40000, 17000])
  const rain = wet > 0.45 ? Math.round(((wet - 0.45) * 2.4) / 0.2) * 0.2 : 0
  const c = CHEMS[def.chem]
  const pct = Math.min(1, Math.max(0.1, 0.55 + 0.35 * sun - (rain > 0 ? 0.1 : 0)))

  return {
    ts: Math.floor(ts), temp: round(temp), hum: round(hum, 0), pres: round(pres), wind: round(wind), gust: round(gust),
    dir: round(dir, 0), rain: round(rain), vbat: round(c.min + (c.max - c.min) * pct, 2), rssi: -55 - ((si * 11) % 25),
  }
}

const defOf = (id: string) => DEFS.find((d) => d.id === id) ?? DEFS[0]

export function demoHistory(id: string, hours: number, now = Date.now() / 1000): Reading[] {
  const def = defOf(id)
  const step = 600
  const end = Math.floor((now - (def.offlineHours ?? 0) * 3600) / step) * step
  const out: Reading[] = []
  for (let t = end - hours * 3600; t <= end; t += step) out.push(demoReading(def, t))
  return out
}

export function demoStation(id: string, now = Date.now() / 1000): Station {
  const d = defOf(id)
  const hist = demoHistory(id, 24, now)
  const c = CHEMS[d.chem]
  return {
    id: d.id, name: d.name, city: d.city, lat: d.lat, lon: d.lon, alt: d.alt,
    config: { ...DEFAULT_CONFIG, battery_chem: d.chem, battery_mah: d.mah, slow_below_v: c.slow_below_v, critical_v: c.critical_v },
    cfg_applied: 1,
    last_seen: hist[hist.length - 1].ts,
    fw_version: '0.2.0',
    vbat: hist[hist.length - 1].vbat,
    rssi: hist[hist.length - 1].rssi,
    latest: hist[hist.length - 1],
    day: {
      rain: round(hist.reduce((s, r) => s + r.rain, 0)),
      tmin: Math.min(...hist.map((r) => r.temp)),
      tmax: Math.max(...hist.map((r) => r.temp)),
      gust: Math.max(...hist.map((r) => r.gust)),
    },
  }
}

export const demoNetwork = (now = Date.now() / 1000) => DEFS.map((d) => demoStation(d.id, now))

/** Próxima leitura da demonstração: some aos poucos para os instrumentos reagirem. */
export function demoNext(id: string, now = Date.now() / 1000): Reading | null {
  const d = defOf(id)
  return d.offlineHours ? null : demoReading(d, now)
}
