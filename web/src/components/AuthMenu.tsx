import { LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { go } from '../hooks/useRoute'
import { signInDev, signOut } from '../lib/auth'
import { useSession } from '../lib/session'
import GoogleLogin from './GoogleLogin'

/** Entrar com o Google, ou o menu de quem já entrou (painel do administrador e sair). Só aparece se o servidor tem login configurado. */
export default function AuthMenu() {
  const { user, clientId, loaded, devLogin } = useSession()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  // o evento permite que outras telas (por exemplo "Adicionar estação") peçam o login
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('meteo:login', on)
    return () => window.removeEventListener('meteo:login', on)
  }, [])

  if (!loaded || (!clientId && !devLogin)) return null

  return (
    <div ref={box} className="relative shrink-0">
      {user ? (
        <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Conta" className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 text-xs text-ink-2 hover:border-line-hover">
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" /> : <UserRound className="h-5 w-5" aria-hidden />}
          <span className="hidden max-w-[110px] truncate sm:inline">{user.name || user.email}</span>
          {user.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-cyan" aria-label="administrador" />}
        </button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink-2 hover:border-line-hover hover:text-ink">
          <LogIn className="h-3.5 w-3.5" aria-hidden /> Entrar
        </button>
      )}
      {open && (
        <div role="menu" className="glass absolute right-0 top-11 z-[80] w-[290px] rounded-2xl p-4 text-sm">
          {user ? (
            <div className="grid gap-3">
              <div>
                <p className="truncate font-semibold">{user.name || user.email}</p>
                <p className="num truncate text-xs text-ink-3">{user.email}</p>
                <p className="num mt-1 text-xs text-ink-2">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
              </div>
              {user.role === 'admin' && (
                <button role="menuitem" onClick={() => { setOpen(false); go('admin') }} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left hover:bg-card-hover"><ShieldCheck className="h-4 w-4 text-cyan" aria-hidden /> Painel do administrador</button>
              )}
              <button role="menuitem" onClick={() => { setOpen(false); void signOut() }} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left hover:bg-card-hover"><LogOut className="h-4 w-4" aria-hidden /> Sair</button>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-ink-2">Entre com sua conta Google para cadastrar e configurar as suas estações.</p>
              {clientId && <GoogleLogin onDone={() => setOpen(false)} />}
              {devLogin && (
                <div className="grid gap-2 border-t border-line pt-3">
                  <p className="num text-xs text-warn">Modo de desenvolvimento: sem senha</p>
                  <button onClick={() => void signInDev('admin').then(() => setOpen(false))} className="rounded-lg border border-line px-3 py-2 text-left hover:bg-card-hover">Entrar como administrador</button>
                  <button onClick={() => void signInDev('user').then(() => setOpen(false))} className="rounded-lg border border-line px-3 py-2 text-left hover:bg-card-hover">Entrar como usuário comum</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
