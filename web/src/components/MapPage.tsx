import { ChevronDown, Maximize2, Minimize2, Plus, Star } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { SaveResult } from '../hooks/useNetwork'
import { useNow } from '../hooks/useNow'
import { go } from '../hooks/useRoute'
import { store, type StationEdit } from '../lib/api'
import { batteryPct, CHEMS } from '../lib/battery'
import { batteryColor, windColor } from '../lib/colors'
import { ago, compass16, isOnline, kmh } from '../lib/derive'
import { toggleFavorite, usePrefs } from '../lib/prefs'
import { useFmt } from '../lib/units'
import type { Source, Station } from '../types'
import AddStationDialog from './AddStationDialog'
import { PICKED_EVENT, PICK_EVENT } from './UsbDevice'
import { useIsAdmin } from '../lib/session'
import { MAP_LAYERS, type MapLayer } from '../lib/prefs'
import Reveal, { SectionHead } from './Reveal'
import StationPanel from './StationPanel'

const MapView = lazy(() => import('./MapView'))


const LAYERS_KEY = 'meteo.map.layers'
const SELECTED_KEY = 'meteo.map.selected'

interface Props {
  stations: Station[]
  source: Source
  onCreate: (body: StationEdit & { id: string }, token: string) => Promise<SaveResult>
  onSave: (s: Station, token: string) => Promise<SaveResult>
  onRemove: (id: string, token: string) => Promise<SaveResult>
}

export default function MapPage({ stations, source, onCreate, onSave, onRemove }: Props) {
  useNow() // as idades ("há 2min10s") andam sozinhas
  const prefs = usePrefs()
  const isAdmin = useIsAdmin()
  const f = useFmt()
  // os filtros do mapa (camadas ligadas) e a estação aberta ficam guardados: ao voltar de outra tela, tudo como estava
  const [layers, setLayers] = useState<MapLayer[]>(() => {
    try {
      const v = JSON.parse(store.get(LAYERS_KEY) || 'null') as unknown
      if (Array.isArray(v)) return MAP_LAYERS.map(([k]) => k).filter((k) => v.includes(k))
    } catch { /* sem filtros salvos */ }
    return prefs.layers
  })
  const toggleLayer = (k: MapLayer) => setLayers((cur) => {
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]
    store.set(LAYERS_KEY, JSON.stringify(next))
    return next
  })
  const box = useRef<HTMLElement>(null)
  const fallback = useRef(false)
  const [full, setFull] = useState(false)
  const [selected, setSelectedRaw] = useState<string | null>(() => store.get(SELECTED_KEY) || null)
  const setSelected = (id: string | null) => { setSelectedRaw(id); store.set(SELECTED_KEY, id ?? '') }
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null)
  const [editing, setEditing] = useState<Station | null>(null)
  const forUsb = useRef(false) // o ponto é para o aviso da placa USB, não para o diálogo Adicionar estação
  const finishPick = (p: { lat: number; lon: number } | null) => {
    setPicking(false)
    if (forUsb.current) { forUsb.current = false; window.dispatchEvent(new CustomEvent(PICKED_EVENT, { detail: p })) }
    else { if (p) setPicked(p); if (!editing) setAdding(true) }
  }
  useEffect(() => {
    const on = () => { forUsb.current = true; setPicking(true) }
    window.addEventListener(PICK_EVENT, on)
    return () => window.removeEventListener(PICK_EVENT, on)
  }, [])
  const sel = stations.find((s) => s.id === selected) ?? null
  const online = useMemo(() => stations.filter((s) => isOnline(s)).length, [stations])
  const rows = useMemo(() => [...stations].sort((a, b) => {
    const fa = prefs.favorites.indexOf(a.id), fb = prefs.favorites.indexOf(b.id)
    return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb)
  }), [stations, prefs.favorites])

  // tela cheia: usa a API do navegador e, se ela não existir (iPhone), cobre a janela com CSS
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement && !fallback.current) setFull(false) }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  useEffect(() => {
    if (!full) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleFull() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  })
  function toggleFull() {
    if (full) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      fallback.current = false
      setFull(false)
      return
    }
    const el = box.current
    if (el?.requestFullscreen) {
      fallback.current = false
      el.requestFullscreen().then(() => setFull(true)).catch(() => { fallback.current = true; setFull(true) })
    } else { fallback.current = true; setFull(true) }
  }

  return (
    <>
      <section ref={box} id="mapa" className={full && fallback.current ? 'fixed inset-0 z-[60] bg-bg' : 'relative h-[calc(100svh-56px-88px)] min-h-[480px] overflow-hidden bg-bg'} style={full && fallback.current ? undefined : { marginTop: 56 }}>
        <Suspense fallback={<div className="grid h-full place-items-center text-sm text-ink-3">Carregando mapa…</div>}>
          <MapView
            stations={stations}
            selectedId={selected}
            layers={layers}
            pickMode={picking}
            fullscreen={full}
            onSelect={setSelected}
            onPick={(lat, lon) => finishPick({ lat, lon })}
          />
        </Suspense>

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-24px)] flex-col gap-2 sm:left-4 sm:top-4">
          <div role="group" aria-label="Camada do mapa" className="pointer-events-auto flex flex-wrap gap-1.5 pr-12 sm:pr-0">
            {MAP_LAYERS.map(([k, label]) => (
              <button
                key={k}
                aria-pressed={layers.includes(k)}
                onClick={() => toggleLayer(k)}
                className={`num rounded-lg border px-3 py-1.5 text-xs transition-colors ${layers.includes(k) ? 'border-cyan bg-cyan text-[#03212d]' : 'glass text-ink hover:border-line-hover'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="num glass pointer-events-auto w-fit rounded-lg px-3 py-1.5 text-xs text-ink-2">
            {online} de {stations.length} online{source === 'demo' ? ' · demonstração' : ''}
          </p>
        </div>

        <button
          onClick={toggleFull}
          aria-label={full ? 'Sair da tela cheia' : 'Mapa em tela cheia'}
          title={full ? 'Sair da tela cheia' : 'Tela cheia'}
          className="glass absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg hover:border-line-hover sm:right-4 sm:top-4"
          style={sel ? { display: 'none' } : undefined}
        >
          {full ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
        </button>

        {isAdmin && <button
          onClick={() => setAdding(true)}
          className="glass absolute bottom-20 left-3 z-10 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium hover:border-line-hover sm:bottom-4 sm:left-auto sm:right-[68px] sm:top-auto"
          style={sel ? { display: undefined } : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden /> Adicionar estação
        </button>}

        {layers.includes('wind') && (
          <div className="glass num pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] text-ink-2 sm:flex">
            0<i className="block h-2 w-36 rounded-full" style={{ background: 'linear-gradient(90deg,#3b82f6,#38bdf8,#4ade80,#fbbf24,#fb923c,#ef4444)' }} />{f.wind(60 / 3.6)}
          </div>
        )}

        {picking && (
          <div className="glass absolute inset-x-0 top-4 z-30 mx-auto w-fit rounded-xl px-4 py-2 text-sm" role="status">
            Clique no mapa para escolher o local da estação.{' '}
            <button className="ml-2 underline" onClick={() => finishPick(null)}>Cancelar</button>
          </div>
        )}

        {stations.length === 0 && (
          <div className="glass absolute inset-0 z-10 m-auto h-fit max-w-sm rounded-2xl p-6 text-center">
            <h2 className="font-display text-xl font-bold">Nenhuma estação ainda</h2>
            <p className="mt-2 text-sm text-ink-2">{isAdmin ? 'Adicione a primeira para receber a chave do ESP32 e ver os dados aqui.' : 'Um administrador ainda não cadastrou estações.'}</p>
            {isAdmin && <button onClick={() => setAdding(true)} className="mt-4 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">Adicionar estação</button>}
          </div>
        )}

        {!full && (
          <button
            onClick={() => document.getElementById('rede')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="glass absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit items-center gap-1.5 rounded-full px-4 py-1.5 text-xs text-ink-2 hover:text-ink sm:bottom-4"
            style={sel ? { display: 'none' } : undefined}
          >
            Todas as estações <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {sel && <StationPanel station={sel} source={source} onClose={() => setSelected(null)} onEdit={() => setEditing(sel)} />}
      </section>

      <AddStationDialog
        open={(adding || !!editing) && !picking}
        picked={picked}
        station={editing}
        onClose={() => { setAdding(false); setEditing(null); setPicked(null) }}
        onPickMap={() => { setPicking(true) }}
        onCreate={onCreate}
        onSave={onSave}
        onRemove={async (id, token) => { const r = await onRemove(id, token); if (r.ok) { setSelected(null); if (prefs.favorites.includes(id)) toggleFavorite(id) } return r }}
      />

      <section className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        <SectionHead id="rede" kicker="Rede" title="Todas as estações">
          Cada estação tem a própria chave, configuração e bateria. Clique numa linha para abrir a estação.
        </SectionHead>
        <Reveal className="mt-8 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-3">
                {['', 'Estação', 'Temperatura', 'Pressão', 'Vento', 'Chuva 24 h', 'Bateria', 'Visto'].map((h) => <th key={h} className="border-b border-line px-4 py-3 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const l = s.latest, on = isOnline(s)
                const vb = l?.vbat ?? s.vbat
                const pct = vb != null && vb > 1 ? batteryPct(vb, s.config.battery_chem) : 0
                const seenTs = s.last_seen ?? l?.ts
                return (
                  <tr key={s.id} tabIndex={0} onClick={() => go(`s/${s.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`s/${s.id}`)}
                    className={`num cursor-pointer border-b border-line last:border-0 hover:bg-card-hover ${on ? '' : 'opacity-60'}`}>
                    <td className="w-10 pl-4">
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id) }} aria-pressed={prefs.favorites.includes(s.id)} aria-label={`Favoritar ${s.name}`} className="rounded p-1 hover:bg-card-hover">
                        <Star className={`h-4 w-4 ${prefs.favorites.includes(s.id) ? 'fill-warn text-warn' : 'text-ink-3'}`} aria-hidden />
                      </button>
                    </td>
                    <td className="px-4 py-3"><b className="font-sans font-semibold">{s.name}</b><div className="text-xs text-ink-3">{s.city}</div></td>
                    <td className="px-4 py-3">{l ? f.temp(l.temp) : '—'}</td>
                    <td className="px-4 py-3">{l && Number.isFinite(l.pres) ? f.pres(l.pres) : '—'}</td>
                    <td className="px-4 py-3">{l ? <span style={{ color: windColor(kmh(l.wind)) }}>{f.wind(l.wind)} {compass16(l.dir)}</span> : '—'}</td>
                    <td className="px-4 py-3">{s.day ? f.rain(s.day.rain) : '—'}</td>
                    <td className="px-4 py-3">
                      {vb != null && vb > 1 ? (
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-14 overflow-hidden rounded-full bg-line"><i className="block h-full" style={{ width: `${pct}%`, background: batteryColor(pct) }} /></span>
                          {pct}% <span className="text-xs text-ink-3">{CHEMS[s.config.battery_chem].label} · {s.config.battery_mah} mAh</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">{seenTs ? <span className={on ? '' : 'text-bad'}>{ago(seenTs)}</span> : 'nunca'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Reveal>
      </section>
    </>
  )
}
