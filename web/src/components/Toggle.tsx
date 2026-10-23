import type { ReactNode } from 'react'

export default function Toggle({ checked, onChange, title, children }: { checked: boolean; onChange: (v: boolean) => void; title: string; children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line bg-bg p-3 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><b className="font-medium">{title}</b><span className="mt-0.5 block text-xs text-ink-3">{children}</span></span>
    </label>
  )
}
