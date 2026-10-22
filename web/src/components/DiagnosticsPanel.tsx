import { AlertTriangle, CircleCheck, Cpu, Download, ExternalLink, Power, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNow } from '../hooks/useNow'
import { ago } from '../lib/derive'
import { cancelStationCommand, clearStationData, clearStationEvents, restartStation } from '../lib/admin'
import { commandStatus } from '../lib/command'
import { useIsAdmin } from '../lib/session'
import { ApiError } from '../lib/api'
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
    case 'ota_fail': return e.stage === 'bateria'
      ? { icon: AlertTriangle, bad: false, text: 'atualização adiada: bateria baixa', sub: 'a estação tenta de novo quando a bateria subir' }
      : { icon: AlertTriangle, bad: true, text: `falha ao atualizar na etapa "${String(e.stage)}"`, sub: e.http ? `HTTP ${String(e.http)}` : 'firmware pelo ar' }
    case 'tls': return { icon: AlertTriangle, bad: true, text: 'HTTPS sem validar o certificado', sub: 'a estação não reconheceu a autoridade do certificado do servidor e seguiu com os envios assinados (a chave não viaja). Atualize o firmware se isso continuar.' }
    case 'bench': return { icon: Wrench, bad: false, text: `modo bancada por ${String(e.minutes)} min`, sub: '' }
    default: return { icon: CircleCheck, bad: false, text: String(e.kind), sub: '' }
  }
}

/** Reinícios e eventos que a estação conta junto com as leituras. */
export default function DiagnosticsPanel({ station, readings, events }: { station: Station; readings: Reading[]; events: StationEvent[] }) {
  useNow() // as idades ("há 2min10s") andam sozinhas
  const admin = useIsAdmin()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const cmd = commandStatus(station.command)
  const act = async (f: () => Promise<string>) => {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await f() }) } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Falhou.' }) }
    setBusy(false)
  }
  const now = readings[readings.length - 1]
  const day = useMemo(() => {
    const since = Date.now() / 1000 - 86400
    const boots = events.filter((e) => e.kind === 'boot' && e.ts >= since)
    return { boots: boots.length, bad: boots.filter((e) => ABNORMAL.has(Number(e.reason))).length, brown: boots.filter((e) => Number(e.reason) === 9).length }
  }, [events])

  return (
    <div className="grid gap-4">
      {admin && (
        <div className="grid gap-2 rounded-xl border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy || (!!station.command && !station.command.done)} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover disabled:opacity-50"
              onClick={() => { if (window.confirm(`Reiniciar a estação ${station.name}? Ela recebe o pedido no próximo envio e reinicia.`)) void act(async () => { await restartStation(station.id); return 'Reinício pedido. A estação recebe no próximo envio e a confirmação aparece aqui.' }) }}>Reiniciar a estação</button>
            {station.command && !station.command.done && (
              <button disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover disabled:opacity-50" onClick={() => void act(async () => { await cancelStationCommand(station.id); return 'Pedido cancelado.' })}>Cancelar o pedido</button>
            )}
            <button disabled={busy || events.length === 0} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover disabled:opacity-50"
              onClick={() => { if (window.confirm('Apagar todos os eventos (reinícios, atualizações, modo bancada) desta estação? Não dá para desfazer.')) void act(async () => { const r = await clearStationEvents(station.id); return `${r.removed} evento(s) apagado(s).` }) }}>Limpar eventos</button>
            <button disabled={busy} className="rounded-lg border border-bad/40 px-3 py-1.5 text-xs text-bad hover:bg-bad/10 disabled:opacity-50"
              onClick={() => { if (window.confirm(`Apagar TODAS as leituras de ${station.name} (histórico, gráficos e resumo por hora)? A estação continua, com o mesmo nome, chave e configuração — só o histórico some. Não dá para desfazer.`)) void act(async () => { const r = await clearStationData(station.id); return `${r.removed} leitura(s) apagada(s). A página atualiza sozinha.` }) }}>Apagar todas as leituras</button>
          </div>
          {cmd.text && <p role="status" className={cmd.tone === 'ok' ? 'text-ok' : 'text-warn'}>{cmd.text}</p>}
          {msg && <p role="status" className={msg.ok ? 'text-ok' : 'text-bad'}>{msg.text}</p>}
        </div>
      )}
      <dl className="num grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="flex items-center gap-1.5 text-xs text-ink-3"><Cpu className="h-3.5 w-3.5" aria-hidden /> Firmware</dt><dd>{station.fw_version ?? 'desconhecido'}</dd></div>
        <div><dt className="text-xs text-ink-3">Último contato</dt><dd>{station.last_seen ? ago(station.last_seen) : 'nunca'}</dd></div>
        <div><dt className="text-xs text-ink-3">Sinal do Wi-Fi</dt><dd>{now.rssi < 0 ? `${now.rssi} dBm` : '—'}</dd></div>
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
