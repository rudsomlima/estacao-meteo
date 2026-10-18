import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { dewPoint, kmh } from '../lib/derive'
import type { Reading } from '../types'
import Chart, { type Pt } from './Chart'
import Reveal, { SectionHead } from './Reveal'
import WindRose from './WindRose'

const RANGES = [
  { h: 6, label: '6 h' },
  { h: 24, label: '24 h' },
  { h: 168, label: '7 dias' },
]

const pts = (rs: Reading[], f: (r: Reading) => number): Pt[] => rs.map((r) => ({ t: r.ts, v: f(r) }))

function bucketRain(rs: Reading[], hours: number): Pt[] {
  if (!rs.length) return []
  const size = (hours * 3600) / 24
  const end = rs[rs.length - 1].ts
  const out: Pt[] = Array.from({ length: 24 }, (_, i) => ({ t: end - (23 - i) * size, v: 0 }))
  for (const r of rs) {
    const i = 23 - Math.floor((end - r.ts) / size)
    if (i >= 0 && i < 24) out[i].v += r.rain
  }
  return out.map((p) => ({ t: p.t, v: Number(p.v.toFixed(2)) }))
}

function Card({ title, sub, children, className = '' }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <Reveal className={`rounded-2xl border border-line bg-card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
        {sub && <span className="num text-xs text-ink-3">{sub}</span>}
      </div>
      {children}
    </Reveal>
  )
}

export default function Trends({ readings }: { readings: Reading[] }) {
  const [hours, setHours] = useState(24)
  const rs = useMemo(() => {
    const end = readings[readings.length - 1].ts
    return readings.filter((r) => r.ts >= end - hours * 3600)
  }, [readings, hours])
  const rainTotal = rs.reduce((s, r) => s + r.rain, 0)

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead id="tendencias" kicker="Tendências" title="O que mudou no período">
          Passe o dedo ou o mouse sobre um gráfico para ver o valor de cada leitura.
        </SectionHead>
        <div role="tablist" aria-label="Período" className="relative flex rounded-xl border border-line bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.h}
              role="tab"
              aria-selected={hours === r.h}
              onClick={() => setHours(r.h)}
              className={`num relative z-10 rounded-lg px-4 py-1.5 text-sm transition-colors ${hours === r.h ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
            >
              {hours === r.h && <motion.span layoutId="range" className="absolute inset-0 -z-10 rounded-lg bg-card-hover ring-1 ring-line-hover" transition={{ type: 'spring', duration: 0.4 }} />}
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card title="Temperatura" sub="°C">
          <Chart unit="°C" series={[
            { label: 'ar', color: '#fb923c', points: pts(rs, (r) => r.temp), fill: true },
            { label: 'orvalho', color: '#38bdf8', points: pts(rs, (r) => dewPoint(r.temp, r.hum)) },
          ]} />
        </Card>
        <Card title="Umidade" sub="%">
          <Chart unit="%" decimals={0} series={[{ label: 'umidade', color: '#38bdf8', points: pts(rs, (r) => r.hum), fill: true }]} />
        </Card>
        <Card title="Vento" sub="km/h · média e rajada">
          <Chart unit="km/h" decimals={0} zeroBase series={[
            { label: 'rajada', color: '#f87171', points: pts(rs, (r) => kmh(r.gust)) },
            { label: 'média', color: '#60a5fa', points: pts(rs, (r) => kmh(r.wind)), fill: true },
          ]} />
        </Card>
        <Card title="Pressão" sub="hPa · queda rápida indica mau tempo">
          <Chart unit="hPa" series={[{ label: 'pressão', color: '#a78bfa', points: pts(rs, (r) => r.pres), fill: true }]} />
        </Card>
        <Card title="Chuva" sub={`${rainTotal.toFixed(1)} mm no período`}>
          <Chart unit="mm" decimals={1} zeroBase series={[{ label: 'chuva', color: '#38bdf8', bar: true, points: bucketRain(rs, hours) }]} />
        </Card>
        <Card title="De onde vem o vento" sub="tempo em cada direção">
          <WindRose readings={rs} />
        </Card>
      </div>
    </section>
  )
}
