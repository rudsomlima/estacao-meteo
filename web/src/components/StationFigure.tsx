import { useEffect, useRef } from 'react'
import { CHEMS, batteryPct } from '../lib/battery'
import { mix } from '../lib/colors'
import { compass16, dayStats, dewPoint, kmh, trend } from '../lib/derive'
import { getPrefs } from '../lib/prefs'
import { makeFmt, type Fmt } from '../lib/units'
import type { Reading, Station } from '../types'
import './figure.css'

const TAU = Math.PI * 2
const rad = (d: number) => (d * Math.PI) / 180
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Dados ao vivo que a figura mostra. Tudo vem das leituras reais da estação. */
interface Live {
  ws: number; gust: number; wd: number; rain: number; temp: number; hum: number; pres: number
  pct: number; vbat: number; chem: Station['config']['battery_chem']; mah: number
  dayRain: number; dv: number; ts: number; intervalS: number; name: string
  f: Fmt
}

type Mode = 'wide' | 'tall'
const LAY = {
  wide: { W: 1000, H: 620, gy: 560, sx: 500, sy: 582, sc: 1.08, co: { anemo: [22, 22, 236], vane: [742, 22, 236], shield: [22, 204, 236], rain: [742, 204, 236], solar: [22, 386, 236], logger: [742, 386, 236] } },
  tall: { W: 520, H: 1010, gy: 952, sx: 262, sy: 972, sc: 1.15, co: { anemo: [12, 12, 244], vane: [264, 12, 244], shield: [12, 142, 244], rain: [264, 142, 244], solar: [12, 272, 244], logger: [264, 272, 244] } },
} as const

// pontos de ligação em coordenadas locais da estação (y negativo = para cima)
const CO = [
  { id: 'anemo', a: [-85, -446], t: 'Anemômetro', s: 'Velocidade do vento', v: (L: Live) => L.f.wind(L.ws / 3.6), x: (L: Live) => `rajada ${L.f.wind(L.gust / 3.6)}` },
  { id: 'vane', a: [85, -440], t: 'Veleta', s: 'Direção do vento (°)', v: (L: Live) => `${compass16(L.wd)} ${Math.round(L.wd)}°`, x: () => 'de onde o vento vem' },
  { id: 'shield', a: [-84, -300], t: 'Sensor de temperatura e umidade do ar', s: 'Temperatura e umidade', v: (L: Live) => `${L.f.temp(L.temp)}${Number.isFinite(L.hum) ? ` · ${Math.round(L.hum)}%` : ''}${Number.isFinite(L.pres) ? ` · ${L.f.pres(L.pres)}` : ''}`, x: (L: Live) => (Number.isFinite(L.hum) ? `ponto de orvalho ${L.f.temp(dewPoint(L.temp, L.hum))}` : 'sem umidade neste sensor') },
  { id: 'rain', a: [84, -292], t: 'Pluviômetro', s: 'Precipitação', v: (L: Live) => L.f.rainRate(L.rain), x: (L: Live) => `hoje ${L.f.rain(L.dayRain)}` },
  { id: 'solar', a: [-88, -158], t: 'Painel solar', s: 'Alimentação do sistema',
    v: (L: Live) => (L.dv > 0.02 ? 'carregando' : L.dv < -0.02 ? 'descarregando' : 'estável'),
    x: (L: Live) => `${L.dv >= 0 ? '+' : ''}${L.dv.toFixed(2)} V em 3 h` },
  { id: 'logger', a: [52, -153], t: 'Datalogger / Transmissor', s: 'Armazenamento e envio dos dados', v: (L: Live) => `bateria ${L.pct}%`,
    x: (L: Live) => {
      const left = Math.max(0, Math.round(L.ts + L.intervalS - Date.now() / 1000))
      return `${CHEMS[L.chem].label} · ${L.vbat.toFixed(2)} V · próxima leitura em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
    } },
] as const

const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 }
const dayL = (h: number) => clamp(Math.sin(((h - 6) / 12) * Math.PI) * 2.2 + 0.25, 0, 1)
const sunE = (h: number) => Math.max(0, Math.sin(((h - 6) / 12) * Math.PI))

export default function StationFigure({ station, readings }: { station: Station; readings: Reading[] }) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const cos = useRef<HTMLDivElement>(null)

  const now = readings[readings.length - 1]
  const st = dayStats(readings)
  const live = useRef<Live>({} as Live)
  live.current = {
    ws: kmh(now.wind), gust: kmh(now.gust), wd: now.dir, rain: st.rainHour, temp: now.temp, hum: now.hum, pres: now.pres,
    pct: batteryPct(now.vbat, station.config.battery_chem), vbat: now.vbat, chem: station.config.battery_chem, mah: station.config.battery_mah,
    dayRain: st.rainDay, dv: trend(readings, (r) => r.vbat, 3), ts: now.ts, intervalS: station.config.interval_min * 60, name: station.name, f: makeFmt(getPrefs()),
  }

  useEffect(() => {
    const hostEl = host.current, stageEl = stage.current, svgEl = svg.current, cosEl = cos.current
    if (!hostEl || !stageEl || !svgEl || !cosEl) return
    const $ = (id: string) => stageEl.querySelector<SVGElement>('#' + id)!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    const clouds = Array.from({ length: 8 }, () => ({ x: Math.random(), y: 0.06 + Math.random() * 0.22, s: 0.7 + Math.random() * 0.9 }))
    const stars = Array.from({ length: 70 }, () => [Math.random(), Math.random() * 0.55, Math.random()])
    const blades = Array.from({ length: 110 }, () => ({ x: Math.random(), h: 8 + Math.random() * 16, ph: Math.random() * 6 }))
    const drops = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.6 }))
    let lay: (typeof LAY)[Mode] = LAY.wide
    let mode: Mode = 'wide'
    let R: Record<string, SVGElement> = {}

    function build(m: Mode) {
      mode = m
      lay = LAY[m]
      stageEl!.dataset.mode = m
      stageEl!.style.aspectRatio = `${lay.W} / ${lay.H}`
      const { W, H, gy, sx, sy, sc } = lay
      const hills = (base: number, amp: number, f: number, ph: number) => {
        let d = `M0,${H} L0,${base}`
        for (let x = 0; x <= W; x += 10) d += ` L${x},${(base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.3 + ph * 2) * amp * 0.3).toFixed(1)}`
        return d + ` L${W},${H} Z`
      }
      svgEl!.setAttribute('viewBox', `0 0 ${W} ${H}`)
      svgEl!.innerHTML = `
  <defs>
    <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop id="sk0" offset="0" stop-color="#3b82c4"/><stop id="sk1" offset="1" stop-color="#cfeaf7"/></linearGradient>
    <linearGradient id="gMetal" x1="0" x2="1"><stop offset="0" stop-color="#9aa6b1"/><stop offset=".45" stop-color="#f1f5f8"/><stop offset="1" stop-color="#7b8895"/></linearGradient>
    <linearGradient id="gShield" x1="0" x2="1"><stop offset="0" stop-color="#cfd8df"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c4cd"/></linearGradient>
    <linearGradient id="gBox" x1="0" x2="1"><stop offset="0" stop-color="#cbd3da"/><stop offset=".5" stop-color="#f5f8fa"/><stop offset="1" stop-color="#aeb9c3"/></linearGradient>
    <linearGradient id="gPanel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d5aa6"/><stop offset="1" stop-color="#16356d"/></linearGradient>
    <linearGradient id="gField" x1="0" y1="0" x2="0" y2="1"><stop id="fd0" offset="0" stop-color="#4f9a62"/><stop id="fd1" offset="1" stop-color="#2a5a40"/></linearGradient>
    <linearGradient id="gGlint" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="pclip"><rect x="-120" y="-190" width="64" height="62"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#gSky)"/>
  <g id="stars">${stars.map((q) => `<circle cx="${q[0] * W}" cy="${q[1] * H}" r="${1 + q[2] * 1.2}" fill="#fff" opacity="0"/>`).join('')}</g>
  <circle id="sun" r="30" fill="#ffd66b"/><circle id="sunG" r="62" fill="#ffd66b" opacity=".25"/>
  <g id="clouds">${clouds.map(() => `<g><circle r="30" cx="0"/><circle r="26" cx="30" cy="-8"/><circle r="24" cx="-30" cy="-4"/><circle r="20" cx="56" cy="4"/><circle r="18" cx="-56" cy="6"/></g>`).join('')}</g>
  <path id="hill1" d="${hills(gy - 50, 22, 0.006, 1)}" fill="#6aa57c"/>
  <path id="hill2" d="${hills(gy - 24, 16, 0.009, 3)}" fill="#4d9166"/>
  <rect id="field" y="${gy}" width="${W}" height="${H - gy}" fill="url(#gField)"/>
  <g id="grass">${blades.map(() => `<path d="" fill="#3f8d58"/>`).join('')}</g>

  <g id="st" transform="translate(${sx},${sy}) scale(${sc})">
    <ellipse cx="0" cy="4" rx="70" ry="9" fill="rgba(0,0,0,.28)"/>
    <path d="M-4,-70 L-58,2 M4,-70 L58,2 M0,-70 L0,8" stroke="#9aa6b1" stroke-width="5" stroke-linecap="round"/>
    <rect x="-34" y="-8" width="68" height="10" rx="3" fill="#7b8895"/>
    <rect x="-6" y="-430" width="12" height="430" fill="url(#gMetal)"/>
    <rect x="-8" y="-90" width="16" height="12" rx="2" fill="#7b8895"/>
    <rect x="-104" y="-422" width="208" height="8" rx="3" fill="url(#gMetal)"/>
    <path d="M-60,-150 C-30,-150 -20,-140 -6,-140 M6,-150 L40,-150 M-6,-300 L-6,-160" stroke="#222c35" stroke-width="2" fill="none"/>

    <rect x="-88" y="-436" width="6" height="16" fill="#aab4bd"/>
    <g id="anemo" transform="translate(-85,-446) scale(2)"><g id="cups">
      ${[0, 1, 2].map((k) => `<g id="cup${k}"><line x1="0" y1="0" x2="26" y2="0" stroke="#c8d1d8" stroke-width="3"/><path d="M20,-9 A9,9 0 0 1 20,9 Z" fill="#e8edf1" stroke="#7b8895" stroke-width="1.5"/></g>`).join('')}
    </g><circle r="5" fill="#dfe6eb" stroke="#7b8895"/></g>

    <rect x="83" y="-436" width="4" height="14" fill="#aab4bd"/>
    <g transform="translate(85,-440)">
      <path d="M-26,10 H26" stroke="#7b8895" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="-26" cy="10" r="3" fill="#9aa6b1"/><circle cx="26" cy="10" r="3" fill="#9aa6b1"/>
      <text x="-26" y="26" font-size="9" text-anchor="middle" font-family="Geist Mono Variable, monospace" fill="#27323a">O</text>
      <text x="26" y="26" font-size="9" text-anchor="middle" font-family="Geist Mono Variable, monospace" fill="#27323a">L</text>
      <path d="M0,0 V10" stroke="#7b8895" stroke-width="3"/>
      <g id="vane">
        <rect x="-44" y="-2.2" width="86" height="4.4" rx="2.2" fill="#2b3a4a"/>
        <path d="M30,-10 L66,0 L30,10 L38,0 Z" fill="#f2b632" stroke="#9a6d0c" stroke-width="1"/>
        <path d="M-6,-2.2 L-26,-20 L-52,-24 L-42,0 L-52,24 L-26,20 L-6,2.2 Z" fill="#d7413a" stroke="#7a1f1b" stroke-width="1"/>
        <path d="M-26,-20 L-34,0 L-26,20" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6"/>
      </g>
      <circle r="5" fill="#e0a526" stroke="#9a6d0c"/>
    </g>

    <rect x="-80" y="-306" width="76" height="6" rx="2" fill="url(#gMetal)"/>
    <g transform="translate(-84,-300) scale(.7)">
      <rect x="-6" y="-4" width="12" height="60" fill="#8f9aa5"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${-22 - i * 1.6},${-62 + i * 9} L${22 + i * 1.6},${-62 + i * 9} L${26 + i * 1.6},${-55 + i * 9} L${-26 - i * 1.6},${-55 + i * 9} Z" fill="url(#gShield)" stroke="#aeb9c3" stroke-width="1"/>`).join('')}
      <path d="M-20,-66 Q0,-86 20,-66 Z" fill="#f3f6f8" stroke="#aeb9c3"/>
      <circle id="sensor" cx="0" cy="-34" r="4" fill="#ffb066"/>
    </g>

    <rect x="4" y="-296" width="78" height="6" rx="2" fill="url(#gMetal)"/>
    <g transform="translate(84,-292) scale(.8)">
      <rect x="-6" y="0" width="12" height="40" fill="#8f9aa5"/>
      <rect x="-30" y="-34" width="60" height="72" rx="6" fill="rgba(210,230,245,.45)" stroke="#aeb9c3" stroke-width="1.5"/>
      <rect id="water" x="-27" y="20" width="54" height="16" rx="3" fill="#38bdf8" opacity=".85"/>
      <path d="M-40,-46 L40,-46 L16,-30 L-16,-30 Z" fill="#dfe6eb" stroke="#8f9aa5" stroke-width="1.5"/>
      <ellipse cx="0" cy="-46" rx="40" ry="6" fill="#aeb9c3"/><ellipse cx="0" cy="-46" rx="32" ry="4.2" fill="#2a3640"/>
      <circle id="drip" cx="0" cy="-26" r="2.6" fill="#7dd3fc" opacity="0"/>
      <rect id="hall" x="30" y="-2" width="12" height="14" rx="2" fill="#27323a"/><circle id="hallLed" cx="36" cy="5" r="2.4" fill="#4ade80" opacity=".2"/>
    </g>

    <path d="M-56,-158 L-6,-158" stroke="#7b8895" stroke-width="4" stroke-linecap="round"/>
    <rect x="-120" y="-190" width="64" height="62" rx="2" fill="url(#gPanel)" stroke="#dfe6eb" stroke-width="2.4"/>
    <g clip-path="url(#pclip)">
      <line x1="-98.7" y1="-190" x2="-98.7" y2="-128" stroke="#8fb3ee" stroke-opacity=".55"/><line x1="-77.3" y1="-190" x2="-77.3" y2="-128" stroke="#8fb3ee" stroke-opacity=".55"/>
      <line x1="-120" y1="-169.3" x2="-56" y2="-169.3" stroke="#8fb3ee" stroke-opacity=".55"/><line x1="-120" y1="-148.7" x2="-56" y2="-148.7" stroke="#8fb3ee" stroke-opacity=".55"/>
      <rect id="pdim" x="-130" y="-200" width="84" height="82" fill="#06122b" opacity="0"/>
      <rect id="glint" x="-160" y="-200" width="18" height="82" fill="url(#gGlint)" transform="skewX(-14)"/>
    </g>

    <g transform="translate(30,-158) scale(.6) translate(-30,158)">
    <rect x="30" y="-214" width="78" height="112" rx="7" fill="url(#gBox)" stroke="#8f9aa5" stroke-width="1.5"/>
    <rect x="36" y="-208" width="66" height="100" rx="4" fill="none" stroke="#aeb9c3"/>
    <circle cx="69" cy="-178" r="10" fill="#2f6fd0"/><path d="M63,-178 q6,-8 12,0 q-6,8 -12,0" fill="#fff"/>
    <circle id="led" cx="94" cy="-196" r="3.6" fill="#4ade80"/>
    <rect x="52" y="-144" width="34" height="14" rx="3" fill="#27323a"/><rect id="batbar" x="54" y="-142" width="30" height="10" rx="2" fill="#4ade80"/>
    <rect x="92" y="-232" width="4" height="20" fill="#aab4bd"/><circle cx="94" cy="-236" r="4" fill="#dfe6eb"/>
    <g id="waves" transform="translate(94,-236)" fill="none" stroke="#7dd3fc" stroke-width="2.4" stroke-linecap="round">
      <path d="M-10,-6 A14,14 0 0 1 10,-6"/><path d="M-18,-12 A24,24 0 0 1 18,-12"/><path d="M-26,-18 A34,34 0 0 1 26,-18"/>
    </g>
    </g>
  </g>
  <g id="rainfx" stroke="rgba(190,225,248,.75)" stroke-width="1.5">${drops.map(() => `<line x1="0" y1="0" x2="0" y2="0"/>`).join('')}</g>
  <g id="leaders" stroke="rgba(255,255,255,.7)" stroke-width="1.4" fill="rgba(255,255,255,.9)"></g>`
      R = {}
      ;['sk0', 'sk1', 'fd0', 'fd1', 'sun', 'sunG', 'clouds', 'stars', 'grass', 'hill1', 'hill2', 'cups', 'vane', 'sensor', 'water', 'drip', 'hall', 'hallLed', 'glint', 'pdim', 'led', 'batbar', 'waves', 'rainfx', 'leaders']
        .forEach((id) => { R[id] = $(id) })

      cosEl!.innerHTML = ''
      CO.forEach((c, i) => {
        const [x, y, w] = lay.co[c.id]
        const d = document.createElement('div')
        d.className = 'fig-co'
        d.id = 'co-' + c.id
        d.style.cssText = `left:calc(var(--k)*${x});top:calc(var(--k)*${y});width:calc(var(--k)*${w})`
        d.innerHTML = `<h3><i class="fig-n">${i + 1}</i>${c.t}</h3><p>${c.s}</p><b></b><small></small>`
        cosEl!.appendChild(d)
      })
      let L = ''
      CO.forEach((c, i) => {
        const [x, y, w] = lay.co[c.id]
        const ax = sx + c.a[0] * sc, ay = sy + c.a[1] * sc, left = x + w / 2 < ax, x0 = left ? x + w : x, y0 = y + 34
        if (m === 'tall') L += `<circle cx="${ax}" cy="${ay}" r="11" fill="#2563eb" stroke="#fff" stroke-width="1.6"/><text x="${ax}" y="${ay + 4}" text-anchor="middle" font-size="12" font-family="Geist Mono Variable, monospace" fill="#fff" stroke="none">${i + 1}</text>`
        else L += `<path d="M${x0},${y0} L${ax},${ay}" fill="none"/><circle cx="${ax}" cy="${ay}" r="3.6"/>`
      })
      R.leaders.innerHTML = L
      text()
    }

    function text() {
      const Lv = live.current
      CO.forEach((c) => {
        const e = cosEl!.querySelector('#co-' + c.id)
        if (!e) return
        e.querySelector('b')!.textContent = c.v(Lv)
        e.querySelector('small')!.textContent = c.x(Lv)
      })
    }

    // ---- animação
    let angCups = 0, vaneSx = 0.7, last = performance.now(), acc = 0, glintX = -160, txPhase = -1, lastTs = live.current.ts, visible = true, raf = 0
    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible) { last = nowMs; return }
      const dt = Math.min(0.05, (nowMs - last) / 1000)
      last = nowMs
      const t = nowMs / 1000, Lv = live.current, hr = hourNow()
      const { W, H, gy } = lay, dl = dayL(hr), n = 1 - dl
      const A = (el: SVGElement, k: string, v: string | number) => el.setAttribute(k, String(v))

      A(R.sk0, 'stop-color', mix('#3b82c4', '#050a1c', n)); A(R.sk1, 'stop-color', mix('#cfeaf7', '#1a2748', n))
      A(R.fd0, 'stop-color', mix('#4f9a62', '#0c2420', n)); A(R.fd1, 'stop-color', mix('#2a5a40', '#07110f', n))
      A(R.hill1, 'fill', mix('#6aa57c', '#16303a', n)); A(R.hill2, 'fill', mix('#4d9166', '#10282c', n))
      Array.from(R.stars.children).forEach((c, i) => A(c as SVGElement, 'opacity', (n > 0.3 ? (0.4 + 0.6 * Math.abs(Math.sin(t * stars[i][2] * 2 + i))) * (n - 0.3) : 0).toFixed(2)))

      const day = hr >= 6 && hr <= 18
      const p = day ? (hr - 6) / 12 : (hr < 6 ? hr + 6 : hr - 18) / 12
      const bx = W * (0.1 + 0.8 * p), by = gy - 30 - Math.sin(p * Math.PI) * gy * 0.62
      A(R.sun, 'cx', bx); A(R.sun, 'cy', by); A(R.sun, 'fill', day ? '#ffd66b' : '#e8eefc')
      A(R.sunG, 'cx', bx); A(R.sunG, 'cy', by); A(R.sunG, 'fill', day ? '#ffd66b' : '#9fb4ff')

      const spd = Lv.ws / 3.6, east = Math.sin(rad(Lv.wd + 180)) >= 0 ? 1 : -1, rainy = Lv.rain > 0.1
      Array.from(R.clouds.children).forEach((g, i) => {
        const c = clouds[i]
        c.x += east * (spd * 0.004 + 0.002) * dt * (0.5 + c.s * 0.5)
        if (c.x > 1.25) c.x = -0.25
        if (c.x < -0.25) c.x = 1.25
        A(g as SVGElement, 'transform', `translate(${c.x * W},${c.y * H}) scale(${c.s})`)
        A(g as SVGElement, 'fill', rainy ? mix('#8794a3', '#2b3544', n) : mix('#ffffff', '#3a4560', n))
        A(g as SVGElement, 'opacity', '.9')
      })
      const sway = east * clamp(Lv.ws / 45, 0.04, 0.55) + Math.sin(t * 2) * 0.05 * clamp(Lv.ws / 20, 0.2, 1)
      Array.from(R.grass.children).forEach((g, i) => {
        const b = blades[i], x = b.x * W, y = gy + 8 + (i % 5) * ((H - gy - 12) / 5)
        const lean = sway * b.h * 0.9 + Math.sin(t * 3 + b.ph) * clamp(Lv.ws / 30, 0.1, 1) * 2.5
        A(g as SVGElement, 'd', `M${x - 1.6},${y} Q${x},${y - b.h * 0.6} ${x + lean},${y - b.h} Q${x + 1},${y - b.h * 0.5} ${x + 1.6},${y}Z`)
        A(g as SVGElement, 'fill', mix('#3f8d58', '#0b1f1a', n))
      })

      // anemômetro: rotação fixa, como se o vento fosse 1 km/h (a real é rápida demais para ver)
      const real = 1 / 3.6 / 0.42, vis = reduce ? 0.3 : 2.4 * Math.tanh(real / 2.4)
      angCups += vis * TAU * dt
      ;[0, 1, 2].map((k) => ({ k, a: angCups + (k * TAU) / 3 })).sort((u, v) => Math.sin(u.a) - Math.sin(v.a)).forEach(({ k, a }) => {
        const g = $('cup' + k), x = Math.cos(a), dp = Math.sin(a)
        A(g, 'transform', `translate(0,${(dp * 3.5).toFixed(2)}) scale(${x.toFixed(3)},1)`)
        ;(g as unknown as HTMLElement).style.opacity = (0.62 + (0.38 * (dp + 1)) / 2).toFixed(2)
        R.cups.appendChild(g)
      })
      let target = Math.sin(rad(Lv.wd))
      if (Math.abs(target) < 0.14) target = 0.14 * (Math.sign(target) || 1)
      vaneSx += (target - vaneSx) * Math.min(1, dt * 3)
      A(R.vane, 'transform', `scale(${vaneSx.toFixed(3)},1)`)

      const th = clamp((Lv.temp + 5) / 45, 0, 1)
      A(R.sensor, 'fill', th < 0.5 ? mix('#60a5fa', '#4ade80', th * 2) : mix('#fbbf24', '#ef4444', (th - 0.5) * 2))

      const lvl = clamp(Lv.dayRain / 25, 0.04, 0.95)
      A(R.water, 'y', 36 - lvl * 52); A(R.water, 'height', lvl * 52)
      const rate = Lv.rain > 0.05 ? clamp(0.8 + Lv.rain * 0.4, 0.8, 6) : 0, dph = rate ? (t * rate) % 1 : -1
      A(R.drip, 'opacity', rate ? (dph < 0.7 ? 1 : 0) : 0); A(R.drip, 'cy', -26 + dph * 50)
      const tip = !!rate && dph > 0.7 && dph < 0.86
      A(R.hallLed, 'opacity', tip ? 1 : 0.2); A(R.hall, 'fill', tip ? '#14532d' : '#27323a')

      const slant = east * clamp(Lv.ws / 40, 0, 1) * 10, nd = rainy ? Math.min(drops.length, Math.round(Lv.rain * 7 + 12)) : 0
      Array.from(R.rainfx.children).forEach((l, i) => {
        const el = l as SVGElement
        if (i >= nd) { A(el, 'x2', el.getAttribute('x1') ?? 0); A(el, 'y2', el.getAttribute('y1') ?? 0); return }
        const d = drops[i]
        d.y += dt * d.v * 1.25
        if (d.y > 1) d.y = 0
        const x = (d.x * W + d.y * slant * 40) % W, y = d.y * H
        A(el, 'x1', x); A(el, 'y1', y); A(el, 'x2', x - slant * 0.7); A(el, 'y2', y + 16)
      })

      const se = sunE(hr) * (rainy ? 0.3 : 1)
      A(R.pdim, 'opacity', (0.6 * (1 - clamp(se * 1.1, 0, 1))).toFixed(2))
      glintX += dt * (30 + se * 40)
      if (glintX > -30) glintX = -160 - Math.random() * 160
      A(R.glint, 'x', glintX); A(R.glint, 'opacity', se > 0.15 ? clamp(se, 0, 1) : 0)

      if (Lv.ts !== lastTs) { lastTs = Lv.ts; txPhase = 0 } // chegou leitura nova: mostra o envio
      if (txPhase >= 0) { txPhase += dt * 0.55; if (txPhase > 1.6) txPhase = -1 }
      A(R.led, 'fill', txPhase >= 0 ? '#7dd3fc' : '#4ade80')
      A(R.led, 'opacity', txPhase >= 0 ? 1 : (0.45 + 0.55 * Math.abs(Math.sin(t * 1.6))).toFixed(2))
      Array.from(R.waves.children).forEach((w, i) => A(w as SVGElement, 'opacity', (txPhase < 0 ? 0 : clamp(1 - Math.abs(txPhase - (i * 0.28 + 0.2)) * 3.2, 0, 1)).toFixed(2)))
      A(R.batbar, 'width', (30 * Lv.pct / 100).toFixed(1)); A(R.batbar, 'fill', Lv.pct < 20 ? '#f87171' : Lv.pct < 40 ? '#fbbf24' : '#4ade80')

      acc += dt
      if (acc > 0.25) { acc = 0; text() }
    }

    const pick = (): Mode => (hostEl.clientWidth < 760 ? 'tall' : 'wide')
    build(pick())
    raf = requestAnimationFrame(frame)
    const ro = new ResizeObserver(() => { const m = pick(); if (m !== mode) build(m) })
    ro.observe(hostEl)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.01 })
    io.observe(stageEl)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [])

  return (
    <div ref={host} className="w-full">
      <div
        ref={stage}
        className="fig-stage"
        data-mode="wide"
        role="img"
        aria-label={`${station.name}: estação com anemômetro, veleta, sensor de temperatura e umidade, pluviômetro, painel solar e datalogger, com as medições atuais`}
      >
        <svg ref={svg} preserveAspectRatio="xMidYMid slice" aria-hidden="true" />
        <div ref={cos} />
        <div className="fig-badge">{station.name}{station.city ? ` · ${station.city}` : ''}</div>
      </div>
    </div>
  )
}
