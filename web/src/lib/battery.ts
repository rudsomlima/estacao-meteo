import type { BatteryChem } from '../types'

export interface Chem {
  label: string
  min: number // tensão vazia
  max: number // tensão cheia
  color: string
  slow_below_v: number // sugestão: espaçar envios abaixo disso
  critical_v: number // sugestão: hibernar abaixo disso
  curve: [number, number][] // tensão em repouso -> % de carga
}

const LI: [number, number][] = [[3.0, 0], [3.3, 5], [3.5, 15], [3.6, 28], [3.7, 45], [3.8, 60], [3.9, 72], [4.0, 85], [4.1, 94], [4.2, 100]]

export const CHEMS: Record<BatteryChem, Chem> = {
  li: { label: 'Li-ion 18650', min: 3.0, max: 4.2, color: '#4ade80', slow_below_v: 3.55, critical_v: 3.2, curve: LI },
  lfp: {
    label: 'LiFePO4', min: 2.8, max: 3.6, color: '#60a5fa', slow_below_v: 3.1, critical_v: 2.9,
    curve: [[2.8, 0], [3.0, 5], [3.2, 20], [3.25, 40], [3.3, 70], [3.35, 90], [3.45, 97], [3.6, 100]],
  },
  lipo: { label: 'LiPo 1S', min: 3.3, max: 4.2, color: '#c084fc', slow_below_v: 3.6, critical_v: 3.35, curve: LI.map(([v, p]) => [Math.max(v, 3.3), p] as [number, number]) },
  aa: {
    label: '2× AA alcalina', min: 2.0, max: 3.2, color: '#fbbf24', slow_below_v: 2.3, critical_v: 2.1,
    curve: [[2.0, 0], [2.2, 10], [2.4, 25], [2.6, 45], [2.8, 65], [3.0, 85], [3.2, 100]],
  },
}

export const CHEM_KEYS = Object.keys(CHEMS) as BatteryChem[]

export function batteryPct(v: number, chem: BatteryChem) {
  const c = CHEMS[chem].curve
  if (v <= c[0][0]) return 0
  for (let i = 1; i < c.length; i++) {
    if (v <= c[i][0]) {
      const [v0, p0] = c[i - 1], [v1, p1] = c[i]
      return Math.round(p0 + ((v - v0) / (v1 - v0)) * (p1 - p0))
    }
  }
  return 100
}
