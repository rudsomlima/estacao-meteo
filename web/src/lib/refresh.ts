import { useSyncExternalStore } from 'react'
import { syncServerMs } from './clock'
import { getPrefs, subscribePrefs } from './prefs'

/**
 * Quando buscar dados novos na API. Dois jeitos, escolhidos em Ajustes:
 *
 *  - tempo real (padrão): o site mantém um WebSocket aberto em /api/live e o servidor avisa quando uma estação envia ou muda.
 *    Só então o site busca o dado novo. Além disso faz uma consulta de segurança a cada `pollS` segundos (0 desliga), para o
 *    caso de a conexão cair sem ninguém perceber;
 *  - consulta periódica: pergunta ao servidor a cada `pollS` segundos, sem WebSocket.
 *
 * Com a aba escondida não consulta; ao voltar, atualiza na hora. Quem precisa de dado novo assina com `subscribeRefresh`.
 */
type Listener = (stationId: string | null) => void
export type LiveState = 'live' | 'connecting' | 'poll' | 'idle'

const listeners = new Set<Listener>()
const stateSubs = new Set<() => void>()
let state: LiveState = 'idle'
let ws: WebSocket | null = null
let safety = 0
let heartbeat = 0
let reconnect = 0
let attempt = 0
let lastSeen = 0
let everOpen = false
let running = false

const emit = (id: string | null) => listeners.forEach((l) => l(id))
function setState(s: LiveState) {
  if (s === state) return
  state = s
  stateSubs.forEach((f) => f())
}

function stop() {
  window.clearInterval(safety); window.clearInterval(heartbeat); window.clearTimeout(reconnect)
  safety = heartbeat = reconnect = 0
  if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close() } catch { /* já fechou */ } ws = null }
}

function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`
  setState('connecting')
  let sock: WebSocket
  try { sock = new WebSocket(url) } catch { retry(); return }
  ws = sock
  sock.onopen = () => {
    attempt = 0
    lastSeen = Date.now()
    setState('live')
    if (everOpen) emit(null) // reconectou: pode ter perdido avisos
    everOpen = true
    window.clearInterval(heartbeat)
    // "ping" a cada 25 s mantém a conexão viva por proxies; sem resposta em 70 s, a conexão está morta e é refeita
    heartbeat = window.setInterval(() => {
      if (Date.now() - lastSeen > 70_000) { sock.close(); return }
      try { sock.send('ping') } catch { /* fecha sozinha */ }
    }, 25_000)
  }
  sock.onmessage = (e) => {
    lastSeen = Date.now()
    if (e.data === 'pong') return
    try {
      const m = JSON.parse(String(e.data)) as { t?: string; id?: string | null; ts?: number }
      if (typeof m.ts === 'number') syncServerMs(m.ts) // o relógio do servidor vem de graça nos avisos
      if (m.t === 'update') emit(m.id ?? null)
    } catch { /* mensagem desconhecida */ }
  }
  sock.onclose = () => { if (ws === sock) { ws = null; window.clearInterval(heartbeat); retry() } }
  sock.onerror = () => { /* o onclose cuida */ }
}

function retry() {
  setState('connecting')
  const wait = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500
  window.clearTimeout(reconnect)
  reconnect = window.setTimeout(connect, wait)
}

/** (Re)aplica as preferências: tempo real ou consulta periódica. */
let applied = ''
function apply() {
  if (!running) return
  const { updates, pollS } = getPrefs()
  if (`${updates}/${pollS}` === applied) return // mudou outra preferência (unidades...): a conexão segue como está
  applied = `${updates}/${pollS}`
  stop()
  const every = updates === 'poll' ? Math.max(5, pollS || 15) : pollS
  if (every > 0) safety = window.setInterval(() => { if (!document.hidden) emit(null) }, every * 1000)
  if (updates === 'poll') { setState('poll'); return }
  attempt = 0
  connect()
}

const onVisible = () => { if (!document.hidden) emit(null) }
const onPrefs = () => apply()

/** Assina os avisos de dado novo. `stationId` é a estação que enviou, ou null quando é para atualizar tudo. */
export function subscribeRefresh(cb: Listener): () => void {
  listeners.add(cb)
  if (!running) {
    running = true
    document.addEventListener('visibilitychange', onVisible)
    const off = subscribePrefs(onPrefs)
    stopPrefs = off
    apply()
  }
  return () => {
    listeners.delete(cb)
    if (!listeners.size && running) {
      running = false
      document.removeEventListener('visibilitychange', onVisible)
      stopPrefs()
      stop()
      applied = ''
      everOpen = false
      setState('idle')
    }
  }
}
let stopPrefs = () => undefined as void

export const useLiveState = () => useSyncExternalStore((cb) => { stateSubs.add(cb); return () => { stateSubs.delete(cb) } }, () => state, () => 'idle' as LiveState)
