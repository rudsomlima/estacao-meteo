import { hasBattery } from '../lib/battery'
import { CircleCheck, MapPin, Usb, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { go } from '../hooks/useRoute'
import { useToken } from '../hooks/useToken'
import { canEditStation, useIsAdmin, useSession } from '../lib/session'
import GoogleLogin from './GoogleLogin'
import { ApiError, createStation, fetchStations, rotateKey, store } from '../lib/api'
import { DEFAULT_CONFIG } from '../lib/demo'
import { ADDRESS_FULL, explainFlashError, flash } from '../lib/flash'
import { askForPort, authorizedPorts, describePort, isFlashing, Link, usbSupported, watchPorts, type DeviceInfo, type Port, type WifiNet } from '../lib/usb'
import type { Source, Station } from '../types'

const ADD_EVENT = 'meteo:usb-add'
/** Pede ao site para autorizar uma placa nova (precisa de um clique do usuário). */
export const requestUsb = () => window.dispatchEvent(new Event(ADD_EVENT))

/** O aviso pede ao mapa para escolher um ponto; o mapa responde com o ponto (ou null se cancelar). */
export const PICK_EVENT = 'meteo:usb-pick'
export const PICKED_EVENT = 'meteo:usb-picked'
export type Picked = { lat: number; lon: number } | null

const input = 'num w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink'
const SSID_KEY = 'meteo.lastSsid'
const isLocal = (u: string) => /\/\/(localhost|127\.|\[::1\])/.test(u)

interface Image { file: string; env: string; size: number; server: string | null; fw?: string }
let manifestCache: Image[] | null = null
async function manifest(): Promise<Image[]> {
  if (manifestCache) return manifestCache
  try {
    const r = await fetch('/firmware/manifest.json')
    const m = r.ok ? ((await r.json()) as Image[]) : []
    manifestCache = Array.isArray(m) ? m : []
  } catch { manifestCache = [] }
  return manifestCache
}

/** O IP deste computador na rede local, que só o servidor de desenvolvimento (npm run dev) sabe dizer. */
let lanCache: Promise<string> | null = null
function lanServer(): Promise<string> {
  lanCache ??= fetch('/__lan')
    .then((r) => (r.ok ? (r.json() as Promise<{ ips: string[] }>) : { ips: [] }))
    .then((j) => (j.ips[0] ? `http://${j.ips[0]}:8787` : ''))
    .catch(() => '')
  return lanCache
}

type State =
  | { s: 'probing'; port: Port }
  | { s: 'silent'; port: Port; why?: 'busy' | 'flash'; detail?: string } // a placa existe mas o firmware não respondeu (busy: outro programa está com a porta)
  | { s: 'flashing'; port: Port; pct: number }
  | { s: 'ready'; port: Port; link: Link; info: DeviceInfo }
  | { s: 'waiting'; id: string; name: string; since: number }
  | { s: 'online'; id: string; name: string }

/**
 * Aviso que aparece sozinho quando uma placa ESP32 é plugada: reconhece a placa, grava o firmware se faltar,
 * configura Wi-Fi, endereço e chave e confirma quando chega a primeira leitura. Tudo num só lugar.
 */
/** Placas USB são só do administrador: para os outros o aviso nem existe (e a porta nunca é aberta). */
export default function UsbDevice(props: { stations: Station[]; source: Source; onChanged: () => unknown }) {
  const admin = useIsAdmin()
  return admin ? <UsbDeviceAdmin {...props} /> : null
}

function UsbDeviceAdmin({ stations, source, onChanged }: { stations: Station[]; source: Source; onChanged: () => unknown }) {
  const [state, setState] = useState<State | null>(null)
  const [hidden, setHidden] = useState(false)
  const [picking, setPicking] = useState(false)
  const link = useRef<Link | null>(null)
  const busy = useRef(false)
  const stateRef = useRef<State | null>(null)
  useEffect(() => { stateRef.current = state })
  const parked = useRef(false) // a porta foi solta porque a janela perdeu o foco (veja abaixo)
  const missed = useRef(false) // uma placa apareceu enquanto a janela estava sem foco, ou durante uma procura

  const probe = useCallback(async (port: Port, tryReset: boolean) => {
    if (isFlashing()) return
    if (busy.current) { missed.current = true; return } // placa reapareceu no meio da procura: procura de novo ao terminar
    busy.current = true
    parked.current = false
    setHidden(false)
    setState({ s: 'probing', port })
    try {
      await link.current?.close()
      const l = new Link(port)
      link.current = l
      await l.open()
      // abrir a porta pode derrubar a placa no modo de gravação (o driver liga DTR e RTS): reinicia para ela rodar o firmware
      await l.reset()
      let info = await l.hello(12000)
      if (!info && tryReset) { await l.reset(); info = await l.hello(10000) }
      if (info) setState({ s: 'ready', port, link: l, info })
      else { await l.close(); link.current = null; setState({ s: 'silent', port }) }
    } catch {
      link.current = null
      setState({ s: 'silent', port, why: 'busy' }) // a porta está em uso por outro programa (monitor serial, IDE...)
    }
    busy.current = false
    if (missed.current && document.hasFocus()) { missed.current = false; if (stateRef.current?.s !== 'ready') window.dispatchEvent(new Event('meteo:usb-probe')) }
  }, [])

  useEffect(() => {
    if (!usbSupported()) return
    void authorizedPorts().then((ps) => { if (ps[0]) void probe(ps[0], true) })
    const stop = watchPorts(
      (p) => { if (document.hasFocus()) void probe(p, false); else missed.current = true },
      () => { void link.current?.close(); link.current = null; setState((cur) => (cur && (cur.s === 'waiting' || cur.s === 'online' || cur.s === 'flashing') ? cur : null)) },
    )
    const add = () => void askForPort().then((p) => { if (p) void probe(p, true) })
    const again = () => void authorizedPorts().then((ps) => { if (ps[0]) void probe(ps[0], true) })
    const picked = () => setPicking(false)
    // Solta a porta quando a janela fica sem foco por alguns segundos (quem está gravando pelo PlatformIO ou lendo o
    // monitor serial está em outra janela) e a retoma ao voltar. Sem isso o site prenderia a porta o tempo todo.
    let idle = 0
    const onBlur = () => {
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        const st = stateRef.current
        if (st?.s === 'ready' && link.current && !parked.current) { parked.current = true; void link.current.park() }
      }, 4000)
    }
    const onFocus = () => {
      window.clearTimeout(idle)
      const st = stateRef.current
      if (parked.current && st?.s === 'ready' && link.current) {
        parked.current = false
        const l = link.current
        void l.resume().then((ok) => { if (!ok && link.current === l) { void l.close(); link.current = null; setState({ s: 'silent', port: st.port }) } })
      } else if (missed.current && !busy.current) {
        missed.current = false
        again()
      }
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener(PICKED_EVENT, picked)
    window.addEventListener(ADD_EVENT, add)
    window.addEventListener('meteo:usb-probe', again)
    return () => {
      stop(); window.clearTimeout(idle)
      window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus)
      window.removeEventListener(PICKED_EVENT, picked); window.removeEventListener(ADD_EVENT, add); window.removeEventListener('meteo:usb-probe', again)
    }
  }, [probe])

  // depois de configurar, espera a primeira leitura chegar ao servidor
  const waiting = state?.s === 'waiting' ? state : null
  useEffect(() => {
    if (!waiting) return
    const t = window.setInterval(async () => {
      try {
        const s = (await fetchStations()).find((x) => x.id === waiting.id)
        if (s?.last_seen && s.last_seen >= waiting.since) { setState({ s: 'online', id: waiting.id, name: waiting.name }); void onChanged() }
      } catch { /* continua tentando */ }
    }, 3000)
    return () => window.clearInterval(t)
  }, [waiting]) // eslint-disable-line react-hooks/exhaustive-deps

  const flashNow = async (port: Port) => {
    const img = (await manifest())[0]
    if (!img) return false
    setState({ s: 'flashing', port, pct: 0 })
    try {
      const r = await fetch(`/firmware/${img.file}`)
      if (!r.ok) throw new Error('Não foi possível baixar a imagem do firmware.')
      const data = new Uint8Array(await r.arrayBuffer())
      await flash(port, { name: img.file, data, address: ADDRESS_FULL }, { eraseAll: false, onProgress: (pct) => setState({ s: 'flashing', port, pct }), onLog: () => undefined })
      setTimeout(() => void probe(port, true), 3000) // a placa reinicia sozinha: procura de novo
      setState({ s: 'probing', port })
      return true
    } catch (e) {
      setState({ s: 'silent', port, why: 'flash', detail: explainFlashError(e).text })
      return false
    }
  }

  if (!state || hidden) return null
  const close = () => { void link.current?.close(); link.current = null; setHidden(true); setState(null) }

  return (
    <aside role="dialog" aria-label="Placa USB detectada" hidden={picking} className="glass fixed bottom-3 right-3 z-[70] max-h-[92svh] w-[min(400px,calc(100vw-24px))] overflow-y-auto rounded-2xl p-4">
      <button onClick={close} aria-label="Fechar" className="absolute right-3 top-3 rounded-lg p-1 text-ink-2 hover:bg-card-hover hover:text-ink"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-2 pr-8 font-display text-lg font-bold tracking-tight">
        <Usb className="h-5 w-5 text-cyan" aria-hidden />
        {state.s === 'online' ? 'Estação no ar' : state.s === 'waiting' ? 'Quase pronto' : 'Placa USB detectada'}
      </div>

      {state.s === 'probing' && <p className="mt-2 text-sm text-ink-2">{describePort(state.port)}. Procurando o firmware da estação…</p>}

      {state.s === 'flashing' && (
        <div className="mt-2 grid gap-2 text-sm text-ink-2">
          <p>Gravando o firmware… <span className="num">{state.pct}%</span>. Não desligue a placa.</p>
          <div className="h-2 overflow-hidden rounded-full bg-line"><i className="block h-full bg-cyan" style={{ width: `${state.pct}%` }} /></div>
        </div>
      )}

      {state.s === 'silent' && <Silent port={state.port} why={state.why} detail={state.detail} onFlash={() => flashNow(state.port)} onRetry={() => void probe(state.port, true)} />}

      {state.s === 'ready' && (
        <Ready
          key={state.info.mac} state={state} stations={stations} source={source} onCreated={onChanged}
          onLost={() => { void state.link.close(); link.current = null; setState({ s: 'silent', port: state.port }) }}
          onPickMap={() => { setPicking(true); go(''); window.setTimeout(() => window.dispatchEvent(new Event(PICK_EVENT)), 400) }}
          onDone={(id, name) => { void state.link.close(); link.current = null; setState({ s: 'waiting', id, name, since: Math.floor(Date.now() / 1000) }) }}
        />
      )}

      {state.s === 'waiting' && (
        <div className="mt-2 grid gap-2 text-sm text-ink-2">
          <p>Configurada como <b className="text-ink">{state.name}</b>. A placa está reiniciando, conectando ao Wi-Fi e enviando a primeira leitura…</p>
          <p className="text-xs text-ink-3">Leva de 10 a 60 segundos. Se passar de 2 minutos, confira a senha do Wi-Fi e se a rede é de 2,4 GHz.</p>
        </div>
      )}

      {state.s === 'online' && (
        <div className="mt-2 grid gap-3 text-sm">
          <p className="flex items-start gap-2 text-ok"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Recebi a primeira leitura de {state.name}. Está funcionando.</p>
          <button onClick={() => { go(`s/${state.id}`); close() }} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white">Abrir a estação</button>
        </div>
      )}
    </aside>
  )
}

function Silent({ port, why, detail, onFlash, onRetry }: { port: Port; why?: 'busy' | 'flash'; detail?: string; onFlash: () => Promise<boolean>; onRetry: () => void }) {
  const [has, setHas] = useState(false)
  useEffect(() => { void manifest().then((m) => setHas(m.length > 0)) }, [])
  if (why === 'busy') {
    return (
      <div className="mt-2 grid gap-3 text-sm text-ink-2">
        <p>{describePort(port)} conectada, mas a porta está em uso por outro programa.</p>
        <p className="text-xs text-ink-3">Feche o monitor serial do PlatformIO, a Arduino IDE ou outra aba deste site e tente de novo.</p>
        <button onClick={onRetry} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Tentar de novo</button>
      </div>
    )
  }
  return (
    <div className="mt-2 grid gap-3 text-sm text-ink-2">
      {why === 'flash' ? <p role="alert" className="text-bad">{detail}</p> : <p>{describePort(port)} conectada, mas o firmware da estação não respondeu.</p>}
      {has && <button onClick={() => void onFlash()} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white">Gravar o firmware agora</button>}
      <details className="text-xs text-ink-3">
        <summary className="cursor-pointer">Já gravei e não reconheceu</summary>
        <ul className="mt-2 list-disc pl-5">
          <li>A placa só escuta nos primeiros segundos depois de ligar: aperte RESET ou replugue o cabo.</li>
          <li>Se ela foi gravada por outro programa, regrave com o botão acima.</li>
          <li>Feche o monitor serial ou a IDE, que podem estar usando a porta.</li>
        </ul>
      </details>
      <button onClick={onRetry} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Procurar de novo</button>
    </div>
  )
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
const NEW = '__new__'

function Ready({ state, stations, source, onPickMap, onLost, onCreated, onDone }: { state: Extract<State, { s: 'ready' }>; stations: Station[]; source: Source; onPickMap: () => void; onCreated: () => unknown; onLost: () => void; onDone: (id: string, name: string) => void }) {
  const { info, link } = state
  const session = useSession()
  const mine = stations.filter((s) => canEditStation(s, source, session)) // só as estações que o usuário pode alterar
  const known = mine.find((s) => s.id === info.id)
  const [token, setToken] = useToken()
  const [sid, setSid] = useState(known?.id ?? (mine.length ? mine[0].id : NEW))
  const [name, setName] = useState('')
  const [pos, setPos] = useState<{ lat: string; lon: string }>({ lat: '', lon: '' })
  const [nets, setNets] = useState<WifiNet[] | null>(null)
  const [ssid, setSsid] = useState(() => info.ssid || store.get(SSID_KEY))
  const [pass, setPass] = useState('')
  const [server, setServer] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(!info.provisioned || !known)

  // Mantém a placa escutando só enquanto o formulário está aberto. Com ele fechado (placa já configurada), deixa a janela
  // de 10 s da placa acabar: ela segue para medir e enviar. Manter o aviso aberto não pode impedi-la de trabalhar.
  useEffect(() => (open ? link.keepAlive(() => lost.current()) : undefined), [link, open])

  // o endereço certo para a placa: em desenvolvimento "localhost" não serve, então usa o que a imagem já traz
  useEffect(() => {
    void Promise.all([manifest(), isLocal(location.origin) ? lanServer() : Promise.resolve('')]).then(([m, lan]) => {
      const embedded = [info.server, m[0]?.server].find((u) => u && !isLocal(u)) ?? ''
      setServer(isLocal(location.origin) ? lan || embedded || location.origin : location.origin)
    })
  }, [info.server])

  // mantém a placa escutando enquanto o formulário está aberto; se ela se perder, o aviso volta ao estado "sem resposta"
  const lost = useRef(onLost)
  lost.current = onLost


  // redes Wi-Fi por perto, lidas pela própria placa
  useEffect(() => { void link.scan().then((n) => { setNets(n); if (!ssid && n[0]) setSsid(n[0].s) }) }, [link]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const fail = (e: unknown) => setErr(e instanceof ApiError ? (e.status === 401 ? 'Token de administrador incorreto.' : e.message) : e instanceof Error ? e.message : 'Falhou.')

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      if (!ssid.trim()) throw new Error('Escolha a rede Wi-Fi.')
      let id = sid, label = stations.find((s) => s.id === sid)?.name ?? sid, key: string
      if (sid === NEW) {
        id = slug(name)
        label = name.trim()
        if (!id) throw new Error('Dê um nome à estação.')
        const lat = Number(pos.lat), lon = Number(pos.lon)
        if (!pos.lat || !pos.lon || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Informe o local (latitude e longitude). Dá para ajustar depois no mapa.')
        const c = await createStation({ id, name: label, city: '', lat, lon, alt: 0, config: DEFAULT_CONFIG }, token)
        key = c.key // a chave da criação já serve: não precisa gerar outra
        void onCreated() // a estação já existe: mostra no mapa sem esperar a próxima atualização
      } else {
        key = (await rotateKey(id, token)).key
      }
      store.set(SSID_KEY, ssid.trim())
      const data = { ssid: ssid.trim(), pass, server: server.trim(), id, key }
      let r = await link.provision(data)
      // a placa não respondeu: provavelmente a janela de escuta dela acabou. Reinicia e tenta uma vez mais
      if (!r.ok && r.error === 'a placa não respondeu' && (await link.revive())) r = await link.provision(data)
      if (!r.ok) throw new Error(`A placa recusou (${r.error ?? 'erro'}). Confira os dados e tente de novo.`)
      onDone(id, label)
      return
    } catch (e) { fail(e) }
    setBusy(false)
  }

  return (
    <div className="mt-2 grid gap-3 text-sm">
      <p className="text-ink-2">
        {info.chip} · firmware <span className="num">{info.fw}</span> · {hasBattery(info.vbat) ? `${info.vbat.toFixed(2)} V` : 'sem bateria'}
      </p>
      <p className={known ? 'text-ok' : 'text-ink-2'}>
        {known ? `Reconhecida: estação ${known.name}.` : info.id ? `Configurada como "${info.id}", que não existe neste site.` : info.provisioned ? 'Já tem rede e chave salvas.' : 'Placa nova, ainda sem configuração.'}
      </p>

      {source === 'demo' ? (
        <p className="text-xs text-ink-3">Para configurar a placa, o site precisa estar ligado à API (não está na demonstração).</p>
      ) : session.clientId && !session.user ? (
        <div className="grid gap-2">
          <p className="text-ink-2">Entre com a sua conta Google para cadastrar esta placa numa estação sua.</p>
          <GoogleLogin />
        </div>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Configurar de novo</button>
      ) : (
        <div className="grid gap-2.5">
          <label className="grid gap-1 text-xs text-ink-3">Estação
            <select value={sid} onChange={(e) => setSid(e.target.value)} className={input}>
              {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={NEW}>Nova estação…</option>
            </select>
          </label>
          {sid === NEW && (
            <div className="grid gap-2 rounded-lg border border-line p-3">
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Sítio)" maxLength={40} />
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className={input} inputMode="decimal" value={pos.lat} onChange={(e) => setPos({ ...pos, lat: e.target.value })} placeholder="Latitude" />
                <input className={input} inputMode="decimal" value={pos.lon} onChange={(e) => setPos({ ...pos, lon: e.target.value })} placeholder="Longitude" />
                <button type="button" onClick={onPickMap} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card-hover"><MapPin className="h-4 w-4" aria-hidden />No mapa</button>
              </div>
              <p className="text-xs text-ink-3">{pos.lat ? 'Usei a localização deste aparelho. Ajuste depois no mapa se precisar.' : 'Clique em No mapa para escolher o ponto, ou digite as coordenadas.'}</p>
            </div>
          )}
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
          <button onClick={run} disabled={busy || (sid === NEW ? !name.trim() : !sid) || !token || !server} className="rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Configurando…' : sid === NEW ? 'Criar a estação e configurar a placa' : known ? 'Reconfigurar esta placa' : 'Configurar esta placa'}
          </button>
          <p className="text-xs text-ink-3">Gera uma chave nova e a grava direto na placa. Ninguém copia nada.</p>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-bad">{err}</p>}
    </div>
  )
}
