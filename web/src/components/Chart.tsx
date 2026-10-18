import { useEffect, useRef, useState } from 'react'

export interface Pt { t: number; v: number }
export interface Series { label: string; color: string; points: Pt[]; fill?: boolean; bar?: boolean }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const nice = (min: number, max: number, ticks = 4) => {
  if (max - min < 1e-6) { max = min + 1 }
  const raw = (max - min) / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(6)))
  return out
}

const fmtTime = (t: number, span: number) => {
  const d = new Date(t * 1000)
  if (span > 36 * 3600) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  series: Series[]
  unit: string
  height?: number
  decimals?: number
  zeroBase?: boolean
}

export default function Chart({ series, unit, height = 200, decimals = 1, zeroBase = false }: Props) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.points)
  if (!all.length) return <div ref={ref} style={{ height }} />

  const m = { l: 40, r: 10, t: 8, b: 22 }
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t))
  let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v))
  if (zeroBase) lo = Math.min(0, lo)
  const ticks = nice(lo, hi)
  const yMin = ticks[0], yMax = ticks[ticks.length - 1]
  const x = (t: number) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r)
  const y = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (height - m.t - m.b)
  const base = y(Math.max(yMin, 0))

  const ref0 = series[0].points
  const idx = hover == null ? null : Math.min(ref0.length - 1, Math.max(0, hover))
  const nTicks = Math.max(2, Math.floor(W / 120))
  const xTicks = Array.from({ length: nTicks }, (_, i) => t0 + ((t1 - t0) * i) / (nTicks - 1))

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + ((e.clientX - r.left - m.l) / (W - m.l - m.r)) * (t1 - t0)
    let best = 0, bd = Infinity
    ref0.forEach((p, i) => { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = i } })
    setHover(best)
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg width={W} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y select-none">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#1d2529" />
            <text x={m.l - 6} y={y(v) + 3.5} textAnchor="end" className="num" fontSize="10" fill="#76838b">{v}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={height - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="num" fontSize="10" fill="#76838b">
            {fmtTime(t, t1 - t0)}
          </text>
        ))}
        {series.map((s) => {
          if (s.bar) {
            const bw = Math.max(2, ((W - m.l - m.r) / Math.max(1, s.points.length)) * 0.7)
            return (
              <g key={s.label} fill={s.color}>
                {s.points.map((p, i) => p.v > 0 && <rect key={i} x={x(p.t) - bw / 2} y={y(p.v)} width={bw} height={Math.max(1, base - y(p.v))} rx="1.5" opacity={idx === i ? 1 : 0.85} />)}
              </g>
            )
          }
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
          return (
            <g key={s.label}>
              {s.fill && <path d={`${d}L${x(s.points[s.points.length - 1].t)},${base}L${x(s.points[0].t)},${base}Z`} fill={s.color} opacity="0.14" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx={x(s.points[s.points.length - 1].t)} cy={y(s.points[s.points.length - 1].v)} r="3.5" fill={s.color} />
            </g>
          )
        })}
        {idx != null && <line x1={x(ref0[idx].t)} x2={x(ref0[idx].t)} y1={m.t} y2={height - m.b} stroke="#9ca9b0" strokeDasharray="3 3" />}
      </svg>
      {idx != null && (
        <div
          className="glass pointer-events-none absolute top-1 z-10 rounded-lg px-2.5 py-1.5 text-xs"
          style={{ left: Math.min(W - 150, Math.max(m.l, x(ref0[idx].t) + 10)) }}
        >
          <div className="num text-ink-3">{new Date(ref0[idx].t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          {series.map((s) => {
            const p = s.points[Math.min(idx, s.points.length - 1)]
            return (
              <div key={s.label} className="num flex items-center gap-1.5 text-ink">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {p.v.toFixed(decimals)} {unit} <span className="text-ink-3">{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
