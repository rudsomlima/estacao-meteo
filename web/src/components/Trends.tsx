import { GripVertical } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { putLayout } from '../lib/admin'
import { fetchLayout } from '../lib/api'
import { dewPoint } from '../lib/derive'
import { useIsAdmin } from '../lib/session'
import { useFmt } from '../lib/units'
import type { Reading } from '../types'
import Chart, { type Pt } from './Chart'
import Reveal, { SectionHead } from './Reveal'
import WindRose from './WindRose'

const RANGES = [
  { h: 1, label: '1 h' },
  { h: 6, label: '6 h' },
  { h: 24, label: '24 h' },
  { h: 168, label: '7 dias' },
]

type CardKey = 'temp' | 'hum' | 'wind' | 'pres' | 'rain' | 'windrose'
const DEFAULT_ORDER: CardKey[] = ['temp', 'hum', 'wind', 'pres', 'rain', 'windrose']

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

/** Busca a ordem salva no servidor uma vez; se não vier nada válido, fica no padrão. */
function useCardOrder() {
  const [order, setOrder] = useState<CardKey[]>(DEFAULT_ORDER)
  useEffect(() => {
    let alive = true
    void fetchLayout().then((r) => {
      if (alive && Array.isArray(r.order) && r.order.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((k) => r.order.includes(k))) {
        setOrder(r.order as CardKey[])
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return [order, setOrder] as const
}

export default function Trends({ readings }: { readings: Reading[] }) {
  const [hours, setHours] = useState(24)
  const [order, setOrder] = useCardOrder()
  const [dragging, setDragging] = useState<CardKey | null>(null)
  const isAdmin = useIsAdmin()
  const f = useFmt()
  const rs = useMemo(() => {
    const end = readings[readings.length - 1].ts
    return readings.filter((r) => r.ts >= end - hours * 3600)
  }, [readings, hours])
  const rainTotal = rs.reduce((s, r) => s + r.rain, 0)

  const move = (from: CardKey, to: CardKey) => {
    if (from === to) return
    const next = order.filter((k) => k !== from)
    next.splice(next.indexOf(to), 0, from)
    setOrder(next)
    void putLayout(next).catch(() => {}) // se falhar, fica assim só nesta visita
  }

  const cards: Record<CardKey, React.ReactNode> = {
    temp: (
      <Card title="Temperatura" sub={f.tempUnit}>
        <Chart unit={f.tempUnit} series={[
          { label: 'ar', color: '#fb923c', points: pts(rs, (r) => f.tempNum(r.temp)), fill: true },
          { label: 'orvalho', color: '#38bdf8', points: pts(rs, (r) => f.tempNum(dewPoint(r.temp, r.hum))) },
        ]} />
      </Card>
    ),
    hum: (
      <Card title="Umidade" sub="%">
        <Chart unit="%" decimals={0} series={[{ label: 'umidade', color: '#38bdf8', points: pts(rs, (r) => r.hum), fill: true }]} />
      </Card>
    ),
    wind: (
      <Card title="Vento" sub={`${f.windUnit} · média e rajada`}>
        <Chart unit={f.windUnit} decimals={f.windUnit === 'm/s' ? 1 : 0} zeroBase series={[
          { label: 'rajada', color: '#f87171', points: pts(rs, (r) => f.windNum(r.gust)) },
          { label: 'média', color: '#60a5fa', points: pts(rs, (r) => f.windNum(r.wind)), fill: true },
        ]} />
      </Card>
    ),
    pres: (
      <Card title="Pressão" sub={`${f.presUnit} · queda rápida indica mau tempo`}>
        <Chart unit={f.presUnit} decimals={f.presUnit === 'inHg' ? 2 : 1} series={[{ label: 'pressão', color: '#a78bfa', points: pts(rs, (r) => f.presNum(r.pres)), fill: true }]} />
      </Card>
    ),
    rain: (
      <Card title="Chuva" sub={`${f.rain(rainTotal)} no período`}>
        <Chart unit={f.rainUnit} decimals={f.rainUnit === 'pol' ? 2 : 1} zeroBase series={[{ label: 'chuva', color: '#38bdf8', bar: true, points: bucketRain(rs, hours).map((p) => ({ t: p.t, v: f.rainNum(p.v) })) }]} />
      </Card>
    ),
    windrose: (
      <Card title="De onde vem o vento" sub="tempo em cada direção">
        <WindRose readings={rs} />
      </Card>
    ),
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead id="tendencias" kicker="Tendências" title="O que mudou no período">
          Passe o dedo ou o mouse sobre um gráfico para ver o valor de cada leitura.
          {isAdmin && ' Arraste um cartão pela alça para reordenar — a ordem fica salva para todo mundo.'}
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
        {order.map((key) => (
          <div
            key={key}
            className={`relative ${dragging === key ? 'opacity-40' : ''}`}
            onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
            onDrop={isAdmin ? (e) => { e.preventDefault(); if (dragging) move(dragging, key) } : undefined}
          >
            {isAdmin && (
              <button
                aria-label="Arrastar para reordenar"
                draggable
                onDragStart={() => setDragging(key)}
                onDragEnd={() => setDragging(null)}
                className="absolute -left-1 -top-1 z-10 cursor-grab touch-none rounded-lg border border-line bg-card p-1 text-ink-3 hover:text-ink active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {cards[key]}
          </div>
        ))}
      </div>
    </section>
  )
}
