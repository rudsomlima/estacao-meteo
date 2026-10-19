import { CircleCheck, Cpu, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SESSION_TOKEN, useToken } from '../hooks/useToken'
import { createStation, fetchStations, rotateKey, store } from '../lib/api'
import { ADDRESS_FULL, explainFlashError, flash } from '../lib/flash'
import { deviceServer } from '../lib/server'
import { useSession } from '../lib/session'
import { askForPort, describePort, Link, setFlashing, usbSupported, waitForPlug, type Port } from '../lib/usb'
import type { Station } from '../types'

const WIFI_KEY = 'meteo.setup.wifi'
const NEW = '__new__'
const field = 'num w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink'
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Step = { k: 'idle' } | { k: 'busy'; text: string; pct?: number } | { k: 'done'; id: string; name: string } | { k: 'err'; text: string }

/**
 * Para o administrador: grava o firmware e deixa a placa pronta num só passo. Escolhe (ou cria) a estação, grava a imagem, e
 * configura Wi-Fi, endereço do site e chave pela USB, sem códigos de pareamento. Quando a placa envia a primeira leitura, avisa.
 */
export default function FlashSetup({ stations }: { stations: Station[] }) {
  const { clientId } = useSession()
  const [token, setToken] = useToken()
  const saved = (() => { try { return JSON.parse(store.get(WIFI_KEY) || '{}') as { ssid?: string; pass?: string } } catch { return {} } })()
  const [port, setPort] = useState<Port | null>(null)
  const [sid, setSid] = useState(stations[0]?.id ?? NEW)
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [pos, setPos] = useState({ lat: '', lon: '' })
  const [ssid, setSsid] = useState(saved.ssid ?? store.get('meteo.lastSsid'))
  const [pass, setPass] = useState(saved.pass ?? '')
  const [remember, setRemember] = useState(true)
  const [step, setStep] = useState<Step>({ k: 'idle' })
  const [hasImage, setHasImage] = useState<boolean | null>(null)

  useEffect(() => { fetch('/firmware/manifest.json').then((r) => (r.ok ? r.json() : [])).then((m) => setHasImage(Array.isArray(m) && m.length > 0)).catch(() => setHasImage(false)) }, [])
  useEffect(() => { if (!stations.some((s) => s.id === sid) && sid !== NEW) setSid(stations[0]?.id ?? NEW) }, [stations, sid])
  useEffect(() => {
    if (sid !== NEW || pos.lat) return
    navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude.toFixed(5), lon: p.coords.longitude.toFixed(5) }), () => undefined, { timeout: 4000 })
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!usbSupported()) return <p className="text-sm text-ink-2">Este navegador não tem Web Serial. Use o Chrome, o Edge ou o Opera.</p>

  const busy = step.k === 'busy'
  const fail = (e: unknown) => setStep({ k: 'err', text: explainFlashError(e).text })

  const choose = async () => { const p = await askForPort(); if (p) setPort(p) }

  const run = async () => {
    if (!port) return
    try {
      if (!ssid.trim()) throw new Error('Informe a rede Wi-Fi (2,4 GHz) em que a placa vai ficar.')
      let id = sid, label = stations.find((s) => s.id === sid)?.name ?? sid, key: string
      setStep({ k: 'busy', text: sid === NEW ? 'Criando a estação…' : 'Gerando a chave da estação…' })
      if (sid === NEW) {
        id = slug(name); label = name.trim()
        if (!id) throw new Error('Dê um nome à estação.')
        const lat = Number(pos.lat), lon = Number(pos.lon)
        if (!pos.lat || !pos.lon || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Informe o local (latitude e longitude) da estação nova.')
        key = (await createStation({ id, name: label, city: '', lat, lon, alt: 0, config: {}, ...(owner.trim() ? { owner_email: owner.trim() } : {}) }, token)).key
      } else {
        key = (await rotateKey(id, token)).key // a chave anterior deixa de valer; esta vai direto para a placa
      }
      if (remember) store.set(WIFI_KEY, JSON.stringify({ ssid: ssid.trim(), pass }))
      store.set('meteo.lastSsid', ssid.trim())

      const since = Math.floor(Date.now() / 1000)
      const mf = (await (await fetch('/firmware/manifest.json')).json()) as { file: string }[]
      if (!mf[0]) throw new Error('Não há imagem de firmware neste site (gere com tools/make_factory.py).')
      const bin = await fetch(`/firmware/${mf[0].file}`)
      if (!bin.ok) throw new Error('Não foi possível baixar a imagem do firmware.')
      const data = new Uint8Array(await bin.arrayBuffer())

      setStep({ k: 'busy', text: 'Gravando o firmware… Não desligue a placa.', pct: 0 })
      let current = port
      const doFlash = () => flash(current, { name: mf[0].file, data, address: ADDRESS_FULL }, { eraseAll: false, keepLocked: true, onProgress: (pct) => setStep({ k: 'busy', text: 'Gravando o firmware… Não desligue a placa.', pct }), onLog: () => undefined })
      try { await doFlash() } catch (e) {
        const ex = explainFlashError(e)
        if (!ex.waitForBoard) throw e
        setStep({ k: 'busy', text: 'Aperte RESET na placa (ou replugue o cabo): a gravação recomeça sozinha.' })
        const p = await waitForPlug(60000)
        if (!p) throw new Error('A placa não apareceu em 60 s. Confira o cabo (precisa ser de dados).')
        current = p; setPort(p)
        await sleep(800)
        await doFlash()
      }

      setStep({ k: 'busy', text: 'Configurando a placa…' })
      setFlashing(true) // o aviso de placa USB não pode pegar a porta no meio da configuração
      await sleep(1500)
      const link = new Link(current)
      try {
        await link.open()
        await link.reset()
        let info = await link.hello(15000)
        if (!info) { await link.reset(); info = await link.hello(12000) }
        if (!info) throw new Error('A placa gravou mas não respondeu. Aperte RESET nela e tente de novo (o firmware novo já está gravado).')
        const cfg = { ssid: ssid.trim(), pass, server: deviceServer(), id, key }
        let r = await link.provision(cfg)
        if (!r.ok && r.error === 'a placa não respondeu' && (await link.revive())) r = await link.provision(cfg)
        if (!r.ok) throw new Error(`A placa recusou a configuração (${r.error ?? 'erro'}). Confira o Wi-Fi e tente de novo.`)
      } finally { await link.close(); setFlashing(false) }

      setStep({ k: 'busy', text: 'A placa reiniciou e está conectando ao Wi-Fi e ao servidor…' })
      const end = Date.now() + 120_000
      while (Date.now() < end) {
        await sleep(3000)
        const s = (await fetchStations().catch(() => [] as Station[])).find((x) => x.id === id)
        if (s?.last_seen && s.last_seen >= since) { setStep({ k: 'done', id, name: label }); return }
      }
      throw new Error('A placa foi configurada mas ainda não apareceu no servidor. Confira a senha do Wi-Fi e se a rede é de 2,4 GHz.')
    } catch (e) {
      setFlashing(false)
      fail(e)
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <p className="text-ink-2">Escolha a estação e a rede Wi-Fi, plugue a placa e clique em um botão: o site grava o firmware, configura Wi-Fi, endereço e chave pela USB e confirma quando a primeira leitura chegar. Nenhum código para digitar.</p>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void choose()} disabled={busy} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 hover:bg-card-hover disabled:opacity-50"><Cpu className="h-4 w-4" aria-hidden /> {port ? 'Trocar placa' : 'Escolher a placa'}</button>
        {port && <span className="num text-ok">{describePort(port)}</span>}
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
        <label className="grid gap-1 text-xs text-ink-3 sm:col-span-2">Estação
          <select className={field} value={sid} onChange={(e) => setSid(e.target.value)}>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}{s.owner_email ? ` · ${s.owner_email}` : ''}</option>)}
            <option value={NEW}>Nova estação…</option>
          </select>
        </label>
        {sid === NEW && (
          <>
            <label className="grid gap-1 text-xs text-ink-3">Nome<input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sítio" maxLength={40} /></label>
            <label className="grid gap-1 text-xs text-ink-3">Dono (e-mail Google, opcional)<input className={field} type="email" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="quem vai ajustar a estação" /></label>
            <label className="grid gap-1 text-xs text-ink-3">Latitude<input className={field} inputMode="decimal" value={pos.lat} onChange={(e) => setPos({ ...pos, lat: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-ink-3">Longitude<input className={field} inputMode="decimal" value={pos.lon} onChange={(e) => setPos({ ...pos, lon: e.target.value })} /></label>
          </>
        )}
        <label className="grid gap-1 text-xs text-ink-3">Rede Wi-Fi (2,4 GHz)<input className={field} value={ssid} onChange={(e) => setSsid(e.target.value)} autoComplete="off" /></label>
        <label className="grid gap-1 text-xs text-ink-3">Senha do Wi-Fi<input className={field} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" /></label>
        <label className="flex items-center gap-2 text-xs text-ink-2 sm:col-span-2"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Lembrar a rede e a senha neste navegador (para as próximas placas)</label>
        {!clientId && token !== SESSION_TOKEN && (
          <label className="grid gap-1 text-xs text-ink-3 sm:col-span-2">Token de administrador<input className={field} type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></label>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void run()} disabled={busy || !port || hasImage === false || (sid === NEW && !name.trim())} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? 'Trabalhando…' : 'Gravar e deixar a placa pronta'}
        </button>
        {hasImage === false && <span className="text-xs text-warn">Sem imagem de firmware neste site: gere com <span className="num">make_factory.py</span>.</span>}
      </div>

      {step.k === 'busy' && (
        <div className="grid gap-2" role="status">
          <p className="text-ink-2">{step.text}{step.pct !== undefined ? <span className="num"> {step.pct}%</span> : null}</p>
          {step.pct !== undefined && <div className="h-2 w-60 overflow-hidden rounded-full bg-line"><i className="block h-full bg-cyan" style={{ width: `${step.pct}%` }} /></div>}
        </div>
      )}
      {step.k === 'done' && <p role="status" className="flex items-start gap-1.5 text-ok"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {step.name} está no ar: a primeira leitura chegou. A placa já pode ser instalada.</p>}
      {step.k === 'err' && <p role="alert" className="flex items-start gap-1.5 text-bad"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {step.text}</p>}
    </div>
  )
}
