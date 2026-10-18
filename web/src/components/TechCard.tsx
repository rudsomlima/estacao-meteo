import { ArrowRight, BatteryCharging, Settings, Wifi } from 'lucide-react'
import { batteryPct, CHEMS } from '../lib/battery'
import { cycle } from '../lib/energy'
import { go } from '../hooks/useRoute'
import type { Reading, Station } from '../types'
import Reveal from './Reveal'

/** Resumo técnico no fim da página da estação, com a porta de entrada para as Configurações. */
export default function TechCard({ station, readings }: { station: Station; readings: Reading[] }) {
  const now = readings[readings.length - 1]
  const c = station.config
  const est = cycle(c)
  const pct = batteryPct(now.vbat, c.battery_chem)
  const mode = c.continuous_wind === 1 ? 'vento contínuo' : 'vento por janela'

  return (
    <section id="tecnica" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <Reveal className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="num flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-cyan"><Settings className="h-3.5 w-3.5" aria-hidden /> Parte técnica</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Energia, sensores e configuração</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-2">Ciclo de sono, autonomia da bateria, estado dos sensores e a configuração que a estação baixa a cada envio.</p>
          </div>
          <button onClick={() => go(`s/${station.id}/config`)} className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">
            Abrir configurações <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="num mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="flex items-center gap-1.5 text-xs text-ink-3"><BatteryCharging className="h-3.5 w-3.5" aria-hidden /> Bateria</dt><dd>{pct}% · {CHEMS[c.battery_chem].label}</dd></div>
          <div><dt className="text-xs text-ink-3">Autonomia estimada</dt><dd>~{Math.round(est.days)} dias</dd></div>
          <div><dt className="text-xs text-ink-3">Ciclo</dt><dd>a cada {c.interval_min} min · {mode}</dd></div>
          <div><dt className="flex items-center gap-1.5 text-xs text-ink-3"><Wifi className="h-3.5 w-3.5" aria-hidden /> Envio</dt><dd>a cada {c.send_every} leitura{c.send_every > 1 ? 's' : ''} · {now.rssi} dBm</dd></div>
        </dl>
      </Reveal>
    </section>
  )
}
