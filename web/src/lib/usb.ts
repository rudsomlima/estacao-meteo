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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Uma conversa aberta com a placa. Feche sempre com `close()`. */
export class Link {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private buf = ''
  private waiters: ((o: Record<string, unknown>) => void)[] = []
  private alive = false
  /** linhas de texto que não são JSON (o log da placa) */
  log: string[] = []

  private port: Port

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
            try { const o = JSON.parse(line) as Record<string, unknown>; this.waiters.splice(0).forEach((w) => w(o)); continue } catch { /* linha de log que começa com { */ }
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

  private next(ms: number) {
    return new Promise<Record<string, unknown> | null>((res) => {
      const t = setTimeout(() => { this.waiters = this.waiters.filter((w) => w !== h); res(null) }, ms)
      const h = (o: Record<string, unknown>) => { clearTimeout(t); res(o) }
      this.waiters.push(h)
    })
  }

  /** Pede o "olá" da placa. Ela só escuta nos primeiros segundos depois de ligar, então insiste. */
  async hello(totalMs = 12000): Promise<DeviceInfo | null> {
    const end = Date.now() + totalMs
    while (Date.now() < end) {
      await this.send({ cmd: 'hello' }).catch(() => undefined)
      const r = await this.next(700)
      if (r && r.app === 'estacao-meteo' && r.ok === true) return r as unknown as DeviceInfo
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

  async provision(p: Provision): Promise<{ ok: boolean; error?: string }> {
    await this.send({ cmd: 'provision', ...p })
    const r = await this.next(4000)
    if (!r) return { ok: false, error: 'a placa não respondeu' }
    return { ok: r.ok === true, error: typeof r.error === 'string' ? r.error : undefined }
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
