import { useCallback, useState } from 'react'
import { store } from '../lib/api'
import { useSession } from '../lib/session'

const KEY = 'meteo.token'

/** Marca de "quem está logado com o Google não precisa de token": os formulários a tratam como um token já preenchido. */
export const SESSION_TOKEN = '(login com o Google)'

/**
 * Token de administrador, guardado só neste navegador. Nunca é enviado: ele só assina os pedidos.
 * Com o login do Google o token deixa de ser necessário (a sessão autentica) e o hook devolve a marca SESSION_TOKEN.
 */
export function useToken(): [string, (v: string) => void] {
  const [token, setLocal] = useState(() => store.get(KEY))
  const set = useCallback((v: string) => { setLocal(v); store.set(KEY, v) }, [])
  const { user } = useSession()
  return [user ? SESSION_TOKEN : token, set]
}
