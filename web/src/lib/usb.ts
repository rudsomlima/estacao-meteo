/**
 * Reconhece a placa plugada por USB (Web Serial) e conversa com o firmware por linhas JSON.
 * Só funciona no Chrome, Edge e Opera (desktop e Android), em https:// ou localhost. A primeira placa precisa
 * ser autorizada uma vez, com um clique; depois o navegador a reconhece sozinho a cada vez que for plugada.
 */

// tipos mínimos da Web Serial API (o TypeScript ainda não os traz)
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number }
interface SerialPortLike {
  getInfo(): SerialPortInfo
  open(o: { baudRate: number }): Promise<void>
  close(): Promise<void>
  setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}
interface SerialLike extends EventTarget {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(o?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>
}

const serial = (): SerialLike | null => (typeof navigator !== 'undefined' && 'serial' in navigator ? ((navigator as unknown as { serial: SerialLike }).serial) : null)
export const usbSupported = () => serial() !== null

/** Fabricantes que aparecem nas placas ESP32: a Espressif (USB nativa do C3) e as pontes mais comuns. */
const FILTERS: SerialPortInfo[] = [{ usbVendorId: 0x303a }, { usbVendorId: 0x10c4 }, { usbVendorId: 0x1a86 }, { usbVendorId: 0x0403 }]

export type Port = SerialPortLike

/** A gravação do firmware usa a porta sozinha: enquanto ela roda, o reconhecimento automático espera. */
let flashing = false
export const isFlashing = () => flashing
export const setFlashing = (v: boolean) => { flashing = v }

let active: Link | null = null
export async function closeActiveLink() {
  const l = active
  active = null
  await l?.close()
}

export function describePort(p: Port): string {
  const i = p.getInfo()
  if (i.usbVendorId === 0x303a) return i.usbProductId === 0x1001 ? 'ESP32-C3 (USB nativa)' : 'Espressif (USB nativa)'
  if (i.usbVendorId === 0x10c4) return 'ponte CP210x'
  if (i.usbVendorId === 0x1a86) return 'ponte CH340'
  if (i.usbVendorId === 0x0403) return 'ponte FTDI'
  return 'dispositivo serial'
}

const isEsp = (p: Port) => FILTERS.some((f) => f.usbVendorId === p.getInfo().usbVendorId)

export const authorizedPorts = async (): Promise<Port[]> => ((await serial()?.getPorts()) ?? []).filter(isEsp)
export const askForPort = async (): Promise<Port | null> => {
  try { return (await serial()?.requestPort({ filters: FILTERS })) ?? null } catch { return null } // o usuário fechou a janela
}

/** Avisa quando uma placa autorizada é plugada ou removida. */
export function watchPorts(onPlug: (p: Port) => void, onUnplug: (p: Port) => void): () => void {
  const s = serial()
  if (!s) return () => undefined
  const plug = (e: Event) => { const p = (e as unknown as { target: Port }).target; if (p && isEsp(p)) onPlug(p) }
  const unplug = (e: Event) => { const p = (e as unknown as { target: Port }).target; if (p && isEsp(p)) onUnplug(p) }
  s.addEventListener('connect', plug)
  s.addEventListener('disconnect', unplug)
  return () => { s.removeEventListener('connect', plug); s.removeEventListener('disconnect', unplug) }
}

/** Espera uma placa autorizada aparecer (plugada ou reiniciada), por no máximo `ms`. Devolve a porta, ou null se não veio. */
export function waitForPlug(ms: number): Promise<Port | null> {
  return new Promise((resolve) => {
    let stop = () => undefined as void
    const t = window.setTimeout(() => { stop(); resolve(null) }, ms)
    stop = watchPorts((p) => { window.clearTimeout(t); stop(); resolve(p) }, () => undefined)
  })
}

export interface DeviceInfo {
  ok: true
  app: string
  fw: string
  chip: string
  mac: string
  id: string
  server: string
  ssid: string
  hasKey: boolean
  provisioned: boolean
  vbat: number
}

export interface Provision { ssid: string; pass: string; server: string; id: string; key: string }
/** Rede Wi-Fi vista pela placa: nome, sinal (dBm) e se é aberta. */
export interface WifiNet { s: string; r: number; open: boolean }

const isHello = (o: Record<string, unknown>) => o.app === 'estacao-meteo' && o.ok === true
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Uma conversa aberta com a placa. Feche sempre com `close()`. */
export class Link {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private buf = ''
  /** cada espera devolve true se aceitou a resposta (assim um "hello" do keep-alive não é confundido com a resposta de outro comando) */
  private waiters: ((o: Record<string, unknown>) => boolean)[] = []
  private busy = false
  private alive = false
  /** linhas de texto que não são JSON (o log da placa) */
  log: string[] = []

  private port: Port
  /** o que a placa disse no último "hello" (inclui o id da estação em que ela está configurada) */
  info: DeviceInfo | null = null

  constructor(port: Port) {
    this.port = port
  }

  async open() {
    await this.port.open({ baudRate: 115200 })
    // sem os sinais baixos, algumas pontes seguram a placa em reset
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => undefined)
    this.reader = this.port.readable!.getReader()
    this.writer = this.port.writable!.getWriter()
    this.alive = true
    active = this
    void this.pump()
  }

  private async pump() {
    const dec = new TextDecoder()
    try {
      while (this.alive && this.reader) {
        const { value, done } = await this.reader.read()
        if (done) break
        this.buf += dec.decode(value, { stream: true })
        let i
        while ((i = this.buf.indexOf('\n')) >= 0) {
          const line = this.buf.slice(0, i).trim()
          this.buf = this.buf.slice(i + 1)
          if (!line) continue
          if (line.startsWith('{')) {
            try { const o = JSON.parse(line) as Record<string, unknown>; this.waiters = this.waiters.filter((w) => !w(o)); continue } catch { /* linha de log que começa com { */ }
          }
          this.log.push(line)
          if (this.log.length > 60) this.log.shift()
        }
      }
    } catch { /* cabo removido */ }
  }

  private async send(o: object) {
    await this.writer?.write(new TextEncoder().encode(JSON.stringify(o) + '\n'))
  }

  private next(ms: number, accept: (o: Record<string, unknown>) => boolean = () => true) {
    return new Promise<Record<string, unknown> | null>((res) => {
      const t = setTimeout(() => { this.waiters = this.waiters.filter((w) => w !== h); res(null) }, ms)
      const h = (o: Record<string, unknown>) => { if (!accept(o)) return false; clearTimeout(t); res(o); return true }
      this.waiters.push(h)
    })
  }

  /** Pede o "olá" da placa. Ela só escuta nos primeiros segundos depois de ligar, então insiste. */
  async hello(totalMs = 12000): Promise<DeviceInfo | null> {
    const end = Date.now() + totalMs
    while (Date.now() < end) {
      await this.send({ cmd: 'hello' }).catch(() => undefined)
      const r = await this.next(700, isHello)
      if (r) { this.info = r as unknown as DeviceInfo; return this.info }
    }
    return null
  }

  /** Reinicia a placa pelos sinais da USB. Não funciona em todas as placas. */
  async reset() {
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true }).catch(() => undefined)
    await sleep(150)
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => undefined)
    await sleep(600) // a USB nativa reaparece
  }

  /** Redes Wi-Fi por perto, lidas pela própria placa (ela é quem vai se conectar). Lista vazia se a placa for antiga. */
  async scan(): Promise<WifiNet[]> {
    this.busy = true
    try {
      await this.send({ cmd: 'scan' })
      const r = await this.next(9000, (o) => Array.isArray(o.networks) || 'error' in o) // firmware antigo responde "comando"
      return r && Array.isArray(r.networks) ? (r.networks as WifiNet[]) : []
    } finally { this.busy = false }
  }

  async provision(p: Provision): Promise<{ ok: boolean; error?: string }> {
    this.busy = true
    try {
      await this.send({ cmd: 'provision', ...p })
      const r = await this.next(4000, (o) => 'restarting' in o || 'error' in o)
      if (!r) return { ok: false, error: 'a placa não respondeu' }
      return { ok: r.ok === true, error: typeof r.error === 'string' ? r.error : undefined }
    } finally { this.busy = false }
  }

  get usable() { return this.alive && this.info !== null }

  /**
   * Manda a configuração inteira pelo cabo e a placa aplica na hora (a mesma que o servidor entregaria no próximo envio).
   * A linha tem ~600 bytes: vai em pedaços pequenos para não estourar o buffer da porta da placa.
   */
  async applyConfig(config: Record<string, unknown>): Promise<{ ok: boolean; version?: number; restarting?: boolean; error?: string }> {
    this.busy = true
    try {
      const slim = Object.fromEntries(Object.entries(config).filter(([, v]) => typeof v === 'number'))
      const bytes = new TextEncoder().encode(JSON.stringify({ cmd: 'config', config: slim }) + '\n')
      const answer = this.next(6000, (o) => 'version' in o || 'error' in o)
      for (let i = 0; i < bytes.length; i += 48) {
        await this.writer?.write(bytes.slice(i, i + 48))
        await sleep(4)
      }
      const r = await answer
      if (!r) return { ok: false, error: 'a placa não respondeu' }
      if (r.ok !== true) return { ok: false, error: r.error === 'comando' ? 'o firmware da placa é antigo e não aceita configuração pelo cabo (atualize o firmware)' : String(r.error ?? 'recusada') }
      return { ok: true, version: Number(r.version), restarting: r.restarting === true }
    } catch {
      return { ok: false, error: 'falha ao escrever na porta' }
    } finally { this.busy = false }
  }

  /**
   * A placa só escuta a USB por um tempo depois de ligar, e cada comando renova esse tempo. Enquanto o formulário
   * está aberto, manda um "hello" a cada poucos segundos para ela não desistir. Se ela parar de responder (a janela
   * acabou e ela foi para o portal Wi-Fi), reinicia pelos sinais da USB e tenta de novo. `onLost` só é chamado se
   * nem isso adiantar. Devolve a função que para o keep-alive.
   */
  keepAlive(onLost: () => void): () => void {
    let stopped = false, misses = 0, recovering = false
    const tick = async () => {
      if (stopped || this.busy || recovering || !this.alive) return
      await this.send({ cmd: 'hello' }).catch(() => undefined)
      const r = await this.next(2000, isHello)
      if (stopped || this.busy) return
      if (r) { misses = 0; return }
      if (++misses < 2) return
      recovering = true
      await this.reset()
      const info = await this.hello(10000)
      recovering = false
      if (stopped) return
      if (info) misses = 0
      else onLost()
    }
    const t = window.setInterval(() => void tick(), 4000)
    return () => { stopped = true; window.clearInterval(t) }
  }

  /** Reinicia a placa e espera ela responder de novo. Devolve false se não voltou. */
  async revive(): Promise<boolean> {
    this.busy = true
    try {
      await this.reset()
      return (await this.hello(12000)) !== null
    } finally { this.busy = false }
  }

  /** Solta a porta sem esquecer a conversa (outro programa, como o PlatformIO, pode precisar dela). `resume()` a retoma. */
  async park() { await this.close() }

  /** Reabre a porta que `park()` soltou e espera a placa responder de novo. */
  async resume(): Promise<boolean> {
    try {
      await this.open()
      await this.reset() // abrir a porta já reinicia a placa; o pulso garante o mesmo em qualquer ponte
      return (await this.hello(12000)) !== null
    } catch { return false }
  }

  async close() {
    if (active === this) active = null
    this.alive = false
    try { await this.reader?.cancel() } catch { /* já fechou */ }
    try { this.reader?.releaseLock() } catch { /* idem */ }
    try { this.writer?.releaseLock() } catch { /* idem */ }
    try { await this.port.close() } catch { /* idem */ }
  }
}

/** Versões de configuração que foram aplicadas pelo cabo, por estação: o site mostra "entregue pelo cabo USB". */
const viaCable = new Map<string, { version: number; at: number }>()
export const appliedViaCable = (id: string, version: number) => {
  const c = viaCable.get(id)
  return c && c.version === version ? c.at : null
}

/**
 * Se a placa desta estação está ligada ao computador por USB (e reconhecida pelo site), aplica a configuração nela
 * na hora. Devolve null se não há placa dessa estação no cabo (a configuração segue pelo servidor, no próximo envio).
 */
export async function pushConfigToUsb(stationId: string, config: object): Promise<{ ok: boolean; version?: number; restarting?: boolean; error?: string } | null> {
  const l = active
  if (!l || !l.usable || l.info?.id !== stationId) return null
  const r = await l.applyConfig(config as Record<string, unknown>)
  if (r.ok && r.version !== undefined) viaCable.set(stationId, { version: r.version, at: Date.now() / 1000 })
  return r
}
