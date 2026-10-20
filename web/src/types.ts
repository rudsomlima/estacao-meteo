/** Uma leitura enviada pelo ESP32 a cada ciclo. Vento em m/s, chuva em mm desde a leitura anterior. */
export interface Reading {
  ts: number // unix, segundos
  temp: number // °C
  hum: number // % (NaN quando o sensor não mede umidade, como o MS5611)
  pres: number // hPa (nível da estação)
  wind: number // m/s, média da janela
  gust: number // m/s, maior média curta dentro da janela
  dir: number // graus, de onde o vento vem (0 = N, horário)
  rain: number // mm acumulados desde a leitura anterior
  vbat: number // V
  rssi: number // dBm
  /** "h": média de uma hora (histórico longo); sem isso é uma leitura da estação */
  agg?: 'h'
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
  charge_above_v: number // 0 = desligado; acima disso a estação considera que está carregando
  charge_interval_min: number // intervalo enquanto carrega
  send_every: number // envia a cada N leituras (lote)
  continuous_wind: number // 1 = conta o vento o ciclo todo em light sleep
  urgent_gust_kmh: number // 0 = desligado; acima disso envia na hora
  bench_min: number // minutos do modo bancada ao ligar (0 = desligado)
  env_sensor?: number // 0 nenhum, 1 BME280, 2 MS5611 (GY-63), 3 BME280 + MS5611
  pin_sda?: number // pinos do ESP32-C3 (GPIO)
  pin_scl?: number
  pin_wind?: number
  pin_rain?: number
  pin_vbat?: number
  wifi_tx_save?: number // 1 = a estação reduz sozinha a potência de transmissão do Wi-Fi quando o sinal é bom
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
  /** versão da configuração que a estação disse ter na última vez que enviou */
  cfg_applied: number
  last_seen: number | null
  fw_version: string | null
  /** bateria (V) e sinal Wi-Fi (dBm) do último contato, mesmo quando a placa não mediu nada */
  vbat: number | null
  rssi: number | null
  latest: Reading | null
  day: DaySummary | null
  /** o usuário logado pode alterar esta estação (é o dono, ou administrador) */
  can_edit?: boolean
  /** só vem para o administrador */
  owner_email?: string | null
  /** quando a estação confirmou a versão atual da configuração */
  cfg_applied_at?: number | null
  /** versão da configuração entregue por último à estação e quando foi entregue pela primeira vez */
  cfg_sent?: number | null
  cfg_sent_at?: number | null
  /** comando pedido pelo administrador (reinício) e as etapas: pedido, entregue à estação, confirmado por ela */
  command?: StationCommand | null
}

export interface StationCommand { name: string; at: number | null; sent: number | null; done: number | null }

/** Um dia local resumido (do endpoint /daily). */
export interface DailyRow {
  day: string // AAAA-MM-DD
  tmin: number; tmax: number; tavg: number
  rain: number; gust: number; wind: number
  pmin: number; pmax: number; n: number
}

export interface StationEvent {
  ts: number
  kind: 'boot' | 'ota_fail' | 'ota_ok' | 'bench' | 'info'
  [k: string]: unknown
}

export interface FirmwareInfo {
  published: { version: string; size: number; sha256: string; uploaded_at: number } | null
  installed: string | null
}

export type Source = 'api' | 'demo'
