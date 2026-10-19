import { ArrowRight, Pencil, Settings, Star, X } from 'lucide-react'
import { useMemo } from 'react'
import { useNow } from '../hooks/useNow'
import { useCanEdit } from '../lib/session'
import { useReadings } from '../hooks/useNetwork'
import { go } from '../hooks/useRoute'
import { batteryColor } from '../lib/colors'
import { batteryPct, CHEMS } from '../lib/battery'
import { ago, compass16, isOnline, isSeen, wifiColor, wifiLabel } from '../lib/derive'
import { makeMain, toggleFavorite, usePrefs } from '../lib/prefs'
import { useFmt } from '../lib/units'
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

/** Estação sem leitura de sensor: mostra o que a placa informa mesmo assim (bateria e sinal Wi-Fi). */
export function NoReadings({ s }: { s: Station }) {
  useNow()
  const seen = isSeen(s)
  const f = s.vbat != null
  return (
    <div className="mt-3 grid gap-2 text-sm">
      <p className="text-ink-2">
        {seen ? 'A placa está conectada, mas não mediu nada: o sensor (BME280) não respondeu.' : 'Esta estação ainda não enviou nenhum sinal. Ligue o ESP32 e confira o Wi-Fi e a chave.'}
      </p>
      {s.last_seen && (
        <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
          <dt className="text-ink-3">Visto</dt><dd className={seen ? 'text-ok' : 'text-bad'}>{ago(s.last_seen)}</dd>
          {f && (<><dt className="text-ink-3">Bateria</dt><dd>{s.vbat! < 1 ? 'sem bateria (USB)' : `${batteryPct(s.vbat!, s.config.battery_chem)}% · ${s.vbat!.toFixed(2)} V`}</dd></>)}
          {s.rssi != null && (<><dt className="text-ink-3">Sinal Wi-Fi</dt><dd style={{ color: wifiColor(s.rssi) }}>{s.rssi} dBm · {wifiLabel(s.rssi)}</dd></>)}
          {s.fw_version && (<><dt className="text-ink-3">Firmware</dt><dd>{s.fw_version}</dd></>)}
        </dl>
      )}
    </div>
  )
}

export default function StationPanel({ station: s, source, onClose, onEdit }: { station: Station; source: Source; onClose: () => void; onEdit: () => void }) {
  useNow() // redesenha a cada segundo: as idades ("há 2min10s") andam sozinhas
  const editable = useCanEdit(s, source)
  const { readings } = useReadings(s.id, source, 24)
  const f = useFmt()
  const prefs = usePrefs()
  const fav = prefs.favorites.includes(s.id)
  const main = prefs.favorites[0] === s.id
  const l = s.latest
  const on = isOnline(s)
  const chem = CHEMS[s.config.battery_chem]
  const pct = l ? batteryPct(l.vbat, s.config.battery_chem) : 0
  const temps = useMemo(() => readings.filter((_, i) => i % 3 === 0).map((r) => r.temp), [readings])

  return (
    <aside className="glass absolute inset-x-3 bottom-3 z-20 rounded-2xl p-4 max-h-[70svh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:max-h-[calc(100svh-140px)] sm:w-[300px]" aria-label={`Resumo de ${s.name}`}>
      <button onClick={onClose} aria-label="Fechar resumo" className="absolute right-3 top-3 rounded-lg p-1 text-ink-2 hover:bg-card-hover hover:text-ink"><X className="h-4 w-4" /></button>
      <h2 className="pr-8 font-display text-xl font-bold tracking-tight">{s.name}</h2>
      <p className="num text-xs text-ink-3">{s.city} · {s.alt.toFixed(0)} m</p>
      {l ? (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="font-display text-5xl font-extrabold leading-none tracking-tight">{f.tempV(l.temp)}<span className="text-xl font-medium text-ink-2">{f.tempUnit}</span></div>
            <span className={`num rounded-full px-2 py-0.5 text-[11px] ${on ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}>{on ? 'online' : 'sem sinal'} · {ago(l.ts)}</span>
          </div>
          <Spark values={temps} color="#38bdf8" />
          <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-3">Vento</dt><dd>{f.wind(l.wind)} {compass16(l.dir)}</dd>
            <dt className="text-ink-3">Rajada</dt><dd>{f.wind(l.gust)}</dd>
            <dt className="text-ink-3">Umidade</dt><dd>{Math.round(l.hum)}%</dd>
            <dt className="text-ink-3">Chuva 24 h</dt><dd>{f.rain(s.day?.rain ?? 0)}</dd>
            <dt className="text-ink-3">Pressão</dt><dd>{f.pres(l.pres)}</dd>
            <dt className="text-ink-3">Bateria</dt>
            <dd className="flex items-center gap-2">
              <span className="h-2 w-14 overflow-hidden rounded-full bg-line"><i className="block h-full" style={{ width: `${pct}%`, background: batteryColor(pct) }} /></span>
              {pct}%
            </dd>
          </dl>
          <p className="num mt-1 text-[11px] text-ink-3">{chem.label} · {s.config.battery_mah} mAh · {l.vbat.toFixed(2)} V</p>
        </>
      ) : (
        <NoReadings s={s} />
      )}
      <button onClick={() => go(`s/${s.id}`)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">
        Abrir estação <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => (fav && !main ? makeMain(s.id) : toggleFavorite(s.id))}
          aria-pressed={fav}
          title={main ? 'Estação principal. Clique para tirar dos favoritos' : fav ? 'Favorita. Clique para tornar a principal' : 'Adicionar aos favoritos'}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs hover:bg-card-hover"
        >
          <Star className={`h-3.5 w-3.5 ${fav ? 'fill-warn text-warn' : ''}`} aria-hidden /> {main ? 'Principal' : fav ? 'Favorita' : 'Favoritar'}
        </button>
        <button onClick={() => go(`s/${s.id}/config`)} className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs hover:bg-card-hover">
          <Settings className="h-3.5 w-3.5" aria-hidden /> Configurações
        </button>
        {editable && (
          <button onClick={onEdit} className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs hover:bg-card-hover">
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar ou remover estação
          </button>
        )}
      </div>
    </aside>
  )
}
