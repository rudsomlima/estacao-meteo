import { AlertTriangle, CircleCheck, Cpu, Download, ExternalLink, Power, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { ago } from '../lib/derive'
import type { Reading, Station, StationEvent } from '../types'

const RESET: Record<number, string> = {
  1: 'ligou na energia', 2: 'reset externo', 3: 'reinício por software', 4: 'falha do programa (panic)', 5: 'watchdog de interrupção',
  6: 'watchdog de tarefa', 7: 'watchdog', 8: 'acordou do sono', 9: 'queda de tensão (brownout)', 10: 'reset SDIO', 11: 'reset USB',
  12: 'reset JTAG', 13: 'reset eFuse', 14: 'oscilação na alimentação', 15: 'CPU travou',
}
const ABNORMAL = new Set([4, 5, 6, 7, 9, 14, 15])

const when = (ts: number) => new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function line(e: StationEvent) {
  switch (e.kind) {
    case 'boot': {
      const r = Number(e.reason)
      const bad = ABNORMAL.has(r)
      return { icon: bad ? AlertTriangle : Power, bad, text: RESET[r] ?? `motivo ${r}`, sub: `reinício nº ${e.count ?? '?'}` }
    }
    case 'ota_ok': return { icon: Download, bad: false, text: `atualizada para a versão ${String(e.version)}`, sub: 'firmware pelo ar' }
    case 'ota_fail': return { icon: AlertTriangle, bad: true, text: `falha ao atualizar na etapa "${String(e.stage)}"`, sub: e.http ? `HTTP ${String(e.http)}` : 'firmware pelo ar' }
    case 'bench': return { icon: Wrench, bad: false, text: `modo bancada por ${String(e.minutes)} min`, sub: '' }
    default: return { icon: CircleCheck, bad: false, text: String(e.kind), sub: '' }
  }
}

/** Reinícios e eventos que a estação conta junto com as leituras. */
export default function DiagnosticsPanel({ station, readings, events }: { station: Station; readings: Reading[]; events: StationEvent[] }) {
  const now = readings[readings.length - 1]
  const day = useMemo(() => {
    const since = Date.now() / 1000 - 86400
    const boots = events.filter((e) => e.kind === 'boot' && e.ts >= since)
    return { boots: boots.length, bad: boots.filter((e) => ABNORMAL.has(Number(e.reason))).length, brown: boots.filter((e) => Number(e.reason) === 9).length }
  }, [events])

  return (
    <div className="grid gap-4">
      <dl className="num grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="flex items-center gap-1.5 text-xs text-ink-3"><Cpu className="h-3.5 w-3.5" aria-hidden /> Firmware</dt><dd>{station.fw_version ?? 'desconhecido'}</dd></div>
        <div><dt className="text-xs text-ink-3">Último contato</dt><dd>{station.last_seen ? ago(station.last_seen) : 'nunca'}</dd></div>
        <div><dt className="text-xs text-ink-3">Sinal do Wi-Fi</dt><dd>{now.rssi} dBm</dd></div>
        <div><dt className="text-xs text-ink-3">Reinícios em 24 h</dt><dd className={day.bad ? 'text-warn' : ''}>{day.boots}{day.bad ? ` · ${day.bad} anormais` : ''}</dd></div>
      </dl>
      {day.brown > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {day.brown} queda{day.brown > 1 ? 's' : ''} de tensão nas últimas 24 h. Em estação solar costuma ser bateria fraca, regulador limitado ou falta do capacitor de 470 µF.
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-ink-3">Nenhum evento ainda. Os reinícios que não são o sono de rotina, as atualizações e o modo bancada aparecem aqui.</p>
      ) : (
        <ul className="grid divide-y divide-line">
          {events.map((e, i) => {
            const l = line(e)
            const Icon = l.icon
            const ip = e.kind === 'bench' && typeof e.ip === 'string' ? e.ip : ''
            return (
              <li key={`${e.ts}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${l.bad ? 'text-warn' : 'text-ink-3'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={l.bad ? 'text-warn' : ''}>{l.text}</span>
                  <span className="num block text-xs text-ink-3">
                    {l.sub}
                    {ip && (
                      <>
                        {l.sub ? ' · ' : ''}
                        <a className="inline-flex items-center gap-1 text-cyan underline" href={`http://${ip}`} target="_blank" rel="noreferrer">
                          abrir a página local {ip} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-ink-3">{when(e.ts)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
