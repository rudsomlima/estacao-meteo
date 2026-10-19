import { useMemo } from 'react'
import { type Prefs, usePrefs } from './prefs'

const WIND: Record<Prefs['wind'], { f: number; label: string }> = {
  kmh: { f: 3.6, label: 'km/h' },
  ms: { f: 1, label: 'm/s' },
  kn: { f: 1.943844, label: 'nós' },
  mph: { f: 2.236936, label: 'mph' },
}
const PRES: Record<Prefs['pres'], { f: number; label: string; d: number }> = {
  hpa: { f: 1, label: 'hPa', d: 0 },
  inhg: { f: 0.02953, label: 'inHg', d: 2 },
  mmhg: { f: 0.750062, label: 'mmHg', d: 0 },
}

export const WIND_LABELS: Record<Prefs['wind'], string> = { kmh: 'km/h', ms: 'm/s', kn: 'nós', mph: 'mph' }

/** Conversões e formatação conforme as unidades escolhidas. Os dados chegam sempre em m/s, °C, mm e hPa. */
export function makeFmt(p: Pick<Prefs, 'wind' | 'temp' | 'rain' | 'pres'>) {
  const w = WIND[p.wind]
  const pr = PRES[p.pres]
  const tempNum = (c: number) => (p.temp === 'f' ? (c * 9) / 5 + 32 : c)
  // temperatura sempre com uma casa decimal (inclusive 0.0); "-0.0" vira "0.0"
  const t1 = (c: number) => { const x = tempNum(c).toFixed(1); return x === '-0.0' ? '0.0' : x }
  const rainNum = (mm: number) => (p.rain === 'in' ? mm / 25.4 : mm)
  const windNum = (ms: number) => ms * w.f
  const presNum = (h: number) => h * pr.f
  const rainDigits = p.rain === 'in' ? 2 : 1
  return {
    windUnit: w.label,
    tempUnit: p.temp === 'f' ? '°F' : '°C',
    rainUnit: p.rain === 'in' ? 'pol' : 'mm',
    presUnit: pr.label,
    windNum, tempNum, rainNum, presNum,
    wind: (ms: number, d = 0) => `${windNum(ms).toFixed(d)} ${w.label}`,
    windV: (ms: number, d = 0) => windNum(ms).toFixed(d),
    temp: (c: number) => `${t1(c)}${p.temp === 'f' ? '°F' : '°C'}`,
    tempV: (c: number) => t1(c),
    tempShort: (c: number) => `${t1(c)}°`,
    rain: (mm: number, d = rainDigits) => `${rainNum(mm).toFixed(d)} ${p.rain === 'in' ? 'pol' : 'mm'}`,
    rainRate: (mm: number, d = rainDigits) => `${rainNum(mm).toFixed(d)} ${p.rain === 'in' ? 'pol' : 'mm'}/h`,
    pres: (h: number) => `${presNum(h).toFixed(pr.d)} ${pr.label}`,
    /** escala de cores é sempre em km/h */
    windKmh: (ms: number) => ms * 3.6,
  }
}

export type Fmt = ReturnType<typeof makeFmt>

/** Formatadores ligados às unidades escolhidas: a tela se redesenha quando o usuário troca. */
export function useFmt(): Fmt {
  const p = usePrefs()
  return useMemo(() => makeFmt(p), [p.wind, p.temp, p.rain, p.pres]) // eslint-disable-line react-hooks/exhaustive-deps
}
