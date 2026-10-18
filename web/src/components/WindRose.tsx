import type { Reading } from '../types'
import { kmh, windRose } from '../lib/derive'

const COLORS = ['#3b82f6', '#38bdf8', '#4ade80', '#fbbf24', '#fb923c', '#f87171']
const colorFor = (kmhAvg: number) => COLORS[Math.min(COLORS.length - 1, Math.floor(kmhAvg / 8))]

export default function WindRose({ readings }: { readings: Reading[] }) {
  const bins = windRose(readings)
  const max = Math.max(0.001, ...bins.map((b) => b.freq))
  const R = 92, C = 120
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [C + Math.cos(a) * r, C + Math.sin(a) * r]
  }
  const wedge = (i: number, r: number) => {
    const [x0, y0] = pt(i * 22.5 - 9, r)
    const [x1, y1] = pt(i * 22.5 + 9, r)
    return `M${C},${C}L${x0},${y0}A${r},${r} 0 0 1 ${x1},${y1}Z`
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 240 240" className="w-full max-w-[300px]">
        {[0.25, 0.5, 0.75, 1].map((f) => <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="#1d2529" />)}
        {[0, 90, 180, 270].map((d) => { const [x, y] = pt(d, R); return <line key={d} x1={C} y1={C} x2={x} y2={y} stroke="#1d2529" /> })}
        {bins.map((b, i) => b.freq > 0 && (
          <path key={i} d={wedge(i, 6 + Math.sqrt(b.freq / max) * (R - 6))} fill={colorFor(kmh(b.avg))} opacity="0.9">
            <title>{`${(b.freq * 100).toFixed(0)} % do tempo, média ${kmh(b.avg).toFixed(0)} km/h`}</title>
          </path>
        ))}
        {[['N', 0], ['L', 90], ['S', 180], ['O', 270]].map(([t, d]) => {
          const [x, y] = pt(d as number, R + 12)
          return <text key={t} x={x} y={y + 4} textAnchor="middle" className="num" fontSize="11" fill={t === 'N' ? '#fb923c' : '#9ca9b0'}>{t}</text>
        })}
      </svg>
      <div className="num flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {COLORS.map((c, i) => <span key={c} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{i * 8}{i === COLORS.length - 1 ? '+' : ''}</span>)}
        <span>km/h</span>
      </div>
    </div>
  )
}
