import { useEffect, useState } from 'react'
import { beaufort, compass16, dayStats, dewPoint, feelsLike } from '../lib/derive'
import type { Reading, Station } from '../types'
import { buildLive } from './StationFigure'
import './dio.css'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const pt = (a: number, r: number): [number, number] => [75 + Math.sin((a * Math.PI) / 180) * r, 70 - Math.cos((a * Math.PI) / 180) * r]
const arc = (a0: number, a1: number, r: number) => {
  const p0 = pt(a0, r), p1 = pt(a1, r)
  return `M${p0[0].toFixed(1)},${p0[1].toFixed(1)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`
}

/** Mostrador em arco de 240°: o ponteiro e o arco colorido vão do mínimo ao máximo. */
function Dial({ min, max, ticks, value, text, label }: { min: number; max: number; ticks: number[]; value: number; text: string; label: string }) {
  const ok = Number.isFinite(value)
  const a = -120 + clamp(ok ? (value - min) / (max - min) : 0, 0, 1) * 240
  return (
    <svg className="dial" viewBox="0 0 150 110" role="img" aria-label={`${label}: ${text}`}>
      <path d={arc(-120, 120, 52)} fill="none" stroke="#2c4a63" strokeWidth="9" strokeLinecap="round" />
      {ok && <path d={arc(-120, Math.max(-119, a), 52)} fill="none" stroke="#46c3ee" strokeWidth="9" strokeLinecap="round" />}
      {ticks.map((t) => { const p = pt(-120 + ((t - min) / (max - min)) * 240, 64); return <text key={t} x={p[0]} y={p[1] + 3} fontSize="9" textAnchor="middle">{t}</text> })}
      {ok && <g transform={`translate(75,70) rotate(${a})`}><path d="M-2.5,0 L0,-46 L2.5,0Z" fill="#f2f6fa" /></g>}
      <circle cx="75" cy="70" r="5" fill="#e8eef3" />
      <text x="75" y="98" fontSize="11" textAnchor="middle">{text}</text>
    </svg>
  )
}

/** Cena em diorama: um instrumento 3D para cada medição da estação, todos com os valores ao vivo. */
export default function DioramaFigure({ station, readings }: { station: Station; readings: Reading[] }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, []) // contagem da próxima leitura

  const L = buildLive(station, readings)
  const f = L.f
  const now = readings[readings.length - 1]
  const day = dayStats(readings)
  const bf = beaufort(now.wind)
  const dew = dewPoint(now.temp, now.hum)
  const feels = feelsLike(now.temp, now.hum, now.wind)
  const hasDir = Number.isFinite(L.wd)
  const hum = Number.isFinite(now.hum), pres = Number.isFinite(now.pres)
  const hr = new Date().getHours()
  const left = Math.max(0, Math.round(L.ts + L.intervalS - Date.now() / 1000))
  const rev = L.ws < 1 ? 0 : Math.max(0.25, 14 / L.ws)
  const hw = (y: number) => 7 - ((y + 9) / 50) * 4

  return (
    <div className="dio" role="group" aria-label={`${station.name}: instrumentos com as medições atuais`}>
      <div className="grid3d" />
      <div className="badge">{station.name}{station.city ? ` · ${station.city}` : ''}</div>
      <div className="stage" style={{ paddingTop: 18 }}>
        <figure>
          <div className="scene"><div className="shield">
            <div className="slats">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>
            <div className="th"><div className="t"><i style={{ '--h': `${clamp(((now.temp + 10) / 55) * 100, 8, 100)}%` } as React.CSSProperties} /></div><div className="b" /></div>
            <div className="post mastx" />
          </div></div>
          <figcaption><i>Temperatura</i><b>{f.temp(now.temp)}</b>mín {f.tempShort(day.tMin)} · máx {f.tempShort(day.tMax)}</figcaption>
        </figure>

        <figure>
          <div className="scene"><Dial min={0} max={100} ticks={[0, 25, 50, 75, 100]} value={now.hum} text={hum ? `${Math.round(now.hum)} %` : '—'} label="Umidade relativa" /></div>
          <figcaption><i>Umidade</i><b>{hum ? `${Math.round(now.hum)} %` : '—'}</b>{hum ? `orvalho ${f.tempShort(dew)}` : 'sensor sem umidade'}</figcaption>
        </figure>

        <figure>
          <div className="scene"><Dial min={960} max={1060} ticks={[960, 1000, 1060]} value={now.pres} text={pres ? `${Math.round(now.pres)} hPa` : '—'} label="Pressão" /></div>
          <figcaption><i>Pressão</i><b>{pres ? f.pres(now.pres) : '—'}</b>{pres ? 'ao nível da estação' : 'sensor sem pressão'}</figcaption>
        </figure>

        <figure>
          <div className="scene"><div className="anemo"><div className="mast mastx" /><div className="rotor" style={{ animationDuration: `${rev || 2}s`, animationPlayState: rev ? 'running' : 'paused' }}>
            <div className="hub" />
            {[0, 120, 240].map((a) => <div key={a} className="arm" style={{ transform: `rotateY(${a}deg)` }}><div className="cup" /></div>)}
          </div></div></div>
          <figcaption><i>Anemômetro</i><b>{f.wind(now.wind)}</b>rajada {f.wind(now.gust)} · Beaufort {bf.n}</figcaption>
        </figure>

        <figure>
          <div className="scene"><div className="vs">
            <svg viewBox="-50 -50 100 100" aria-hidden="true">
              <circle r="44" fill="#0b1b2e" fillOpacity=".82" stroke="#cbd5df" strokeWidth="2" />
              <g stroke="#7f95aa" strokeWidth="1.2">{Array.from({ length: 16 }, (_, i) => <path key={i} d={`M0,-41 V${i % 4 ? -37 : -33}`} transform={`rotate(${i * 22.5})`} />)}</g>
              <g fontFamily="Geist Mono Variable, monospace" fontSize="11" textAnchor="middle" fill="#dbe6f0">
                <text y="-29" fill="#ff7a70" fontWeight="700">N</text><text y="37">S</text><text x="-34" y="4">O</text><text x="34" y="4">L</text>
              </g>
              <g id="dio-sock" style={{ transform: `rotate(${hasDir ? L.wd : 0}deg)` }} opacity={hasDir ? 1 : 0.3}>
                <path d="M0,0 V-11" stroke="#2b3a4a" strokeWidth="2.6" strokeLinecap="round" />
                {[0, 1, 2, 3, 4].map((i) => { const y0 = -9 + i * 10, y1 = y0 + 10; return <path key={i} d={`M${-hw(y0)},${y0} L${hw(y0)},${y0} L${hw(y1)},${y1} L${-hw(y1)},${y1}Z`} fill={i % 2 ? '#fff' : '#f26a1b'} stroke="#7a3a10" strokeWidth=".8" /> })}
                <rect x="-8.5" y="-11" width="17" height="4" rx="2" fill="#2b3a4a" />
              </g>
              <circle r="3.5" fill="#e0a526" stroke="#9a6d0c" />
            </svg>
          </div></div>
          <figcaption><i>Biruta e rosa dos ventos</i><b>{hasDir ? `${compass16(L.wd)} ${Math.round(L.wd)}°` : '—'}</b>{hasDir ? `vento vindo de ${compass16(L.wd)}` : 'sem leitura da biruta'}</figcaption>
        </figure>

        <figure>
          <div className="scene"><div className={`gauge${L.rain > 0.05 ? ' rain' : ''}`} style={{ '--lvl': `${clamp((L.dayRain / 25) * 95, 4, 95)}%` } as React.CSSProperties}><div className="tube"><div className="water" /></div><div className="funnel" /><div className="drop" /></div></div>
          <figcaption><i>Pluviômetro</i><b>{f.rain(L.dayRain)}</b>hoje · {f.rain(L.rain)} na última hora</figcaption>
        </figure>

        <figure>
          <div className="scene"><div className="sol" style={{ '--dim': hr >= 6 && hr <= 18 ? 0.1 : 0.6, '--sun': hr >= 6 && hr <= 18 ? 1 : 0.15 } as React.CSSProperties}><div className="sun" /><div className="leg mastx" /><div className="pan" /></div></div>
          <figcaption><i>Painel solar</i><b>{L.dv > 0.02 ? 'carregando' : L.dv < -0.02 ? 'descarregando' : 'estável'}</b>{L.dv >= 0 ? '+' : ''}{L.dv.toFixed(2)} V em 3 h</figcaption>
        </figure>

        <figure>
          <div className="scene"><div className="log"><div className="ant" /><div className="box"><i className="led" /><div className="lcd">{L.pct} %</div><div className="bat"><i style={{ width: `${L.pct}%`, background: L.pct < 20 ? '#f87171' : L.pct < 40 ? '#fbbf24' : '#4ade80' }} /></div></div><div className="leg mastx" /></div></div>
          <figcaption><i>Datalogger e transmissor</i><b>{L.vbat.toFixed(2)} V</b>próxima leitura em {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</figcaption>
        </figure>
      </div>

      <div className="dock">
        <div><span>Sensação</span><b>{f.tempShort(feels)}</b></div>
        <div><span>Ponto de orvalho</span><b>{hum ? f.tempShort(dew) : '—'}</b></div>
        <div><span>Média hoje</span><b>{f.wind(day.windAvg)}</b></div>
        <div><span>Rajada máx hoje</span><b>{f.wind(day.gustMax)}</b></div>
        <div><span>Chuva na hora</span><b>{f.rain(day.rainHour)}</b></div>
        <div><span>Bateria</span><b>{L.pct}%</b></div>
      </div>
    </div>
  )
}
