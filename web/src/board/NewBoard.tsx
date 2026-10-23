import { MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_CONFIG } from '../lib/demo'
import { pinProblem } from '../lib/pins'
import { canEditStation, useSession } from '../lib/session'
import type { DeviceInfo, Link } from '../lib/usb'
import type { Source, Station, StationConfig } from '../types'
import GoogleLogin from '../components/GoogleLogin'
import { PICKED_EVENT, type Picked } from './events'
import { NetworkFields, useNetworkForm } from './NetworkFields'
import { input } from './ui'
import SensorsForm from './SensorsForm'
import { createNewStation, errorText, provisionBoard, rotate } from './steps'

const NEW = '__new__'

/**
 * Placa nova (ou sem vínculo com uma estação deste site): escolhe ou cria a estação, define os sensores,
 * configura o Wi-Fi e grava tudo na placa pelo cabo. A estação e a chave nascem aqui; a placa recebe a chave.
 */
export default function NewBoard({ link, info, stations, source, onPickMap, onLost, onCreated, onDone }: {
  link: Link; info: DeviceInfo; stations: Station[]; source: Source
  onPickMap: () => void; onLost: () => void; onCreated: () => unknown; onDone: (id: string, name: string) => void
}) {
  const session = useSession()
  const mine = stations.filter((s) => canEditStation(s, source, session)) // só as estações que o usuário pode alterar
  const net = useNetworkForm(link, info)
  const [sid, setSid] = useState(mine.find((s) => s.id === info.id)?.id ?? (mine.length ? mine[0].id : NEW))
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [pos, setPos] = useState<{ lat: string; lon: string }>({ lat: '', lon: '' })
  const [cfg, setCfg] = useState<StationConfig>(DEFAULT_CONFIG)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // mantém a placa escutando enquanto o formulário está aberto; se ela se perder, o aviso volta ao estado "sem resposta"
  useEffect(() => link.keepAlive(onLost), [link, onLost])

  // ponto escolhido no mapa
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<Picked>).detail; if (d) setPos({ lat: d.lat.toFixed(5), lon: d.lon.toFixed(5) }) }
    window.addEventListener(PICKED_EVENT, on)
    return () => window.removeEventListener(PICKED_EVENT, on)
  }, [])

  // local da estação nova: o do navegador, se ele deixar
  useEffect(() => {
    if (sid !== NEW || pos.lat) return
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude.toFixed(5), lon: p.coords.longitude.toFixed(5) }),
      () => undefined,
      { timeout: 4000 },
    )
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      if (!net.ssid.trim()) throw new Error('Escolha a rede Wi-Fi.')
      const bad = sid === NEW ? pinProblem(cfg) : null
      if (bad) throw new Error(bad)
      let id = sid, label = stations.find((s) => s.id === sid)?.name ?? sid, key: string
      if (sid === NEW) {
        const c = await createNewStation({ name, owner, lat: pos.lat, lon: pos.lon, config: cfg }, net.token)
        id = c.id; label = c.label; key = c.key
        void onCreated() // a estação já existe: mostra no mapa sem esperar a próxima atualização
      } else {
        key = await rotate(id, net.token)
      }
      net.remember()
      await provisionBoard(link, { ssid: net.ssid.trim(), pass: net.pass, server: net.server.trim(), id, key })
      onDone(id, label)
      return
    } catch (e) { setErr(errorText(e)) }
    setBusy(false)
  }

  if (source === 'demo') return <p className="mt-2 text-xs text-ink-3">Para configurar a placa, o site precisa estar ligado à API (não está na demonstração).</p>
  if (session.clientId && !session.user) {
    return (
      <div className="mt-2 grid gap-2 text-sm">
        <p className="text-ink-2">Entre com a sua conta Google para cadastrar esta placa numa estação sua.</p>
        <GoogleLogin />
      </div>
    )
  }

  return (
    <div className="mt-2 grid gap-2.5 text-sm">
      <label className="grid gap-1 text-xs text-ink-3">Estação
        <select value={sid} onChange={(e) => setSid(e.target.value)} className={input}>
          {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value={NEW}>Nova estação…</option>
        </select>
      </label>
      {sid === NEW && (
        <div className="grid gap-2 rounded-lg border border-line p-3">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Sítio)" maxLength={40} />
          <input className={input} type="email" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Dono (e-mail Google, opcional)" />
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input className={input} inputMode="decimal" value={pos.lat} onChange={(e) => setPos({ ...pos, lat: e.target.value })} placeholder="Latitude" />
            <input className={input} inputMode="decimal" value={pos.lon} onChange={(e) => setPos({ ...pos, lon: e.target.value })} placeholder="Longitude" />
            <button type="button" onClick={onPickMap} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card-hover"><MapPin className="h-4 w-4" aria-hidden />No mapa</button>
          </div>
          <p className="text-xs text-ink-3">{pos.lat ? 'Usei a localização deste aparelho. Ajuste depois no mapa se precisar.' : 'Clique em No mapa para escolher o ponto, ou digite as coordenadas.'}</p>
          <details className="text-xs text-ink-3">
            <summary className="cursor-pointer">Sensores e pinos (o padrão serve para a montagem do guia)</summary>
            <div className="mt-3"><SensorsForm cfg={cfg} set={(p) => setCfg((c) => ({ ...c, ...p }))} /></div>
          </details>
        </div>
      )}
      <NetworkFields f={net} />
      <button onClick={run} disabled={busy || (sid === NEW ? !name.trim() : !sid) || !net.token || !net.server} className="rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Configurando…' : sid === NEW ? 'Criar a estação e configurar a placa' : 'Configurar esta placa'}
      </button>
      <p className="text-xs text-ink-3">Ao concluir, gera uma chave nova para esta estação e grava Wi-Fi, endereço e chave nesta placa. A chave anterior deixa de valer.</p>
      {err && <p role="alert" className="text-xs text-bad">{err}</p>}
    </div>
  )
}
