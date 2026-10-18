import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { store } from '../lib/api'

const KEY = 'meteo.collapsed'

function readCollapsed(): Record<string, boolean> {
  try { return JSON.parse(store.get(KEY) || '{}') as Record<string, boolean> } catch { return {} }
}

/** Painel recolhível. Clicar no título recolhe e a escolha fica lembrada neste navegador. */
export default function Panel({
  id, title, hint, defaultOpen = true, className = '', children,
}: { id: string; title: ReactNode; hint?: ReactNode; defaultOpen?: boolean; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    const saved = readCollapsed()[id]
    return saved === undefined ? defaultOpen : !saved
  })
  const toggle = () => {
    const next = !open
    setOpen(next)
    store.set(KEY, JSON.stringify({ ...readCollapsed(), [id]: !next }))
  }
  const panelId = `panel-${id}`

  return (
    <section className={`rounded-2xl border border-line bg-card ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left sm:p-5"
      >
        <span className="min-w-0">
          <span className="block font-display text-lg font-semibold tracking-tight">{title}</span>
          {hint && <span className="num block text-xs text-ink-3">{hint}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {open && <div id={panelId} className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>}
    </section>
  )
}
