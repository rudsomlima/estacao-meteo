import { Battery, Droplets, Gauge, MapPin, Thermometer, Waves, Wind } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { batteryPct, CHEMS } from '../lib/battery'
import { beaufort, compass16, dayStats, dewPoint, feelsLike, trend } from '../lib/derive'
import { currentCondition } from '../lib/outlook'
import { useScene } from '../lib/scene'
import { useFmt } from '../lib/units'
import type { Reading, Station } from '../types'
import DioramaFigure from './DioramaFigure'
import PhotoFigure from './PhotoFigure'
import StationFigure from './StationFigure'

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Wind; label: string; value: string; sub?: string }) {
  const long = value.length > 9 // "14.0° / 19.4°", "1013.2 hPa": letra menor para caber numa linha
  return (
    <div className="rounded-2xl border border-line bg-card p-3.5 transition-colors hover:border-line-hover">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-3">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <div className={`mt-1 whitespace-nowrap font-display font-bold leading-none tracking-tight ${long ? 'text-xl' : 'text-2xl'}`}>{value}</div>
      {sub && <div className="num mt-1 text-xs text-ink-2">{sub}</div>}
    </div>
  )
}

export default function Hero({ readings, station }: { readings: Reading[]; station: Station }) {
  const config = station.config
  const scene = useScene()
  const f = useFmt()
  const now = readings[readings.length - 1]
  const day = useMemo(() => dayStats(readings), [readings])
  const hasWind = (config.has_wind ?? 1) === 1
  const hasRain = (config.has_rain ?? 1) === 1
  const bf = beaufort(now.wind)
  const dew = dewPoint(now.temp, now.hum)
  const feels = feelsLike(now.temp, now.hum, now.wind)
  const pct = batteryPct(now.vbat, config.battery_chem)
  const dPres = useMemo(() => trend(readings, (r) => r.pres, 3), [readings])
  const outlook = useMemo(() => currentCondition(now, readings, day, config), [now, readings, day, config])

  return (
    <section id="agora" className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
        <p className="num flex items-center gap-1.5 text-xs text-ink-2">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {station.city ? `${station.city} · ` : ''}{station.lat.toFixed(4)}, {station.lon.toFixed(4)} · {station.alt.toFixed(0)} m
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-x-10 gap-y-3">
          <h1 className="font-display font-extrabold leading-[0.9] tracking-[-0.045em]" style={{ fontSize: 'clamp(4rem, 12vw, 8.5rem)' }}>
            {f.tempV(now.temp)}<span className="align-top text-[0.34em] font-medium text-ink-2">{f.tempUnit}</span>
          </h1>
          <p className="max-w-md pb-2 text-base text-ink-2 sm:text-lg">
            {hasWind && (
              <>Vento{Number.isFinite(now.dir) ? <> de <b className="text-ink">{compass16(now.dir)}</b></> : ''} a <b className="num text-ink">{f.wind(now.wind)}</b> ({bf.name.toLowerCase()}).{' '}</>
            )}
            {outlook}
          </p>
        </div>
      </motion.div>

      <motion.div className="mt-8" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}>
        {scene === 'foto' ? <PhotoFigure station={station} readings={readings} /> : scene === 'diorama' ? <DioramaFigure station={station} readings={readings} /> : <StationFigure station={station} readings={readings} />}
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        <Tile icon={Thermometer} label="Mín / Máx" value={`${f.tempShort(day.tMin)} / ${f.tempShort(day.tMax)}`} sub={`sensação ${f.tempShort(feels)}`} />
        <Tile icon={Droplets} label="Umidade" value={Number.isFinite(now.hum) ? `${now.hum.toFixed(0)}%` : '—'} sub={Number.isFinite(now.hum) ? `orvalho ${f.tempShort(dew)}` : 'sensor sem umidade'} />
        <Tile icon={Gauge} label="Pressão" value={Number.isFinite(now.pres) ? f.pres(now.pres) : '—'} sub={Number.isFinite(now.pres) ? `${dPres >= 0 ? '↑' : '↓'} ${Math.abs(f.presNum(dPres)).toFixed(f.presUnit === 'inHg' ? 2 : 1)} em 3 h` : 'sensor sem pressão'} />
        {hasWind && <Tile icon={Wind} label="Rajada" value={f.wind(now.gust)} sub={`máx hoje ${f.windV(day.gustMax)}`} />}
        {hasWind && <Tile icon={Waves} label="Beaufort" value={`${bf.n}`} sub={bf.name} />}
        {hasRain && <Tile icon={Droplets} label="Chuva hoje" value={f.rain(day.rainDay)} sub={`${f.rain(day.rainHour)} na última hora`} />}
        <Tile icon={Battery} label="Bateria" value={`${now.vbat.toFixed(2)} V`} sub={`${pct}% · ${CHEMS[config.battery_chem].label}`} />
        {hasWind && <Tile icon={Wind} label="Média hoje" value={f.wind(day.windAvg)} sub="vento" />}
      </div>
    </section>
  )
}
