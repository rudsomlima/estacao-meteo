import { useEffect, useRef, useState } from 'react'
import photo from '../assets/cenario-estacao.jpg'
import type { Reading, Station } from '../types'
import { buildLive, CO } from './StationFigure'
import './figure.css'

const W = 1000, H = 667
// ponto do sensor na foto e posição da caixa (colunas laterais), em unidades de um palco de 1000 de largura
const POS: Record<string, { a: [number, number]; box: [number, number, number] }> = {
  anemo: { a: [368, 71], box: [10, 40, 230] },
  shield: { a: [342, 187], box: [10, 200, 230] },
  solar: { a: [430, 367], box: [10, 360, 230] },
  vane: { a: [586, 65], box: [760, 40, 230] },
  rain: { a: [589, 220], box: [760, 200, 230] },
  logger: { a: [510, 427], box: [760, 360, 230] },
}

/** Ajuste de cor da foto pela hora do dia (amanhecer, dia, entardecer, noite). */
function timeFilter(h: number) {
  if (h < 5 || h >= 19) return 'brightness(.36) saturate(.7) hue-rotate(20deg) contrast(1.15)'
  if (h < 7) return 'sepia(.3) hue-rotate(-30deg) saturate(1.1) brightness(.92)'
  if (h >= 17) return 'sepia(.55) saturate(1.5) hue-rotate(-18deg) brightness(.92) contrast(1.05)'
  return ''
}

/** Ajuste pelo tempo, deduzido das leituras: chuva, neblina (ar quase saturado) ou céu encoberto (umidade alta). */
function weather(rain: number, hum: number) {
  if (rain > 0.1) return { f: 'grayscale(.7) brightness(.75) contrast(.95)', rain: true, fog: 0 }
  if (Number.isFinite(hum) && hum >= 93) return { f: 'saturate(.55) contrast(.78) brightness(1.1)', rain: false, fog: 0.35 }
  if (Number.isFinite(hum) && hum >= 85) return { f: 'grayscale(.45) brightness(.88)', rain: false, fog: 0 }
  return { f: '', rain: false, fog: 0 }
}

/** Versão com foto: o fundo muda com a hora e o tempo, e as medições ficam ligadas a cada sensor. */
export default function PhotoFigure({ station, readings }: { station: Station; readings: Reading[] }) {
  const host = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const pick = () => setNarrow(el.clientWidth < 760)
    pick()
    const ro = new ResizeObserver(pick)
    ro.observe(el)
    const t = setInterval(() => tick((n) => n + 1), 1000) // contagem até a próxima leitura e troca de hora
    return () => { ro.disconnect(); clearInterval(t) }
  }, [])

  const L = buildLive(station, readings)
  const d = new Date(), hr = d.getHours() + d.getMinutes() / 60
  const w = weather(L.rain, L.hum)
  const filter = [w.f, timeFilter(hr)].filter(Boolean).join(' ') || 'none'

  const items = CO.map((c, i) => ({ c, i, p: POS[c.id], v: c.v(L), x: c.x(L) }))
  const box = (it: (typeof items)[number], flow: boolean) => (
    <div
      key={it.c.id} className="fig-co" id={`co-${it.c.id}`}
      style={flow ? undefined : { left: `calc(var(--k)*${it.p.box[0]})`, top: `calc(var(--k)*${it.p.box[1]})`, width: `calc(var(--k)*${it.p.box[2]})` }}
    >
      <h3><i className="fig-n" style={flow ? { display: 'inline-grid' } : undefined}>{it.i + 1}</i>{it.c.t}</h3>
      <p>{it.c.s}</p><b>{it.v}</b><small>{it.x}</small>
    </div>
  )

  return (
    <div ref={host} className="w-full">
      <div
        className="fig-stage fig-photo" data-mode={narrow ? 'tall' : 'wide'} style={{ aspectRatio: `${W} / ${H}`, ...(narrow ? { '--k': 'calc(100cqw / 520)', maxWidth: 'none' } : { '--k': 'calc(100cqw / 1000)' }) } as React.CSSProperties}
        role="img" aria-label={`${station.name}: foto da estação com as medições atuais`}
      >
        <div className="ph-img" style={{ backgroundImage: `url(${photo})`, filter }} />
        <div className="ph-fog" style={{ opacity: w.fog }} />
        {w.rain && <div className="ph-rain" />}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" stroke="rgba(255,255,255,.75)" strokeWidth="1.6" fill="rgba(255,255,255,.95)">
          {items.map((it) => {
            const [bx, by, bw] = it.p.box, left = bx < W / 2
            return narrow
              ? <g key={it.c.id}><circle cx={it.p.a[0]} cy={it.p.a[1]} r="13" fill="#2563eb" stroke="#fff" strokeWidth="2" /><text x={it.p.a[0]} y={it.p.a[1] + 5} textAnchor="middle" fontSize="14" fill="#fff" stroke="none">{it.i + 1}</text></g>
              : <g key={it.c.id}><path d={`M${left ? bx + bw : bx},${by + 34} L${it.p.a[0]},${it.p.a[1]}`} fill="none" /><circle cx={it.p.a[0]} cy={it.p.a[1]} r="4" /></g>
          })}
        </svg>
        {!narrow && items.map((it) => box(it, false))}
        <div className="fig-badge">{station.name}{station.city ? ` · ${station.city}` : ''}</div>
      </div>
      {narrow && <div className="fig-photo-list mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{items.map((it) => box(it, true))}</div>}
    </div>
  )
}
