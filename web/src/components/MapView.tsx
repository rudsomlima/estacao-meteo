import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { batteryColor, rainColor, tempColor, windColor } from '../lib/colors'
import { batteryPct } from '../lib/battery'
import { store } from '../lib/api'
import { NO_BATTERY_V } from '../lib/battery'
import { ago, compass16, hasFreshReading, isOnline, isSeen, kmh, wifiColor } from '../lib/derive'
import { getPrefs, setPrefs, usePrefs, type MapLayer, type Prefs } from '../lib/prefs'
import { makeFmt } from '../lib/units'
import type { Station } from '../types'

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

export type Layer = MapLayer

interface Props {
  stations: Station[]
  selectedId: string | null
  layers: Layer[]
  pickMode: boolean
  onSelect: (id: string | null) => void
  onPick: (lat: number, lon: number) => void
  /** mapa em tela cheia: aí a rolagem comum já amplia (fora dela, só com Ctrl, para a página poder rolar) */
  fullscreen?: boolean
}

// Por padrão usa os tiles públicos do OpenStreetMap, escurecidos por filtro. Para produção com muito acesso,
// aponte VITE_MAP_TILES para um provedor com chave (MapTiler, Stadia...). Veja web/.env.example.
const TILES = import.meta.env.VITE_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILES_ARE_DARK = import.meta.env.VITE_MAP_TILES_DARK === '1'
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '© OpenStreetMap contributors'

type Basemap = Prefs['basemap']

/** Mapas de fundo oferecidos. O escuro é o padrão do site (tiles claros escurecidos por filtro). */
export const BASEMAPS: { id: Basemap; label: string; tiles: string; maxzoom: number; attribution: string; dim: boolean }[] = [
  { id: 'dark', label: 'Escuro', tiles: TILES, maxzoom: 19, attribution: ATTRIBUTION, dim: !TILES_ARE_DARK },
  { id: 'streets', label: 'Ruas', tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxzoom: 19, attribution: '© OpenStreetMap contributors', dim: false },
  { id: 'satellite', label: 'Satélite', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxzoom: 18, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics', dim: false },
  { id: 'terrain', label: 'Relevo', tiles: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', maxzoom: 17, attribution: '© OpenStreetMap contributors, SRTM · estilo © OpenTopoMap (CC-BY-SA)', dim: false },
]

const styleFor = (id: Basemap): maplibregl.StyleSpecification => {
  const b = BASEMAPS.find((x) => x.id === id) ?? BASEMAPS[0]
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles: [b.tiles], tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b1012' } },
      { id: 'base', type: 'raster', source: 'base', paint: b.dim ? { 'raster-brightness-max': 0.4, 'raster-saturation': -0.75, 'raster-contrast': 0.2 } : {} },
    ],
  }
}

const esc = (t: string) => t.replace(/[<&]/g, '')

/** Uma linha por camada ligada. A borda do pino usa a cor da primeira camada ligada com valor. */
function pin(s: Station, layers: Layer[]) {
  const f = makeFmt(getPrefs())
  const l = s.latest
  const on = isOnline(s)
  const alive = on || isSeen(s) // falou com o servidor há pouco, com ou sem leitura de sensor
  const lines: { text: string; color: string }[] = []
  let border = alive ? '#38bdf8' : '#64748b'
  let first = true
  const add = (text: string, color: string) => { lines.push({ text, color }); if (first) { border = color; first = false } }
  const vbat = l?.vbat ?? s.vbat
  const rssi = l?.rssi ?? s.rssi

  if (!alive) {
    lines.push({ text: l ? 'sem sinal' : 'sem dados', color: l ? '#94a3b8' : '#fff' })
    if (layers.includes('seen')) lines.push({ text: s.last_seen ? ago(s.last_seen) : l ? ago(l.ts) : 'nunca', color: '#f87171' })
  } else {
    const sensors = layers.some((k) => k === 'wind' || k === 'temp' || k === 'pres' || k === 'rain')
    if (l && on) {
      if (layers.includes('wind')) add(`${f.wind(l.wind)} ${compass16(l.dir)}`, windColor(kmh(l.wind)))
      if (layers.includes('temp')) add(f.tempShort(l.temp), tempColor(l.temp))
      if (layers.includes('pres') && Number.isFinite(l.pres)) add(f.pres(l.pres), '#a78bfa')
      if (layers.includes('rain')) { const mm = s.day?.rain ?? 0; add(f.rain(mm), rainColor(mm)) }
    } else if (sensors) lines.push({ text: 'sem sensor', color: '#94a3b8' }) // conectou, mas não mediu nada
    if (layers.includes('battery') && vbat != null) {
      if (vbat < NO_BATTERY_V) add('sem bateria', '#94a3b8') // placa na USB ou pino solto
      else { const p = batteryPct(vbat, s.config.battery_chem); add(`${p}%`, batteryColor(p)) }
    }
    if (layers.includes('wifi') && rssi != null) add(`${rssi} dBm`, wifiColor(rssi))
    if (layers.includes('seen')) lines.push({ text: ago(s.last_seen ?? l?.ts ?? 0), color: '#cbd5e1' })
    if (!lines.length) lines.push({ text: 'online', color: '#4ade80' })
  }
  return { lines, border, on: alive }
}

const VIEW_KEY = 'meteo.mapview'
/** A posição e o zoom do mapa ficam guardados: ao voltar de outra tela, o mapa está como o usuário deixou. */
function savedView(): { center: [number, number]; zoom: number; bearing: number; pitch: number } | null {
  try {
    const v = JSON.parse(store.get(VIEW_KEY)) as { c?: [number, number]; z?: number; b?: number; p?: number }
    if (v && Array.isArray(v.c) && Number.isFinite(v.c[0]) && Number.isFinite(v.c[1]) && Number.isFinite(v.z)) return { center: v.c, zoom: v.z as number, bearing: v.b ?? 0, pitch: v.p ?? 0 }
  } catch { /* sem posição salva */ }
  return null
}

export default function MapView({ stations, selectedId, layers, pickMode, onSelect, onPick, fullscreen }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLButtonElement }>())
  const live = useRef({ stations, layers, pickMode, onSelect, onPick })
  const fitted = useRef(false)
  const located = useRef(false) // a posição do usuário já levou o mapa para onde ele está
  const first = useRef(true)
  const [menu, setMenu] = useState(false)
  const [tick, setTick] = useState(0) // o "há N s" dos pinos anda de segundo em segundo
  const prefs = usePrefs()
  live.current = { stations, layers, pickMode, onSelect, onPick }

  // ---- mapa
  useEffect(() => {
    if (!host.current) return
    const view = savedView()
    const m = new maplibregl.Map({
      container: host.current, style: styleFor(getPrefs().basemap), center: view?.center ?? [-45.5, -23.2], zoom: view?.zoom ?? 6.2,
      bearing: view?.bearing ?? 0, pitch: view?.pitch ?? 0, attributionControl: false,
      // a página rola com a roda do mouse; para ampliar o mapa é Ctrl + roda (ou dois dedos no celular)
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + rolagem para ampliar o mapa',
        'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para ampliar o mapa',
        'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
      },
    })
    if (view) { fitted.current = true; located.current = true } // já tem a posição do usuário: não reenquadra nem vai para a localização
    m.on('moveend', () => {
      const c = m.getCenter()
      store.set(VIEW_KEY, JSON.stringify({ c: [c.lng, c.lat], z: m.getZoom(), b: m.getBearing(), p: m.getPitch() }))
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    // ao abrir, vai para a localização atual (se o navegador deixar); sem permissão, mostra as estações
    const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false, timeout: 8000 }, fitBoundsOptions: { maxZoom: 10 }, showAccuracyCircle: false })
    m.addControl(geo, 'bottom-right')
    geo.on('geolocate', () => { located.current = true })
    if (!view) m.once('load', () => geo.trigger())
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    m.on('click', (e) => {
      if (live.current.pickMode) live.current.onPick(e.lngLat.lat, e.lngLat.lng)
      else live.current.onSelect(null)
    })
    map.current = m
    const mk = markers.current
    return () => { mk.forEach((v) => v.m.remove()); mk.clear(); m.remove(); map.current = null; fitted.current = false; located.current = false }
  }, [])

  // tela cheia: a roda do mouse amplia sem precisar do Ctrl
  useEffect(() => {
    const g = map.current?.cooperativeGestures
    if (!g) return
    if (fullscreen) g.disable(); else g.enable()
  }, [fullscreen])

  // ---- mapa de fundo
  useEffect(() => {
    if (first.current) { first.current = false; return }
    map.current?.setStyle(styleFor(prefs.basemap))
  }, [prefs.basemap])

  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = pickMode ? 'crosshair' : '' }, [pickMode])

  const showSeen = layers.includes('seen')
  useEffect(() => {
    if (!showSeen) return
    const t = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [showSeen])

  // ---- pinos
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()
    for (const s of stations) {
      seen.add(s.id)
      const p = pin(s, layers)
      let entry = markers.current.get(s.id)
      if (!entry) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'wpin'
        el.onclick = (e) => { e.stopPropagation(); live.current.onSelect(s.id) }
        entry = { el, m: new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lon, s.lat]).addTo(m) }
        markers.current.set(s.id, entry)
      }
      entry.m.setLngLat([s.lon, s.lat])
      entry.el.style.setProperty('--c', p.border)
      entry.el.dataset.off = p.on ? '0' : '1'
      entry.el.dataset.sel = s.id === selectedId ? '1' : '0'
      entry.el.setAttribute('aria-label', `${s.name}: ${p.lines.map((x) => x.text).join(', ')}`)
      entry.el.innerHTML = `<b>${p.lines.map((x) => `<em style="color:${x.color}">${esc(x.text)}</em>`).join('')}</b><i></i><span>${esc(s.name)}</span>`
    }
    markers.current.forEach((v, id) => { if (!seen.has(id)) { v.m.remove(); markers.current.delete(id) } })
    if (!fitted.current && stations.length && !located.current) {
      fitted.current = true
      const b = new maplibregl.LngLatBounds()
      stations.forEach((s) => b.extend([s.lon, s.lat]))
      if (stations.length === 1) m.jumpTo({ center: [stations[0].lon, stations[0].lat], zoom: 9 })
      else {
        const narrow = m.getContainer().clientWidth < 720
        m.fitBounds(b, { padding: narrow ? { top: 110, bottom: 150, left: 40, right: 40 } : { top: 90, bottom: 90, left: 60, right: 340 }, maxZoom: 9, duration: 0 })
      }
    }
  }, [stations, layers, selectedId, prefs.wind, prefs.temp, prefs.rain, tick])

  // ---- partículas de vento (campo interpolado entre as estações)
  useEffect(() => {
    const canvas = cv.current
    const m = map.current
    if (!canvas || !m) return
    const g = canvas.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0, H = 0, raf = 0, last = performance.now(), running = true
    const COLS = 26, ROWS = 16
    let grid: Float32Array = new Float32Array(COLS * ROWS * 3)
    let gridAt = 0
    const N = 650
    const P = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), a: Math.random() * 80 }))

    const fit = () => {
      const r = canvas.getBoundingClientRect()
      const d = Math.min(2, devicePixelRatio || 1)
      W = r.width; H = r.height
      canvas.width = W * d; canvas.height = H * d
      g.setTransform(d, 0, 0, d, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)
    const clear = () => g.clearRect(0, 0, W, H)
    m.on('movestart', clear)
    m.on('zoomstart', clear)

    const sources = () => live.current.stations.filter((s) => s.latest && hasFreshReading(s))
    // vetor (leste, norte) em m/s por ponderação inversa da distância ao quadrado
    const buildGrid = () => {
      const src = sources().map((s) => {
        const to = ((s.latest!.dir + 180) * Math.PI) / 180
        return { lon: s.lon, lat: s.lat, e: Math.sin(to) * s.latest!.wind, n: Math.cos(to) * s.latest!.wind }
      })
      if (!src.length) { grid.fill(0); return false }
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const ll = m.unproject([(i / (COLS - 1)) * W, (j / (ROWS - 1)) * H])
        let e = 0, n = 0, w = 0
        for (const s of src) {
          const dx = (ll.lng - s.lon) * Math.cos((ll.lat * Math.PI) / 180), dy = ll.lat - s.lat
          const wt = 1 / (dx * dx + dy * dy + 0.01)
          e += s.e * wt; n += s.n * wt; w += wt
        }
        const k = (j * COLS + i) * 3
        grid[k] = e / w; grid[k + 1] = n / w
      }
      return true
    }
    const sample = (x: number, y: number): [number, number] => {
      const fx = Math.min(COLS - 1.001, Math.max(0, (x / W) * (COLS - 1))), fy = Math.min(ROWS - 1.001, Math.max(0, (y / H) * (ROWS - 1)))
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j
      const at = (a: number, b: number, c: number) => grid[(b * COLS + a) * 3 + c]
      const f = (c: number) => (at(i, j, c) * (1 - u) + at(i + 1, j, c) * u) * (1 - v) + (at(i, j + 1, c) * (1 - u) + at(i + 1, j + 1, c) * u) * v
      return [f(0), f(1)]
    }

    let has = false
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!running || !live.current.layers.includes('wind') || !W) { if (!live.current.layers.includes('wind')) clear(); return }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (now - gridAt > 600) { has = buildGrid(); gridAt = now }
      if (!has) { clear(); return }
      g.globalCompositeOperation = 'destination-out'
      g.fillStyle = 'rgba(0,0,0,0.08)'
      g.fillRect(0, 0, W, H)
      g.globalCompositeOperation = 'source-over'
      g.lineWidth = 1.4
      for (const p of P) {
        const x = p.x * W, y = p.y * H
        const [e, n] = sample(x, y)
        const sp = Math.hypot(e, n)
        const nx = x + e * dt * 9, ny = y - n * dt * 9
        g.strokeStyle = windColor(sp * 3.6)
        g.globalAlpha = 0.85
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke()
        p.x = nx / W; p.y = ny / H; p.a--
        if (p.a < 0 || nx < 0 || nx > W || ny < 0 || ny > H) { p.x = Math.random(); p.y = Math.random(); p.a = 50 + Math.random() * 90 }
      }
      g.globalAlpha = 1
    }
    if (!reduce) raf = requestAnimationFrame(frame)
    const vis = () => { running = !document.hidden }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis)
      m.off('movestart', clear); m.off('zoomstart', clear)
    }
  }, [])

  return (
    <div className="absolute inset-0" data-lenis-prevent>
      <div ref={host} className="h-full w-full" />
      <canvas ref={cv} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="absolute right-3 top-16 z-10 sm:right-4">
        <button
          type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Camadas do mapa"
          className="glass flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:text-ink"
        ><Layers className="h-5 w-5" aria-hidden /></button>
        {menu && (
          <div role="radiogroup" aria-label="Mapa de fundo" className="glass absolute right-0 top-12 grid w-40 gap-0.5 rounded-xl p-1.5">
            {BASEMAPS.map((b) => (
              <button
                key={b.id} type="button" role="radio" aria-checked={prefs.basemap === b.id}
                onClick={() => { setPrefs({ basemap: b.id }); setMenu(false) }}
                className={`rounded-lg px-3 py-2 text-left text-sm ${prefs.basemap === b.id ? 'bg-cyan font-semibold text-[#03212d]' : 'text-ink-2 hover:bg-card-hover hover:text-ink'}`}
              >{b.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
