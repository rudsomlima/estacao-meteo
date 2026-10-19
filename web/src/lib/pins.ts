import type { StationConfig } from '../types'

/** Sensores de ambiente que a estação sabe ler. */
export const ENV_SENSORS = [
  { id: 0, label: 'Nenhum (só o sinal de vida)', hint: 'A estação não mede o ambiente; manda bateria e sinal de Wi-Fi no intervalo configurado.' },
  { id: 1, label: 'BME280 · temperatura, umidade e pressão', hint: 'I²C, endereço 0x76 (ou 0x77).' },
  { id: 2, label: 'MS5611 (GY-63) · temperatura e pressão', hint: 'I²C, endereço 0x77 (CSB no GND) ou 0x76. Não mede umidade: o site mostra "—".' },
  { id: 3, label: 'BME280 + MS5611 · umidade do BME, pressão do MS5611', hint: 'Os dois no mesmo barramento: BME280 em 0x76 (SDO no GND) e MS5611 em 0x77 (CSB no GND).' },
] as const

export type PinKey = 'pin_sda' | 'pin_scl' | 'pin_wind' | 'pin_rain' | 'pin_vbat'

export const PIN_DEFAULTS: Record<PinKey, number> = { pin_sda: 6, pin_scl: 7, pin_wind: 4, pin_rain: 3, pin_vbat: 0 }

export const PINS: { key: PinKey; label: string; hint: string }[] = [
  { key: 'pin_sda', label: 'SDA (I²C)', hint: 'Dados dos sensores BME280, MS5611 e da bússola.' },
  { key: 'pin_scl', label: 'SCL (I²C)', hint: 'Clock dos mesmos sensores.' },
  { key: 'pin_wind', label: 'Anemômetro', hint: 'Entrada do Hall do rotor, com pull-up externo.' },
  { key: 'pin_rain', label: 'Pluviômetro', hint: 'Precisa acordar o chip do deep sleep: GPIO0 a 5.' },
  { key: 'pin_vbat', label: 'Bateria (ADC)', hint: 'Divisor de tensão da bateria: GPIO0 a 4 (ADC1).' },
]

/** GPIOs do ESP32-C3 oferecidos nas listas: 8 e 9 são de boot, 11 a 17 da flash, 18 e 19 da USB. */
export const USABLE_PINS = [0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21]

export const pinValue = (c: StationConfig, k: PinKey) => c[k] ?? PIN_DEFAULTS[k]

/** Mesmas regras do servidor e do firmware. Devolve o problema ou null. */
export function pinProblem(c: StationConfig): string | null {
  const used = PINS.map((p) => ({ ...p, v: pinValue(c, p.key) }))
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      if (used[i].v === used[j].v) return `GPIO${used[i].v} está em "${used[i].label}" e em "${used[j].label}": cada função precisa de um pino só dela.`
    }
  }
  if (pinValue(c, 'pin_rain') > 5) return 'O pluviômetro precisa de um pino que acorde do deep sleep: GPIO0 a 5.'
  if (pinValue(c, 'pin_vbat') > 4) return 'A bateria precisa de um pino ADC1: GPIO0 a 4.'
  return null
}
