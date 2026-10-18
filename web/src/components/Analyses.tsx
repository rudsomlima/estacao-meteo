import { useMemo, useState } from 'react'
import { useDaily, useMultiReadings } from '../hooks/useNetwork'
import { useFmt } from '../lib/units'
import type { DailyRow, Reading, Source, Station } from '../types'
import Chart, { type Pt } from './Chart'
import { SectionHead } from './Reveal'

const COLORS = ['#38bdf8', '#fb923c', '#4ade80']
const RANGES = [{ h: 24, label: '24 h' }, { h: 72, label: '3 dias' }, { h: 168, label: '7 dias' }]
type Metric = 'temp' | 'hum' | 'wind' | 'gust' | 'pres' | 'vbat'
const METRICS: [Metric, string][] = [['temp', 'Temperatura'], ['hum', 'Umidade'], ['wind', 'Vento'], ['gust', 'Rajada'], ['pres', 'Pressão'], ['vbat', 'Bateria']]

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function Compare({ stations, source }: { stations: Station[]; source: Source }) {
  const f = useFmt()
  const [ids, setIds] = useState<string[]>(() => stations.slice(0, 2).map((s) => s.id))
  const [metric, setMetric] = useState<Metric>('temp')
  const [hours, setHours] = useState(24)
  const { data, loading } = useMultiReadings(ids, source, hours)

  const conv = (r: Reading): number => {
    switch (metric) {
      case 'temp': return f.tempNum(r.temp)
      case 'wind': return f.windNum(r.wind)
      case 'gust': return f.windNum(r.gust)
      case 'pres': return f.presNum(r.pres)
      default: return r[metric]
    }
  }
  const unit = { temp: f.tempUnit, hum: '%', wind: f.windUnit, gust: f.windUnit, pres: f.presUnit, vbat: 'V' }[metric]
  const decimals = metric === 'vbat' ? 2 : metric === 'hum' || ((metric === 'wind' || metric === 'gust') && unit !== 'm/s') ? 0 : metric === 'pres' && unit === 'inHg' ? 2 : 1

  const series = ids.map((id, i) => ({
    label: stations.find((s) => s.id === id)?.name ?? id,
    color: COLORS[i % COLORS.length],
    points: (data[id] ?? []).map((r): Pt => ({ t: r.ts, v: conv(r) })),
  }))

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]))
  const stats = series.map((s) => {
    const v = s.points.map((p) => p.v)
    return { ...s, min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / (v.length || 1), n: v.length }
  })

  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {stations.map((s) => {
          const i = ids.indexOf(s.id)
          return (
            <button
              key={s.id} onClick={() => toggle(s.id)} aria-pressed={i >= 0} disabled={i < 0 && ids.length >= 3}
              className={`num flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 ${i >= 0 ? 'border-line-hover text-ink' : 'border-line text-ink-3 hover:text-ink'}`}
            >
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i >= 0 ? COLORS[i % COLORS.length] : 'transparent', border: '1px solid currentColor' }} />
              {s.name}
            </button>
          )
        })}
        <span className="num text-xs text-ink-3">até 3</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Medida" className="flex flex-wrap gap-1">
          {METRICS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={metric === k} onClick={() => setMetric(k)}
              className={`rounded-lg px-3 py-1.5 text-sm ${metric === k ? 'bg-card-hover text-ink ring-1 ring-line-hover' : 'text-ink-3 hover:text-ink-2'}`}>{label}</button>
          ))}
        </div>
        <div role="tablist" aria-label="Período" className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.h} role="tab" aria-selected={hours === r.h} onClick={() => setHours(r.h)}
              className={`num rounded-lg px-3 py-1.5 text-sm ${hours === r.h ? 'bg-card-hover text-ink ring-1 ring-line-hover' : 'text-ink-3 hover:text-ink-2'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {ids.length === 0 ? <p className="py-10 text-center text-sm text-ink-3">Escolha ao menos uma estação.</p>
          : loading ? <p className="py-10 text-center text-sm text-ink-3">Carregando…</p>
          : <Chart unit={unit} decimals={decimals} height={260} zeroBase={metric === 'wind' || metric === 'gust'} series={series} />}
      </div>

      {stats.length > 0 && !loading && (
        <div className="mt-4 overflow-x-auto">
          <table className="num w-full min-w-[420px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-3"><th className="py-2 pr-3">Estação</th><th className="pr-3">Mínimo</th><th className="pr-3">Média</th><th>Máximo</th></tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.label} className="border-t border-line">
                  <td className="py-2 pr-3"><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</td>
                  {s.n ? <><td className="pr-3">{s.min.toFixed(decimals)} {unit}</td><td className="pr-3">{s.avg.toFixed(decimals)} {unit}</td><td>{s.max.toFixed(decimals)} {unit}</td></> : <td colSpan={3} className="text-ink-3">sem leituras</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Cor do calendário: do azul (frio) ao laranja (quente) pela temperatura média do dia. */
function heat(t: number) {
  const k = Math.max(0, Math.min(1, (t - 5) / 30))
  const h = 210 - k * 190
  return `hsl(${h} 70% ${30 + k * 20}%)`
}

function Summary({ stations, source }: { stations: Station[]; source: Source }) {
  const f = useFmt()
  const [id, setId] = useState(stations[0]?.id ?? '')
  const { rows, loading } = useDaily(id || null, source, 365)
  const [month, setMonth] = useState<string | null>(null)

  const byMonth = useMemo(() => {
    const m = new Map<string, DailyRow[]>()
    for (const r of rows) {
      const k = r.day.slice(0, 7)
      const l = m.get(k)
      if (l) l.push(r)
      else m.set(k, [r])
    }
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, list]) => ({
      key: k,
      days: list.length,
      tmin: Math.min(...list.map((d) => d.tmin)),
      tmax: Math.max(...list.map((d) => d.tmax)),
      tavg: list.reduce((s, d) => s + d.tavg, 0) / list.length,
      rain: list.reduce((s, d) => s + d.rain, 0),
      rainDays: list.filter((d) => d.rain >= 1).length,
      gust: Math.max(...list.map((d) => d.gust)),
      list,
    }))
  }, [rows])

  const sel = byMonth.find((m) => m.key === month) ?? byMonth[byMonth.length - 1]
  const year = useMemo(() => ({
    rain: byMonth.reduce((s, m) => s + m.rain, 0),
    tmin: byMonth.length ? Math.min(...byMonth.map((m) => m.tmin)) : 0,
    tmax: byMonth.length ? Math.max(...byMonth.map((m) => m.tmax)) : 0,
    gust: byMonth.length ? Math.max(...byMonth.map((m) => m.gust)) : 0,
    days: byMonth.reduce((s, m) => s + m.days, 0),
  }), [byMonth])

  // calendário do mês escolhido (semana começa no domingo)
  const cal = useMemo(() => {
    if (!sel) return []
    const [y, mo] = sel.key.split('-').map(Number)
    const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay()
    const total = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    const map = new Map(sel.list.map((d) => [Number(d.day.slice(8)), d]))
    return [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => map.get(i + 1) ?? ({ day: i + 1 } as unknown as DailyRow & { empty: true }))]
  }, [sel])

  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <label className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
        Estação
        <select value={id} onChange={(e) => { setId(e.target.value); setMonth(null) }} className="num rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink">
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>

      {loading ? <p className="py-10 text-center text-sm text-ink-3">Carregando…</p> : byMonth.length === 0 ? <p className="py-10 text-center text-sm text-ink-3">Ainda não há dias completos para resumir.</p> : (
        <>
          <dl className="num mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Chuva no período', f.rain(year.rain)],
              ['Mínima', f.temp(year.tmin)],
              ['Máxima', f.temp(year.tmax)],
              ['Maior rajada', f.wind(year.gust)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line p-3"><dt className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{k}</dt><dd className="mt-1 text-lg">{v}</dd></div>
            ))}
          </dl>
          <p className="num mt-2 text-xs text-ink-3">{year.days} dias com leituras, até 365.</p>

          <div className="mt-5 overflow-x-auto">
            <table className="num w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-3"><th className="py-2 pr-3">Mês</th><th className="pr-3">Média</th><th className="pr-3">Mín / Máx</th><th className="pr-3">Chuva</th><th className="pr-3">Dias de chuva</th><th>Rajada</th></tr></thead>
              <tbody>
                {byMonth.map((m) => (
                  <tr key={m.key} onClick={() => setMonth(m.key)} className={`cursor-pointer border-t border-line hover:bg-card-hover ${sel?.key === m.key ? 'bg-card-hover' : ''}`}>
                    <td className="py-2 pr-3">{MONTHS[Number(m.key.slice(5)) - 1]}/{m.key.slice(2, 4)}</td>
                    <td className="pr-3">{f.temp(m.tavg)}</td>
                    <td className="pr-3">{f.tempShort(m.tmin)} / {f.tempShort(m.tmax)}</td>
                    <td className="pr-3">{f.rain(m.rain)}</td>
                    <td className="pr-3">{m.rainDays}</td>
                    <td>{f.wind(m.gust)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sel && (
            <div className="mt-6">
              <h3 className="font-display text-lg font-semibold">Calendário · {MONTHS[Number(sel.key.slice(5)) - 1]}/{sel.key.slice(0, 4)}</h3>
              <p className="text-xs text-ink-3">Cor pela temperatura média do dia. Passe o mouse para ver os valores.</p>
              <div className="mt-3 grid max-w-md grid-cols-7 gap-1.5" role="grid" aria-label="Calendário do mês">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i} className="num text-center text-[10px] text-ink-3">{d}</span>)}
                {cal.map((d, i) => d === null ? <span key={i} /> : 'tavg' in d ? (
                  <div
                    key={i} tabIndex={0} role="gridcell"
                    title={`${d.day.slice(8)}/${d.day.slice(5, 7)}: ${f.temp(d.tavg)} (${f.tempShort(d.tmin)} a ${f.tempShort(d.tmax)}), chuva ${f.rain(d.rain)}, rajada ${f.wind(d.gust)}`}
                    className="num relative grid aspect-square place-items-center rounded-md text-[11px] text-white"
                    style={{ background: heat(d.tavg) }}
                  >
                    {d.day.slice(8).replace(/^0/, '')}
                    {d.rain >= 1 && <i className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-cyan" />}
                  </div>
                ) : (
                  <div key={i} className="num grid aspect-square place-items-center rounded-md border border-line text-[11px] text-ink-3">{(d as unknown as { day: number }).day}</div>
                ))}
              </div>
              <p className="num mt-2 flex items-center gap-2 text-[11px] text-ink-3">
                <i className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${heat(5)}, ${heat(20)}, ${heat(35)})` }} /> {f.tempShort(5)} a {f.tempShort(35)} · <i className="h-1.5 w-1.5 rounded-full bg-cyan" /> choveu 1 mm ou mais
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Analyses({ stations, source }: { stations: Station[]; source: Source }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-24 sm:px-6">
      <p className="num text-xs text-ink-3">Rede inteira</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Análises</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Compare estações lado a lado e veja o resumo de cada mês.</p>

      <div className="mt-10 grid gap-12">
        <section>
          <SectionHead id="comparar" kicker="Comparar" title="Estações lado a lado">Escolha até três estações e uma medida.</SectionHead>
          <div className="mt-6">{stations.length ? <Compare stations={stations} source={source} /> : <p className="text-sm text-ink-3">Nenhuma estação cadastrada.</p>}</div>
        </section>
        <section>
          <SectionHead id="resumo" kicker="Resumo" title="Mês a mês">Totais de chuva, extremos de temperatura e um calendário colorido.</SectionHead>
          <div className="mt-6">{stations.length ? <Summary stations={stations} source={source} /> : <p className="text-sm text-ink-3">Nenhuma estação cadastrada.</p>}</div>
        </section>
      </div>
    </div>
  )
}
