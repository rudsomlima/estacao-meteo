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
