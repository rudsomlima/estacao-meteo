import { Check, CircleDashed, Hourglass, TriangleAlert } from 'lucide-react'
import { useNow } from '../hooks/useNow'
import { ago } from '../lib/derive'
import { serverNow } from '../lib/clock'
import { appliedViaCable } from '../lib/usb'
import type { Station } from '../types'

interface Step { key: string; title: string; detail: string; state: 'done' | 'doing' | 'todo' | 'warn' }

const dur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.round(s % 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}min`
  return m > 0 ? `${m}min${String(r).padStart(2, '0')}s` : `${r}s`
}

/**
 * Passo a passo da configuração salva até a estação aplicar:
 * 1 salva no servidor, 2 estação encontrada (em contato), 3 configuração entregue, 4 aplicada (a estação confirmou a versão).
 * Cada passo vale 25 %. A estação só conversa com o servidor a cada envio, então enquanto não há envio o passo espera.
 */
export default function ConfigStatus({ station }: { station: Station }) {
  useNow() // anda a cada segundo
  const now = serverNow()
  const v = station.config.version
  const every = station.config.interval_min * Math.max(1, station.config.send_every) * 60 // segundos entre contatos
  const seen = station.last_seen
  const sinceSeen = seen ? now - seen : null
  const online = sinceSeen !== null && sinceSeen < every * 2.5 + 30
  const cableAt = appliedViaCable(station.id, v) // aplicada pelo cabo USB neste navegador
  const sent = station.cfg_sent === v || cableAt !== null
  const applied = station.cfg_applied === v

  const steps: Step[] = [
    { key: 'saved', title: `Versão ${v} salva no servidor`, detail: 'a configuração nova já está guardada', state: 'done' },
    {
      key: 'found',
      title: seen === null ? 'Estação ainda não encontrada' : online ? 'Estação encontrada' : 'Estação sem contato',
      detail: seen === null
        ? 'ela nunca falou com o servidor'
        : online ? `em contato: visto ${ago(seen)}` : `sem contato há ${dur(sinceSeen ?? 0)} (o normal é a cada ${dur(every)})`,
      state: seen === null ? 'todo' : online ? 'done' : 'warn',
    },
    {
      key: 'sent',
      title: 'Configuração entregue',
      detail: cableAt !== null
        ? `entregue pelo cabo USB ${ago(cableAt)}; ela envia agora para o servidor confirmar`
        : sent || applied
        ? `entregue${station.cfg_sent_at ? ` ${ago(station.cfg_sent_at)}` : ''}`
        : 'vai na resposta do próximo envio da estação',
      state: sent || applied ? 'done' : online ? 'doing' : 'todo',
    },
    {
      key: 'applied',
      title: 'Aplicada pela estação',
      detail: applied
        ? `confirmada${station.cfg_applied_at ? ` ${ago(station.cfg_applied_at)}` : ''}: ela informou que tem a versão ${v}`
        : sent
          ? `entregue; falta ela confirmar a versão ${v} no envio seguinte (ela está na ${station.cfg_applied})`
          : `a estação ainda tem a versão ${station.cfg_applied}`,
      state: applied ? 'done' : sent ? 'doing' : 'todo',
    },
  ]
  const done = steps.filter((s) => s.state === 'done').length
  const pct = done * 25

  // quanto falta para o próximo contato esperado
  const next = seen ? seen + every : null
  const left = next ? Math.max(0, Math.round(next - now)) : null

  const tone = applied ? 'ok' : online ? 'warn' : 'bad'
  const box = { ok: 'border-ok/30 bg-ok/10', warn: 'border-warn/30 bg-warn/10', bad: 'border-bad/30 bg-bad/10' }[tone]
  const text = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[tone]

  return (
    <section role="status" aria-label="Estado da configuração na estação" className={`rounded-xl border px-4 py-3 text-sm ${box}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`flex items-center gap-2 font-semibold ${text}`}>
          {applied ? <Check className="h-4 w-4" aria-hidden /> : online ? <Hourglass className="h-4 w-4" aria-hidden /> : <TriangleAlert className="h-4 w-4" aria-hidden />}
          {applied ? `Configuração v${v} aplicada na estação` : `Configuração v${v} a caminho da estação`}
        </p>
        <span className={`num text-base font-bold ${text}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i className={`block h-full rounded-full transition-all ${applied ? 'bg-ok' : online ? 'bg-warn' : 'bg-bad'}`} style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-3 grid gap-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              {s.state === 'done' ? <Check className="h-4 w-4 text-ok" aria-hidden />
                : s.state === 'warn' ? <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />
                : s.state === 'doing' ? <Hourglass className="h-4 w-4 text-warn" aria-hidden />
                : <CircleDashed className="h-4 w-4 text-ink-3" aria-hidden />}
            </span>
            <span className="grid">
              <b className="font-medium text-ink">{s.title}</b>
              <span className="text-xs text-ink-3">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {!applied && (
        <p className="mt-3 border-t border-line/60 pt-2 text-xs text-ink-3">
          {seen === null
            ? 'Assim que a estação ligar e se conectar, ela pega a configuração.'
            : !online
              ? 'A estação pode estar desligada, sem Wi-Fi ou dormindo. Ao voltar, ela pega a configuração sozinha.'
              : left === 0
                ? 'O próximo envio é a qualquer momento: ela recebe a configuração nesse contato.'
                : `Próximo envio esperado em cerca de ${dur(left ?? 0)}. ${station.config.interval_min * station.config.send_every > station.config.interval_min ? `(a estação junta ${station.config.send_every} leituras por envio)` : ''}`}
        </p>
      )}
    </section>
  )
}
