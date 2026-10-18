import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { batteryColor, rainColor, tempColor, windColor } from '../lib/colors'
import { batteryPct } from '../lib/battery'
import { compass16, isOnline, kmh } from '../lib/derive'
import type { Station } from '../types'

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

export type Layer = 'wind' | 'temp' | 'rain' | 'battery'

interface Props {
  stations: Station[]
  selectedId: string | null
  layer: Layer
  pickMode: boolean
  onSelect: (id: string | null) => void
  onPick: (lat: number, lon: number) => void
}

// Por padrão usa os tiles públicos do OpenStreetMap, escurecidos por filtro. Para produção com muito acesso,
// aponte VITE_MAP_TILES para um provedor com chave (MapTiler, Stadia...). Veja web/.env.example.
const TILES = import.meta.env.VITE_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILES_ARE_DARK = import.meta.env.VITE_MAP_TILES_DARK === '1'
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '© OpenStreetMap contributors'

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { base: { type: 'raster', tiles: [TILES], tileSize: 256, maxzoom: 19, attribution: ATTRIBUTION } },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1012' } },
    {
      id: 'base', type: 'raster', source: 'base',
      paint: TILES_ARE_DARK ? {} : { 'raster-brightness-max': 0.4, 'raster-saturation': -0.75, 'raster-contrast': 0.2 },
    },
  ],
}

function pin(s: Station, layer: Layer) {
  const on = isOnline(s)
  const l = s.latest
  let text = 'sem sinal', color = '#64748b'
  if (l && on) {
    if (layer === 'wind') { text = `${Math.round(kmh(l.wind))} km/h ${compass16(l.dir)}`; color = windColor(kmh(l.wind)) }
    else if (layer === 'temp') { text = `${l.temp.toFixed(0)}°`; color = tempColor(l.temp) }
    else if (layer === 'rain') { const mm = s.day?.rain ?? 0; text = `${mm.toFixed(1)} mm`; color = rainColor(mm) }
    else { const p = batteryPct(l.vbat, s.config.battery_chem); text = `${p}%`; color = batteryColor(p) }
  } else if (l) { text = 'sem sinal'; color = '#64748b' }
  else { text = 'sem dados' }
  return { text, color, on: on && !!l }
}

export default function MapView({ stations, selectedId, layer, pickMode, onSelect, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLButtonElement }>())
  const live = useRef({ stations, layer, pickMode, onSelect, onPick })
  const fitted = useRef(false)
  live.current = { stations, layer, pickMode, onSelect, onPick }

  // ---- mapa
  useEffect(() => {
    if (!host.current) return
    const m = new maplibregl.Map({
      container: host.current, style: STYLE, center: [-45.5, -23.2], zoom: 6.2, attributionControl: false, cooperativeGestures: false,
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    m.on('click', (e) => {
      if (live.current.pickMode) live.current.onPick(e.lngLat.lat, e.lngLat.lng)
      else live.current.onSelect(null)
    })
    map.current = m
    const mk = markers.current
    return () => { mk.forEach((v) => v.m.remove()); mk.clear(); m.remove(); map.current = null; fitted.current = false }
  }, [])

  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = pickMode ? 'crosshair' : '' }, [pickMode])

  // ---- pinos
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()
    for (const s of stations) {
      seen.add(s.id)
      const p = pin(s, layer)
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
      entry.el.style.setProperty('--c', p.color)
      entry.el.dataset.off = p.on ? '0' : '1'
      entry.el.dataset.sel = s.id === selectedId ? '1' : '0'
      entry.el.setAttribute('aria-label', `${s.name}: ${p.text}`)
      entry.el.innerHTML = `<b>${p.text}</b><i></i><span>${s.name.replace(/[<&]/g, '')}</span>`
    }
    markers.current.forEach((v, id) => { if (!seen.has(id)) { v.m.remove(); markers.current.delete(id) } })
    if (!fitted.current && stations.length) {
      fitted.current = true
      const b = new maplibregl.LngLatBounds()
      stations.forEach((s) => b.extend([s.lon, s.lat]))
      if (stations.length === 1) m.jumpTo({ center: [stations[0].lon, stations[0].lat], zoom: 9 })
      else {
        const narrow = m.getContainer().clientWidth < 720
        m.fitBounds(b, { padding: narrow ? { top: 110, bottom: 150, left: 40, right: 40 } : { top: 90, bottom: 90, left: 60, right: 340 }, maxZoom: 9, duration: 0 })
      }
    }
  }, [stations, layer, selectedId])

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

    const sources = () => live.current.stations.filter((s) => s.latest && isOnline(s))
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
      if (!running || live.current.layer !== 'wind' || !W) { if (live.current.layer !== 'wind') clear(); return }
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
    </div>
  )
}
