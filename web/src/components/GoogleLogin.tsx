import { useEffect, useRef, useState } from 'react'
import { renderGoogleButton } from '../lib/auth'
import type { AuthUser } from '../lib/session'

/** Botão "Entrar com o Google" (Google Identity Services). `onDone` é chamado depois do login. */
export default function GoogleLogin({ onDone }: { onDone?: (u: AuthUser) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!box.current) return
    let alive = true
    renderGoogleButton(box.current, (u, e) => { if (!alive) return; if (u) onDone?.(u); else setErr(e ?? 'não foi possível entrar') }).catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : 'falhou') })
    return () => { alive = false }
  }, [onDone])
  return (
    <div className="grid gap-2">
      <div ref={box} className="min-h-[44px]" />
      {err && <p role="alert" className="max-w-[260px] text-xs text-bad">{err}</p>}
    </div>
  )
}
