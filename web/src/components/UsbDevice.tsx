import { CircleCheck, Usb, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToken } from '../hooks/useToken'
import { ApiError, rotateKey } from '../lib/api'
import { askForPort, authorizedPorts, describePort, isFlashing, Link, usbSupported, watchPorts, type DeviceInfo, type Port } from '../lib/usb'
import type { Source, Station } from '../types'

const ADD_EVENT = 'meteo:usb-add'
/** Pede ao site para autorizar uma placa nova (precisa de um clique do usuário). */
export const requestUsb = () => window.dispatchEvent(new Event(ADD_EVENT))

const input = 'num w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink'

type State =
  | { s: 'probing'; port: Port }
  | { s: 'silent'; port: Port } // a placa existe mas o firmware não respondeu
  | { s: 'ready'; port: Port; link: Link; info: DeviceInfo }
  | { s: 'done'; text: string }

/**
 * Aviso que aparece sozinho quando uma placa ESP32 é plugada: reconhece a placa, diz qual estação ela é
 * e configura o Wi-Fi, o endereço e a chave sem digitar nada no portal.
 */
export default function UsbDevice({ stations, source }: { stations: Station[]; source: Source }) {
  const [state, setState] = useState<State | null>(null)
  const [hidden, setHidden] = useState(false)
  const link = useRef<Link | null>(null)
  const busy = useRef(false)

  const probe = useCallback(async (port: Port, tryReset: boolean) => {
    if (busy.current || isFlashing()) return
    busy.current = true
    setHidden(false)
    setState({ s: 'probing', port })
    try {
      await link.current?.close()
      const l = new Link(port)
      link.current = l
      await l.open()
      let info = await l.hello(tryReset ? 5000 : 12000)
      if (!info && tryReset) { await l.reset(); info = await l.hello(10000) }
      if (info) setState({ s: 'ready', port, link: l, info })
      else { await l.close(); link.current = null; setState({ s: 'silent', port }) }
    } catch {
      link.current = null
      setState({ s: 'silent', port }) // a porta está em uso por outro programa (monitor serial, IDE...)
    }
    busy.current = false
  }, [])

  useEffect(() => {
    if (!usbSupported()) return
    void authorizedPorts().then((ps) => { if (ps[0]) void probe(ps[0], true) })
    const stop = watchPorts(
      (p) => void probe(p, false),
      () => { void link.current?.close(); link.current = null; setState(null) },
    )
    const add = () => void askForPort().then((p) => { if (p) void probe(p, true) })
    const again = () => void authorizedPorts().then((ps) => { if (ps[0]) void probe(ps[0], true) })
    window.addEventListener(ADD_EVENT, add)
    window.addEventListener('meteo:usb-probe', again)
    return () => { stop(); window.removeEventListener(ADD_EVENT, add); window.removeEventListener('meteo:usb-probe', again) }
  }, [probe])

  if (!state || hidden) return null
  const close = () => { void link.current?.close(); link.current = null; setHidden(true); setState(null) }

  return (
    <aside role="dialog" aria-label="Placa USB detectada" className="glass fixed bottom-3 right-3 z-[70] w-[min(380px,calc(100vw-24px))] rounded-2xl p-4">
      <button onClick={close} aria-label="Fechar" className="absolute right-3 top-3 rounded-lg p-1 text-ink-2 hover:bg-card-hover hover:text-ink"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-2 pr-8 font-display text-lg font-bold tracking-tight">
        <Usb className="h-5 w-5 text-cyan" aria-hidden />
        {state.s === 'done' ? 'Pronto' : 'Placa USB detectada'}
      </div>

      {state.s === 'probing' && <p className="mt-2 text-sm text-ink-2">{describePort(state.port)}. Procurando o firmware da estação…</p>}

      {state.s === 'silent' && (
        <div className="mt-2 grid gap-2 text-sm text-ink-2">
          <p>{describePort(state.port)} conectada, mas o firmware não respondeu.</p>
          <ul className="list-disc pl-5 text-xs text-ink-3">
            <li>A placa só escuta nos primeiros 10 s depois de ligar: aperte RESET ou replugue o cabo.</li>
            <li>Precisa do firmware do ambiente <span className="num">esp32c3</span>. O de campo (<span className="num">lowpower</span>) não tem USB serial.</li>
            <li>Feche o monitor serial ou a IDE, que podem estar usando a porta.</li>
          </ul>
          <button onClick={() => void probe(state.port, true)} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Tentar de novo</button>
        </div>
      )}

      {state.s === 'ready' && <Ready key={state.info.mac} state={state} stations={stations} source={source} onDone={(text) => { void state.link.close(); link.current = null; setState({ s: 'done', text }) }} />}

      {state.s === 'done' && (
        <p className="mt-2 flex items-start gap-2 text-sm text-ok"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.text}</p>
      )}
    </aside>
  )
}

function Ready({ state, stations, source, onDone }: { state: Extract<State, { s: 'ready' }>; stations: Station[]; source: Source; onDone: (t: string) => void }) {
  const { info, link } = state
  const known = stations.find((s) => s.id === info.id)
  const [token, setToken] = useToken()
  const [sid, setSid] = useState(known?.id ?? stations[0]?.id ?? '')
  const [ssid, setSsid] = useState(info.ssid)
  const [pass, setPass] = useState('')
  const [server, setServer] = useState(() => location.origin)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(!info.provisioned)

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      if (!ssid.trim()) throw new Error('Informe o nome da rede Wi-Fi.')
      const k = await rotateKey(sid, token) // gera uma chave nova e a entrega direto à placa; ninguém precisa copiá-la
      const r = await link.provision({ ssid: ssid.trim(), pass, server: server.trim(), id: sid, key: k.key })
      if (!r.ok) throw new Error(`A placa recusou (${r.error ?? 'erro'}). A chave nova já foi gerada: tente de novo.`)
      onDone(`Configurada como ${stations.find((s) => s.id === sid)?.name ?? sid}. Ela reinicia, conecta ao Wi-Fi e manda a primeira leitura em instantes.`)
      return
    } catch (e) {
      setErr(e instanceof ApiError ? (e.status === 401 ? 'Token de administrador incorreto.' : e.message) : e instanceof Error ? e.message : 'Falhou.')
    }
    setBusy(false)
  }

  return (
    <div className="mt-2 grid gap-3 text-sm">
      <p className="text-ink-2">
        {info.chip} · firmware <span className="num">{info.fw}</span> · {info.vbat > 1 ? `${info.vbat.toFixed(2)} V` : 'sem bateria'}
      </p>
      <p className={known ? 'text-ok' : 'text-ink-2'}>
        {known ? `Reconhecida: estação ${known.name}.` : info.id ? `Configurada como "${info.id}", que não existe neste site.` : info.provisioned ? 'Já tem rede e chave salvas.' : 'Ainda não foi configurada.'}
      </p>

      {source === 'demo' ? (
        <p className="text-xs text-ink-3">Para configurar a placa, o site precisa estar ligado à API (não está na demonstração).</p>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Configurar de novo</button>
      ) : stations.length === 0 ? (
        <p className="text-xs text-ink-3">Crie uma estação no mapa primeiro (botão Adicionar estação).</p>
      ) : (
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-ink-3">Estação
            <select value={sid} onChange={(e) => setSid(e.target.value)} className={input}>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-ink-3">Rede Wi-Fi (2,4 GHz)
            <input className={input} value={ssid} onChange={(e) => setSsid(e.target.value)} autoComplete="off" />
          </label>
          <label className="grid gap-1 text-xs text-ink-3">Senha do Wi-Fi
            <input type="password" className={input} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
          </label>
          <label className="grid gap-1 text-xs text-ink-3">Endereço do site
            <input className={input} value={server} onChange={(e) => setServer(e.target.value)} autoComplete="off" />
          </label>
          {/localhost|127\.0\.0\.1/.test(server) && <p className="text-xs text-warn">A placa não alcança “localhost”. Use o endereço publicado ou o IP do seu computador.</p>}
          <label className="grid gap-1 text-xs text-ink-3">Token de administrador
            <input type="password" className={input} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </label>
          <button onClick={run} disabled={busy || !sid} className="rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Configurando…' : known ? 'Reconfigurar esta placa' : 'Configurar esta placa'}
          </button>
          <p className="text-xs text-ink-3">Isso gera uma chave nova para a estação e a grava na placa. A chave antiga deixa de valer.</p>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-bad">{err}</p>}
    </div>
  )
}
