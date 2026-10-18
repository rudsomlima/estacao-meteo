export interface Env {
  DB: D1Database
  ASSETS: Fetcher
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
  send_every: Num; continuous_wind: Num; urgent_gust_kmh: Num; bench_min: Num
  battery_chem: 'li' | 'lfp' | 'lipo' | 'aa'; battery_mah: Num
  version: Num
}

export const DEFAULT_CONFIG: Config = {
  interval_min: 10, wind_window_s: 8, gust_window_s: 3, samples: 8, wifi_timeout_s: 10,
  mm_per_tip: 0.2, k_wind: 0.42, dir_offset: 0,
  slow_below_v: 3.55, slow_factor: 3, critical_v: 3.2,
  charge_above_v: 0, charge_interval_min: 5,
  send_every: 3, continuous_wind: 0, urgent_gust_kmh: 0, bench_min: 2,
  battery_chem: 'li', battery_mah: 3000, version: 1,
}

export const CHEMS = ['li', 'lfp', 'lipo', 'aa']
export const MAX_BATCH = 24
export const MAX_AGE_S = 7 * 86400 // leitura mais velha que isso é descartada pela estação

// limites aceitos para cada campo numérico da configuração
export const LIMITS: Record<string, [Num, Num]> = {
  interval_min: [1, 60], wind_window_s: [2, 30], gust_window_s: [1, 10], samples: [1, 32], wifi_timeout_s: [4, 30],
  mm_per_tip: [0.01, 5], k_wind: [0.05, 3], dir_offset: [0, 359.99],
  slow_below_v: [1.8, 4.2], slow_factor: [1, 12], critical_v: [1.5, 4.0], battery_mah: [100, 100000],
  charge_above_v: [0, 5], charge_interval_min: [1, 60],
  send_every: [1, 12], continuous_wind: [0, 1], urgent_gust_kmh: [0, 200], bench_min: [0, 30],
}
export const INTEGER_FIELDS = ['send_every', 'continuous_wind', 'urgent_gust_kmh', 'bench_min', 'charge_interval_min']

export const READING_RANGES: Record<string, [Num, Num]> = {
  temp: [-60, 90], hum: [0, 100], pres: [300, 1100], wind: [0, 120], gust: [0, 150],
  dir: [0, 360], rain: [0, 200], vbat: [0, 5], rssi: [-120, 0],
}

export const EVENT_KINDS = ['boot', 'ota_fail', 'ota_ok', 'bench', 'info']

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
