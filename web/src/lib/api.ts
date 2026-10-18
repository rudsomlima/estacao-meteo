import type { DailyRow, FirmwareInfo, Reading, Station, StationConfig, StationEvent } from '../types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal })
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('json')) throw new Error('resposta não é JSON')
    const body = await res.json()
    if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `${res.status}`)
    return body as T
  } finally {
    clearTimeout(timer)
  }
}

// ---------------- assinatura do administrador ----------------
const enc = new TextEncoder()
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function sha256(data: Uint8Array) {
  return toHex(await crypto.subtle.digest('SHA-256', data as BufferSource))
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/**
 * Pedido de administrador. O token NÃO viaja: vai só uma assinatura HMAC de `hora|método|caminho|hash do corpo`,
 * válida por 2 minutos e só para este pedido. Exige contexto seguro (https ou localhost) por causa do Web Crypto.
 */
export async function adminRequest<T>(method: string, path: string, token: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  if (!crypto.subtle) throw new ApiError(0, 'Este navegador só assina pedidos em https ou localhost.')
  const bytes = body === undefined ? new Uint8Array() : body instanceof Uint8Array ? body : enc.encode(JSON.stringify(body))
  const ts = Date.now()
  const sig = await hmac(token, `${ts}|${method}|${path}|${await sha256(bytes)}`)
  return request<T>(path, {
    method,
    headers: { 'x-ts': String(ts), 'x-sig': sig, ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}) },
    body: bytes.length ? (bytes as BodyInit) : undefined,
  }, timeoutMs)
}

// ---------------- leitura pública ----------------
export const fetchStations = () => request<Station[]>('/api/stations')
export const fetchReadings = (id: string, hours: number) => request<Reading[]>(`/api/stations/${id}/readings?hours=${hours}`)
export const fetchDaily = (id: string, days: number, tz: number) => request<DailyRow[]>(`/api/stations/${id}/daily?days=${days}&tz=${tz}`)
export const fetchEvents = (id: string, limit = 50) => request<StationEvent[]>(`/api/stations/${id}/events?limit=${limit}`)
export const fetchFirmware = (id: string) => request<FirmwareInfo>(`/api/stations/${id}/firmware`)

// ---------------- administrador ----------------
export interface StationEdit {
  name: string; city: string; lat: number; lon: number; alt: number
  config: Partial<StationConfig>
}

export const updateStation = (id: string, edit: StationEdit, token: string) =>
  adminRequest<Pick<Station, 'id' | 'name' | 'city' | 'lat' | 'lon' | 'alt' | 'config' | 'cfg_applied'>>('PUT', `/api/stations/${id}`, token, edit)

export const createStation = (body: StationEdit & { id: string }, token: string) =>
  adminRequest<{ id: string; key: string }>('POST', '/api/stations', token, { ...body, ...body.config })

export const createClaim = (id: string, token: string) => adminRequest<{ id: string; code: string; expires_at: number }>('POST', `/api/stations/${id}/claim`, token, {})
export const rotateKey = (id: string, token: string) => adminRequest<{ id: string; key: string }>('POST', `/api/stations/${id}/key`, token)

export const publishFirmware = (id: string, version: string, bin: Uint8Array, token: string) =>
  adminRequest<{ version: string; size: number; sha256: string }>('POST', `/api/stations/${id}/firmware?version=${encodeURIComponent(version)}`, token, bin, 60000)

export const unpublishFirmware = (id: string, token: string) => adminRequest<{ ok: boolean }>('DELETE', `/api/stations/${id}/firmware`, token)

export interface TelegramSettings {
  tokenSet: boolean
  chatId: string
  enabled: boolean
  stations: string[]
  rules: {
    offline: { on: boolean; min: number }
    online: { on: boolean }
    lowBattery: { on: boolean; pct: number }
    batteryOk: { on: boolean }
    gust: { on: boolean; kmh: number }
    rainStart: { on: boolean; mm: number; windowMin: number }
    rainStop: { on: boolean }
  }
  templates: Record<string, string>
  defaults: Record<string, string>
}

export const getTelegram = (token: string) => adminRequest<TelegramSettings>('GET', '/api/settings/telegram', token)
export const saveTelegram = (patch: Record<string, unknown>, token: string) => adminRequest<TelegramSettings>('PUT', '/api/settings/telegram', token, patch)
export const testTelegram = (kind: string, token: string) => adminRequest<{ ok: boolean; error?: string }>('POST', '/api/telegram/test', token, { kind })
export const detectTelegramChat = (botToken: string, token: string) =>
  adminRequest<{ ok: boolean; chatId?: string; title?: string; error?: string }>('POST', '/api/telegram/detect-chat', token, { token: botToken })

export interface Usage {
  stations: number; readings: number; events: number; firmware: number
  oldest: number | null; newest: number | null; approxBytes: number
  perStation: { id: string; n: number; oldest: number; newest: number }[]
}
export const getUsage = (token: string) => adminRequest<Usage>('GET', '/api/usage', token)

export const store = {
  get(key: string): string {
    try { return localStorage.getItem(key) ?? '' } catch { return '' }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* modo privado */ }
  },
}
