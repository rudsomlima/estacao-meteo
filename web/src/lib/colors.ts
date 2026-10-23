const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

export const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** Cinza neutro: sensor desligado ou sem leitura (NaN, veja fixNulls em lib/api.ts) — nunca passa pra mix()/hex(), que não aceita NaN. */
const NO_SENSOR = '#64748b'

const ramp = (stops: string[], t: number) => {
  if (!Number.isFinite(t)) return NO_SENSOR
  const v = Math.min(0.999, Math.max(0, t)) * (stops.length - 1)
  const i = Math.floor(v)
  return mix(stops[i], stops[i + 1], v - i)
}

/** Cor do vento em km/h: azul, ciano, verde, amarelo, laranja e vermelho (0 a 60). */
export const windColor = (kmh: number) => ramp(['#3b82f6', '#38bdf8', '#4ade80', '#fbbf24', '#fb923c', '#ef4444'], kmh / 60)

/** Cor da temperatura em °C (5 a 36). */
export const tempColor = (c: number) => ramp(['#3b82f6', '#38bdf8', '#4ade80', '#fbbf24', '#fb923c', '#ef4444'], (c - 5) / 31)

/** Cor da chuva em mm nas últimas 24 h. */
export const rainColor = (mm: number) => (!Number.isFinite(mm) ? NO_SENSOR : mm <= 0.05 ? '#64748b' : ramp(['#7dd3fc', '#38bdf8', '#2563eb', '#7c3aed'], mm / 30))

export const batteryColor = (pct: number) => (pct < 15 ? '#f87171' : pct < 35 ? '#fbbf24' : '#4ade80')
