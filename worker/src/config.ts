import { CHEMS, type Config, DEFAULT_CONFIG, INTEGER_FIELDS, LIMITS } from './shared'

/** Aplica sobre `base` só os campos válidos de `input`, dentro dos limites. Estações antigas não têm os campos novos: completa com o padrão. */
export function cleanConfig(input: Record<string, unknown>, base: Config): Config {
  const out: Config = { ...DEFAULT_CONFIG, ...base }
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = input[k]
    if (typeof v === 'number' && Number.isFinite(v)) {
      const clamped = Math.min(hi, Math.max(lo, v))
      ;(out as unknown as Record<string, number>)[k] = INTEGER_FIELDS.includes(k) ? Math.round(clamped) : clamped
    }
  }
  if (typeof input.battery_chem === 'string' && CHEMS.includes(input.battery_chem)) out.battery_chem = input.battery_chem as Config['battery_chem']
  return out
}

/**
 * Pinos do ESP32-C3 que a estação aceita: o da chuva precisa acordar do deep sleep (0-5), o da bateria ser ADC1 (0-4),
 * nenhum se repete, e ficam de fora os de boot (8, 9), da USB (18, 19) e da flash (11-17). Devolve o problema ou null.
 * O firmware faz a mesma checagem e ignora um conjunto inválido.
 */
export function pinProblem(c: Config): string | null {
  const pins: [string, number][] = [['SDA', c.pin_sda], ['SCL', c.pin_scl], ['vento', c.pin_wind], ['chuva', c.pin_rain], ['bateria', c.pin_vbat]]
  for (const [name, p] of pins) {
    if (!((p >= 0 && p <= 7) || p === 10 || p === 20 || p === 21)) return `GPIO${p} não pode ser usado (${name}): 8 e 9 são de boot, 11 a 17 da flash e 18 e 19 da USB`
  }
  for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
    if (pins[i][1] === pins[j][1]) return `GPIO${pins[i][1]} está em ${pins[i][0]} e em ${pins[j][0]}`
  }
  if (c.pin_rain > 5) return 'o pino da chuva precisa acordar do deep sleep: GPIO0 a 5'
  if (c.pin_vbat > 4) return 'o pino da bateria precisa ser ADC1: GPIO0 a 4'
  return null
}
