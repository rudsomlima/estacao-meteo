/** Uma leitura enviada pelo ESP32 a cada ciclo. Vento em m/s, chuva em mm desde a leitura anterior. */
export interface Reading {
  ts: number // unix, segundos
  temp: number // °C
  hum: number // %
  pres: number // hPa (nível da estação)
  wind: number // m/s, média da janela
  gust: number // m/s, maior média curta dentro da janela
  dir: number // graus, de onde o vento vem (0 = N, horário)
  rain: number // mm acumulados desde a leitura anterior
  vbat: number // V
  rssi: number // dBm
}

export type BatteryChem = 'li' | 'lfp' | 'lipo' | 'aa'

/** Configuração que o ESP32 baixa a cada ciclo. As duas últimas linhas só servem ao site. */
export interface StationConfig {
  interval_min: number
  wind_window_s: number
  gust_window_s: number
  samples: number
  wifi_timeout_s: number
  mm_per_tip: number
  k_wind: number
  dir_offset: number
  slow_below_v: number
  slow_factor: number
  critical_v: number
  send_every: number // envia a cada N leituras (lote)
  continuous_wind: number // 1 = conta o vento o ciclo todo em light sleep
  urgent_gust_kmh: number // 0 = desligado; acima disso envia na hora
  battery_chem: BatteryChem
  battery_mah: number
  version: number
}

export interface DaySummary {
  rain: number
  tmin: number
  tmax: number
  gust: number
}

export interface Station {
  id: string
  name: string
  city: string
  lat: number
  lon: number
  alt: number
  config: StationConfig
  latest: Reading | null
  day: DaySummary | null
}

export type Source = 'api' | 'demo'
