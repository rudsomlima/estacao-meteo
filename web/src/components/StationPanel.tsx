import { ArrowRight, X } from 'lucide-react'
import { useMemo } from 'react'
import { useReadings } from '../hooks/useNetwork'
import { go } from '../hooks/useRoute'
import { batteryColor } from '../lib/colors'
import { batteryPct, CHEMS } from '../lib/battery'
import { ago, compass16, isOnline, kmh } from '../lib/derive'
import type { Source, Station } from '../types'

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-11" />
  const lo = Math.min(...values), hi = Math.max(...values), span = Math.max(0.5, hi - lo)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 220},${40 - ((v - lo) / span) * 34}`).join(' ')
  return (
    <svg viewBox="0 0 220 44" className="h-11 w-full" role="img" aria-label="Temperatura nas últimas 24 horas">
      <polyline points={`0,44 ${pts} 220,44`} fill={color} opacity="0.14" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export default function StationPanel({ station: s, source, onClose }: { station: Station; source: Source; onClose: () => void }) {
  const { readings } = useReadings(s.id, source, 24)
  const l = s.latest
  const on = isOnline(s)
  const chem = CHEMS[s.config.battery_chem]
  const pct = l ? batteryPct(l.vbat, s.config.battery_chem) : 0
  const temps = useMemo(() => readings.filter((_, i) => i % 3 === 0).map((r) => r.temp), [readings])

  return (
    <aside className="glass absolute inset-x-3 bottom-3 z-20 rounded-2xl p-4 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[300px]" aria-label={`Resumo de ${s.name}`}>
      <button onClick={onClose} aria-label="Fechar resumo" className="absolute right-3 top-3 rounded-lg p-1 text-ink-2 hover:bg-card-hover hover:text-ink"><X className="h-4 w-4" /></button>
      <h2 className="pr-8 font-display text-xl font-bold tracking-tight">{s.name}</h2>
      <p className="num text-xs text-ink-3">{s.city} · {s.alt.toFixed(0)} m</p>
      {l ? (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="font-display text-5xl font-extrabold leading-none tracking-tight">{l.temp.toFixed(1)}<span className="text-xl font-medium text-ink-2">°C</span></div>
            <span className={`num rounded-full px-2 py-0.5 text-[11px] ${on ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}>{on ? 'online' : 'sem sinal'} · {ago(l.ts)}</span>
          </div>
          <Spark values={temps} color="#38bdf8" />
          <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-3">Vento</dt><dd>{Math.round(kmh(l.wind))} km/h {compass16(l.dir)}</dd>
            <dt className="text-ink-3">Rajada</dt><dd>{Math.round(kmh(l.gust))} km/h</dd>
            <dt className="text-ink-3">Umidade</dt><dd>{Math.round(l.hum)}%</dd>
            <dt className="text-ink-3">Chuva 24 h</dt><dd>{(s.day?.rain ?? 0).toFixed(1)} mm</dd>
            <dt className="text-ink-3">Pressão</dt><dd>{l.pres.toFixed(0)} hPa</dd>
            <dt className="text-ink-3">Bateria</dt>
            <dd className="flex items-center gap-2">
              <span className="h-2 w-14 overflow-hidden rounded-full bg-line"><i className="block h-full" style={{ width: `${pct}%`, background: batteryColor(pct) }} /></span>
              {pct}%
            </dd>
          </dl>
          <p className="num mt-1 text-[11px] text-ink-3">{chem.label} · {s.config.battery_mah} mAh · {l.vbat.toFixed(2)} V</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-2">Esta estação ainda não enviou nenhuma leitura. Ligue o ESP32 e confira a chave do dispositivo.</p>
      )}
      <button onClick={() => go(`s/${s.id}`)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">
        Abrir estação <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  )
}
