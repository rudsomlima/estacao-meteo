import { useEffect, useState } from 'react'
import { useToken } from '../hooks/useToken'
import { updateStation } from '../lib/api'
import { pinProblem } from '../lib/pins'
import { useCanEdit } from '../lib/session'
import type { DeviceInfo, Link } from '../lib/usb'
import type { Source, Station, StationConfig } from '../types'
import { type FirmwareImage, imageOf, loadManifest } from './manifest'
import { NetworkFields, useNetworkForm } from './NetworkFields'
import SensorsForm from './SensorsForm'
import { errorText, provisionBoard, rotate } from './steps'

type Action = 'menu' | 'wifi' | 'sensors'

const btn = 'rounded-xl border border-line px-4 py-2.5 text-left hover:bg-card-hover disabled:opacity-50'
const primary = 'rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'

/**
 * Placa já cadastrada neste site. Em vez de um formulário só, três ações separadas:
 * atualizar o firmware, trocar a rede ou o servidor, mudar sensores e pinos.
 */
export default function KnownBoard({ link, info, station, source, onFlash, onLost, onDone, onChanged }: {
  link: Link; info: DeviceInfo; station: Station; source: Source
  onFlash: () => void; onLost: () => void; onDone: (id: string, name: string) => void; onChanged: () => unknown
}) {
  const [action, setAction] = useState<Action>('menu')
  const [image, setImage] = useState<FirmwareImage | null>(null)
  const editable = useCanEdit(station, source)
  useEffect(() => { void loadManifest().then((m) => setImage(imageOf(m, 'app'))) }, [])

  // Só o menu deixa a placa seguir o ciclo normal; nas telas de edição ela fica escutando.
  useEffect(() => (action === 'menu' ? undefined : link.keepAlive(onLost)), [link, action, onLost])

  const upToDate = !!image?.fw && image.fw === info.fw

  if (action === 'wifi') return <WifiAction link={link} info={info} station={station} onBack={() => setAction('menu')} onDone={onDone} />
  if (action === 'sensors') return <SensorsAction link={link} station={station} onBack={() => setAction('menu')} onChanged={onChanged} />

  return (
    <div className="mt-2 grid gap-2 text-sm">
      <p className="text-ok">Reconhecida: estação {station.name}.</p>
      <button className={btn} onClick={onFlash} disabled={!image}>
        <b className="font-medium">Atualizar o firmware</b>
        <span className="block text-xs text-ink-3">{!image ? 'Este site não tem a imagem só do aplicativo (gere de novo com tools/make_factory.py).' : upToDate ? `A placa já está na versão ${info.fw}. Regravar mantém Wi-Fi, chave e configuração.` : `Placa ${info.fw}, disponível ${image.fw ?? 'outra versão'}. Grava só o aplicativo: mantém Wi-Fi, chave e configuração.`}</span>
      </button>
      <button className={btn} onClick={() => setAction('wifi')}>
        <b className="font-medium">Wi-Fi e servidor</b>
        <span className="block text-xs text-ink-3">Troca a rede ou o endereço do site. Gera uma chave nova e invalida a anterior.</span>
      </button>
      <button className={btn} onClick={() => setAction('sensors')} disabled={!editable}>
        <b className="font-medium">Sensores e pinos</b>
        <span className="block text-xs text-ink-3">{editable ? 'O que está instalado e em quais pinos. Salva no servidor e aplica na placa pelo cabo.' : 'Só o dono e os administradores alteram.'}</span>
      </button>
    </div>
  )
}

function Back({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} className="w-fit text-xs underline text-ink-3">‹ voltar</button>
}

function WifiAction({ link, info, station, onBack, onDone }: { link: Link; info: DeviceInfo; station: Station; onBack: () => void; onDone: (id: string, name: string) => void }) {
  const net = useNetworkForm(link, info)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      if (!net.ssid.trim()) throw new Error('Escolha a rede Wi-Fi.')
      const key = await rotate(station.id, net.token)
      net.remember()
      await provisionBoard(link, { ssid: net.ssid.trim(), pass: net.pass, server: net.server.trim(), id: station.id, key })
      onDone(station.id, station.name)
      return
    } catch (e) { setErr(errorText(e)) }
    setBusy(false)
  }
  return (
    <div className="mt-2 grid gap-2.5 text-sm">
      <Back onBack={onBack} />
      <p className="rounded-lg border border-line px-3 py-2 text-xs text-ink-2">Gera uma chave nova para {station.name} e invalida a anterior. Outras placas que compartilhem a chave antiga deixarão de enviar dados.</p>
      <NetworkFields f={net} />
      <button onClick={run} disabled={busy || !net.token || !net.server} className={primary}>{busy ? 'Configurando…' : 'Reconfigurar esta placa'}</button>
      {err && <p role="alert" className="text-xs text-bad">{err}</p>}
    </div>
  )
}

function SensorsAction({ link, station, onBack, onChanged }: { link: Link; station: Station; onBack: () => void; onChanged: () => unknown }) {
  const [token] = useToken()
  const [cfg, setCfg] = useState<StationConfig>(station.config)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const bad = pinProblem(cfg)
  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const saved = await updateStation(station.id, { name: station.name, city: station.city, lat: station.lat, lon: station.lon, alt: station.alt, config: cfg }, token)
      void onChanged()
      const r = await link.applyConfig(saved.config as unknown as Record<string, unknown>)
      setMsg(r.ok
        ? { ok: true, text: `Versão ${saved.config.version} salva e aplicada na placa${r.restarting ? ' (ela reiniciou para usar os pinos novos)' : ''}.` }
        : { ok: true, text: `Versão ${saved.config.version} salva no servidor, mas a placa não aplicou pelo cabo (${r.error}). Ela pega no próximo envio.` })
    } catch (e) { setMsg({ ok: false, text: errorText(e) }) }
    setBusy(false)
  }
  return (
    <div className="mt-2 grid gap-3 text-sm">
      <Back onBack={onBack} />
      <SensorsForm cfg={cfg} set={(p) => setCfg((c) => ({ ...c, ...p }))} />
      <button onClick={save} disabled={busy || !!bad || !token} className={primary}>{busy ? 'Salvando…' : 'Salvar e aplicar na placa'}</button>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
    </div>
  )
}
