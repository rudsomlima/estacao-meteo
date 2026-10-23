import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchStations } from '../lib/api'
import { explainFlashError } from '../lib/flash'
import { askForPort, authorizedPorts, isFlashing, Link, usbSupported, watchPorts, type DeviceInfo, type Port } from '../lib/usb'
import { ADD_EVENT, PICKED_EVENT, PROBE_EVENT } from './events'
import { flashFactory } from './steps'

/**
 * A placa ligada ao computador, do ponto de vista do assistente:
 *   probing  lendo a placa (hello)
 *   silent   existe mas o firmware não respondeu (busy: outro programa está com a porta; flash: a gravação falhou)
 *   flashing gravando o firmware
 *   ready    respondeu: o assistente decide entre placa nova e placa já cadastrada
 *   waiting  configurada, esperando a primeira leitura chegar ao servidor
 *   online   a primeira leitura chegou
 */
export type BoardState =
  | { s: 'probing'; port: Port }
  | { s: 'silent'; port: Port; why?: 'busy' | 'flash'; detail?: string }
  | { s: 'flashing'; port: Port; pct: number; waitBoard?: boolean }
  | { s: 'ready'; port: Port; link: Link; info: DeviceInfo }
  | { s: 'waiting'; id: string; name: string; since: number }
  | { s: 'online'; id: string; name: string }

/** Detecta a placa (plugada ou autorizada), solta a porta quando a janela perde o foco e acompanha até a primeira leitura. */
export function useBoardSession(onChanged: () => unknown) {
  const [state, setState] = useState<BoardState | null>(null)
  const [hidden, setHidden] = useState(false)
  const [picking, setPicking] = useState(false)
  const link = useRef<Link | null>(null)
  const busy = useRef(false)
  const stateRef = useRef<BoardState | null>(null)
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
    if (missed.current && document.hasFocus()) { missed.current = false; if (stateRef.current?.s !== 'ready') window.dispatchEvent(new Event(PROBE_EVENT)) }
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
    window.addEventListener(PROBE_EVENT, again)
    return () => {
      stop(); window.clearTimeout(idle)
      window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus)
      window.removeEventListener(PICKED_EVENT, picked); window.removeEventListener(ADD_EVENT, add); window.removeEventListener(PROBE_EVENT, again)
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

  /** Grava o firmware completo e procura a placa de novo. Devolve false se falhar (o estado vira "silent" com o motivo). */
  const flashNow = async (port: Port) => {
    setState({ s: 'flashing', port, pct: 0 })
    try {
      const current = await flashFactory(port, {
        onPct: (pct) => setState({ s: 'flashing', port, pct }),
        onWait: () => setState({ s: 'flashing', port, pct: 0, waitBoard: true }),
      })
      setTimeout(() => void probe(current, true), 3000) // a placa reinicia sozinha: procura de novo
      setState({ s: 'probing', port: current })
      return true
    } catch (e) {
      setState({ s: 'silent', port, why: 'flash', detail: explainFlashError(e).text })
      return false
    }
  }

  const close = () => { void link.current?.close(); link.current = null; setHidden(true); setState(null) }
  /** A placa foi configurada (ou o assistente terminou com ela): solta a porta e espera a primeira leitura. */
  const finish = (l: Link, id: string, name: string) => { void l.close(); link.current = null; setState({ s: 'waiting', id, name, since: Math.floor(Date.now() / 1000) }) }
  const lost = (port: Port, l: Link) => { void l.close(); link.current = null; setState({ s: 'silent', port }) }

  return { state, hidden, picking, setPicking, probe, flashNow, close, finish, lost }
}
