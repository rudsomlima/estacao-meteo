import { Check, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../../lib/api'
import { subscribeRefresh } from '../../lib/refresh'
import type { AdminStation, Scope } from '../../lib/admin'

export const input = 'num rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'
export const btn = 'rounded-xl border border-line px-4 py-2 text-sm hover:bg-card-hover disabled:opacity-50'
export const btnMain = 'rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'

export const errText = (e: unknown) => (e instanceof ApiError ? (e.status === 403 ? 'Sem permissão.' : e.status === 401 ? 'Entre de novo com o Google.' : e.message) : e instanceof Error ? e.message : 'Falhou.')

/** Carrega dados da API e recarrega quando o servidor avisa que algo mudou (tempo real) ou a pedido. */
export function useLoad<T>(load: () => Promise<T>, live = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => { load().then((d) => { setData(d); setError('') }, (e: unknown) => setError(errText(e))) }, [load])
  useEffect(() => {
    reload()
    return live ? subscribeRefresh(() => reload()) : undefined
  }, [reload, live])
  return { data, error, reload }
}

export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null
  return (
    <p role="status" className={`flex items-start gap-1.5 text-sm ${m.ok ? 'text-ok' : 'text-bad'}`}>
      {m.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{m.text}
    </p>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  )
}

/** Escolha do "Aplicar a": todas as estações ou as marcadas. */
export interface ScopeState { all: boolean; ids: Set<string> }
export const initialScope = (): ScopeState => ({ all: true, ids: new Set() })
export const toScope = (s: ScopeState): Scope => (s.all ? 'all' : [...s.ids])
export const scopeCount = (s: ScopeState, total: number) => (s.all ? total : s.ids.size)

export function StationScope({ stations, scope, onChange }: { stations: AdminStation[]; scope: ScopeState; onChange: (s: ScopeState) => void }) {
  const [q, setQ] = useState('')
  const shown = stations.filter((s) => !q || `${s.name} ${s.id} ${s.owner_email ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const toggle = (id: string) => { const n = new Set(scope.ids); if (n.has(id)) n.delete(id); else n.add(id); onChange({ ...scope, ids: n }) }
  return (
    <div className="grid gap-2 rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="radio" checked={scope.all} onChange={() => onChange({ ...scope, all: true })} /> Todas as estações ({stations.length})</label>
        <label className="flex items-center gap-2"><input type="radio" checked={!scope.all} onChange={() => onChange({ ...scope, all: false })} /> Só as selecionadas ({scope.ids.size})</label>
      </div>
      {!scope.all && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${input} w-48`} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar estação" />
            <button type="button" className="text-xs text-ink-3 underline" onClick={() => onChange({ ...scope, ids: new Set(shown.map((s) => s.id)) })}>marcar as listadas</button>
            <button type="button" className="text-xs text-ink-3 underline" onClick={() => onChange({ ...scope, ids: new Set() })}>limpar</button>
          </div>
          <ul className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-card-hover">
                  <input type="checkbox" checked={scope.ids.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="min-w-0 truncate">{s.name}</span>
                  <span className="num truncate text-xs text-ink-3">{s.owner_email ?? 'sem dono'}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
