import { Check, Hourglass } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Station } from '../types'

/** Mostra se a estação já pegou a última configuração salva ("pendente" ou "aplicada"). */
export default function ConfigStatus({ station }: { station: Station }) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() / 1000), 15_000)
    return () => clearInterval(t)
  }, [])

  const v = station.config.version
  if (station.cfg_applied === v) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
        <Check className="h-4 w-4 shrink-0" aria-hidden /> Configuração v{v} aplicada: a estação confirmou que tem esta versão.
      </p>
    )
  }
  const every = station.config.interval_min * Math.max(1, station.config.send_every)
  const next = station.last_seen ? station.last_seen + every * 60 : null
  const left = next ? Math.max(0, Math.round((next - now) / 60)) : null
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
      <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        Versão {v} salva, mas a estação ainda tem a {station.cfg_applied}.{' '}
        {left === null ? 'Aguardando o primeiro contato.' : left === 0 ? 'Ela deve pegar no próximo envio, a qualquer momento.' : `Próximo envio em cerca de ${left} min.`}
      </span>
    </p>
  )
}
