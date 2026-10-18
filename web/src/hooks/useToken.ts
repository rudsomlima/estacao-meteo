import { useCallback, useState } from 'react'
import { store } from '../lib/api'

const KEY = 'meteo.token'

/** Token de administrador, guardado só neste navegador. Nunca é enviado: ele só assina os pedidos. */
export function useToken(): [string, (v: string) => void] {
  const [token, setLocal] = useState(() => store.get(KEY))
  const set = useCallback((v: string) => { setLocal(v); store.set(KEY, v) }, [])
  return [token, set]
}
