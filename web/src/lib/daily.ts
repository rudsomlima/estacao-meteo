import type { DailyRow, Reading } from '../types'

/** Resumo por dia local a partir das leituras (usado na demonstração; a API faz o mesmo no banco). */
export function aggregateDaily(readings: Reading[], tzMinutes: number): DailyRow[] {
  const map = new Map<string, Reading[]>()
  for (const r of readings) {
    const day = new Date((r.ts + tzMinutes * 60) * 1000).toISOString().slice(0, 10)
    const list = map.get(day)
    if (list) list.push(r)
    else map.set(day, [r])
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, rs]) => ({
    day,
    tmin: Math.min(...rs.map((r) => r.temp)),
    tmax: Math.max(...rs.map((r) => r.temp)),
    tavg: rs.reduce((s, r) => s + r.temp, 0) / rs.length,
    rain: rs.reduce((s, r) => s + r.rain, 0),
    gust: Math.max(...rs.map((r) => r.gust)),
    wind: rs.reduce((s, r) => s + r.wind, 0) / rs.length,
    pmin: Math.min(...rs.map((r) => r.pres)),
    pmax: Math.max(...rs.map((r) => r.pres)),
    n: rs.length,
  }))
}

export const localTzMinutes = () => -new Date().getTimezoneOffset()
