import { request, ApiError } from './api'
import { getSession, setSession, type AuthUser } from './session'

/** Descobre se há login com Google no servidor e quem está logado (cookie de sessão). Chamado uma vez ao abrir o site. */
export async function loadAuth() {
  try {
    const [cfg, me] = await Promise.all([request<{ clientId: string | null; devLogin?: boolean }>('/api/auth/config'), request<{ user: AuthUser | null }>('/api/auth/me')])
    setSession({ clientId: cfg.clientId, devLogin: import.meta.env.DEV && cfg.devLogin === true, user: me.user, loaded: true })
  } catch {
    setSession({ loaded: true }) // sem API (demonstração): nada de login
  }
}

export async function signInWithGoogle(credential: string): Promise<AuthUser> {
  const r = await request<{ user: AuthUser }>('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }) })
  setSession({ user: r.user })
  return r.user
}

/** Só em desenvolvimento (o servidor recusa fora de localhost e o botão nem existe no site publicado). */
export async function signInDev(role: 'admin' | 'user'): Promise<AuthUser> {
  const r = await request<{ user: AuthUser }>('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) })
  setSession({ user: r.user })
  return r.user
}

export async function signOut() {
  try { await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }) } catch (e) { if (!(e instanceof ApiError)) throw e }
  setSession({ user: null })
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect()
}

// ---------------- Google Identity Services ----------------
interface GsiId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; auto_select?: boolean }): void
  renderButton(el: HTMLElement, o: Record<string, unknown>): void
  disableAutoSelect(): void
}
declare global { interface Window { google?: { accounts?: { id?: GsiId } } } }

let gsi: Promise<GsiId> | null = null
function loadGsi(): Promise<GsiId> {
  gsi ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(window.google.accounts.id); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('o Google não carregou')))
    s.onerror = () => { gsi = null; reject(new Error('não foi possível carregar o login do Google (conexão ou bloqueador de anúncios)')) }
    document.head.appendChild(s)
  })
  return gsi
}

/** Desenha o botão "Entrar com o Google" dentro de `el`. Devolve uma função que limpa. */
export async function renderGoogleButton(el: HTMLElement, onDone: (u: AuthUser | null, error?: string) => void) {
  const clientId = getSession().clientId
  if (!clientId) throw new Error('login com Google não configurado')
  const id = await loadGsi()
  id.initialize({
    client_id: clientId,
    callback: (r) => { signInWithGoogle(r.credential).then((u) => onDone(u), (e: unknown) => onDone(null, e instanceof Error ? e.message : 'não foi possível entrar')) },
  })
  id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'pt-BR', width: 240 })
}
