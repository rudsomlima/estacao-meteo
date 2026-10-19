import { useSyncExternalStore } from 'react'

/** Quem está logado neste navegador (login com Google). Só guarda o estado; as chamadas estão em auth.ts. */
export interface AuthUser { email: string; name: string; picture: string; role: 'admin' | 'user' }
interface State { user: AuthUser | null; clientId: string | null; loaded: boolean; devLogin: boolean }

let state: State = { user: null, clientId: null, loaded: false, devLogin: false }
const subs = new Set<() => void>()

export const getSession = () => state
export const getSessionUser = () => state.user
export function setSession(patch: Partial<State>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}
export const useSession = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, getSession, () => state)

/** Com o login do Google disponível no servidor, quem não entrou só lê; sem ele (servidor antigo) vale o token de administrador. */
export const usesGoogle = (s: State = state) => !!s.clientId

/**
 * Pode alterar a estação? Na demonstração, sim (fica só no navegador). Com login do Google no servidor: só o dono (ou o
 * administrador), como o servidor informa em `can_edit`. Sem login no servidor, vale o token de administrador.
 */
export function canEditStation(s: { can_edit?: boolean }, source: 'api' | 'demo', st: State = state) {
  if (source === 'demo') return true
  return st.user ? !!s.can_edit : !st.clientId
}
export const useCanEdit = (s: { can_edit?: boolean }, source: 'api' | 'demo') => canEditStation(s, source, useSession())

/** Só administradores cadastram dispositivos, usam placas USB e gravam firmware. Sem login do Google no servidor, vale o token (legado). */
export const isAdminSession = (st: State = state) => (st.user ? st.user.role === 'admin' : !st.clientId && !st.devLogin)
export const useIsAdmin = () => isAdminSession(useSession())
