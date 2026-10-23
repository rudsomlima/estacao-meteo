import { useEffect, useState } from 'react'
import { useToken } from '../hooks/useToken'
import { store } from '../lib/api'
import type { DeviceInfo, Link, WifiNet } from '../lib/usb'
import { loadManifest } from './manifest'
import { input } from './ui'
import { isLocal, resolveServer } from './server'

const SSID_KEY = 'meteo.lastSsid'

/** Wi-Fi, senha, endereço do site e token: o que a placa precisa para falar com o servidor. Compartilhado pela placa nova e pela antiga. */
export function useNetworkForm(link: Link, info: DeviceInfo) {
  const [token, setToken] = useToken()
  const [nets, setNets] = useState<WifiNet[] | null>(null)
  const [ssid, setSsid] = useState(() => info.ssid || store.get(SSID_KEY))
  const [pass, setPass] = useState('')
  const [server, setServer] = useState('')

  // o endereço certo para a placa: em desenvolvimento "localhost" não serve, então usa o que a imagem já traz
  useEffect(() => {
    void loadManifest().then((m) => resolveServer([info.server, m[0]?.server]).then(setServer))
  }, [info.server])

  // redes Wi-Fi por perto, lidas pela própria placa
  useEffect(() => { void link.scan().then((n) => { setNets(n); setSsid((cur) => cur || n[0]?.s || '') }) }, [link])

  return { token, setToken, nets, ssid, setSsid, pass, setPass, server, setServer, remember: () => store.set(SSID_KEY, ssid.trim()) }
}
export type NetworkForm = ReturnType<typeof useNetworkForm>

export function NetworkFields({ f }: { f: NetworkForm }) {
  const { nets, ssid, setSsid, pass, setPass, server, setServer, token, setToken } = f
  return (
    <>
      <label className="grid gap-1 text-xs text-ink-3">Rede Wi-Fi (2,4 GHz)
        {nets && nets.length > 0 ? (
          <select value={nets.some((n) => n.s === ssid) ? ssid : ''} onChange={(e) => setSsid(e.target.value)} className={input}>
            {!nets.some((n) => n.s === ssid) && <option value="">{ssid || 'Escolha…'}</option>}
            {nets.map((n) => <option key={n.s} value={n.s}>{n.s} ({n.r} dBm){n.open ? ' · aberta' : ''}</option>)}
          </select>
        ) : (
          <input className={input} value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder={nets === null ? 'Procurando redes…' : 'Nome da rede'} autoComplete="off" />
        )}
      </label>
      <label className="grid gap-1 text-xs text-ink-3">Senha do Wi-Fi
        <input type="password" className={input} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
      </label>
      {!token && (
        <label className="grid gap-1 text-xs text-ink-3">Token de administrador (só neste navegador)
          <input type="password" className={input} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        </label>
      )}
      <details className="text-xs text-ink-3">
        <summary className="cursor-pointer">Avançado</summary>
        <label className="mt-2 grid gap-1">Endereço do site que a placa vai usar
          <input className={input} value={server} onChange={(e) => setServer(e.target.value)} autoComplete="off" />
        </label>
        {isLocal(server) && <p className="mt-1 text-warn">A placa não alcança “localhost”. Use o endereço publicado ou o IP do computador.</p>}
        {server.startsWith('http://') && <p className="mt-1">Em http:// a placa assina os envios (a chave não viaja), mas o conteúdo fica legível na rede.</p>}
        {token && <button type="button" onClick={() => setToken('')} className="mt-2 underline">trocar o token de administrador</button>}
      </details>
    </>
  )
}
