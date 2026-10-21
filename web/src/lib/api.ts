import { syncServerTime } from './clock'
import { getSessionUser } from './session'
import type { DailyRow, FirmwareInfo, Reading, Station, StationConfig, StationEvent } from '../types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function request<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal })
    syncServerTime(res.headers.get('date'))
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
  // logado com o Google: o cookie de sessão autentica (o token de administrador não é usado)
  if (getSessionUser()) {
    const bin = body instanceof Uint8Array
    return request<T>(path, {
      method,
      headers: body !== undefined && !bin ? { 'content-type': 'application/json' } : bin ? { 'content-type': 'application/octet-stream' } : {},
      body: body === undefined ? undefined : bin ? (body as BodyInit) : JSON.stringify(body),
    }, timeoutMs)
  }
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
// o servidor manda null quando o sensor não mede umidade (MS5611): no site isso é NaN e aparece como "—"
/** O servidor manda null quando falta a medida (umidade no MS5611, direção sem biruta, hora sem leitura): no site é NaN e aparece como "—". */
export const fixNulls = <T extends object>(r: T): T => {
  const o = { ...r } as Record<string, unknown>
  for (const k of ['temp', 'hum', 'pres', 'wind', 'gust', 'dir', 'rain', 'vbat', 'rssi']) if (k in o && o[k] == null) o[k] = NaN
  return o as T
}
export const fetchStations = () => request<Station[]>('/api/stations').then((l) => l.map((st) => (st.latest ? { ...st, latest: fixNulls(st.latest) } : st)))
export const fetchReadings = (id: string, hours: number) => request<Reading[]>(`/api/stations/${id}/readings?hours=${hours}`).then((l) => l.map(fixNulls))
/** Só as leituras depois de `since` (unix): o que chegou desde a última vez. */
export const fetchReadingsSince = (id: string, since: number) => request<Reading[]>(`/api/stations/${id}/readings?since=${since}`).then((l) => l.map(fixNulls))
/** Leitura a leitura, sem resumo por hora (exportação). Até 30 dias. */
export const fetchReadingsRaw = (id: string, hours: number) => request<Reading[]>(`/api/stations/${id}/readings?hours=${hours}&res=raw`).then((l) => l.map(fixNulls))
export const fetchDaily = (id: string, days: number, tz: number) => request<DailyRow[]>(`/api/stations/${id}/daily?days=${days}&tz=${tz}`)
export const fetchEvents = (id: string, limit = 50) => request<StationEvent[]>(`/api/stations/${id}/events?limit=${limit}`)
export const fetchFirmware = (id: string) => request<FirmwareInfo>(`/api/stations/${id}/firmware`)
export const fetchLayout = () => request<{ order: string[] }>('/api/layout')

// ---------------- administrador ----------------
export interface StationEdit {
  name: string; city: string; lat: number; lon: number; alt: number
  config: Partial<StationConfig>
}

export const updateStation = (id: string, edit: StationEdit, token: string) =>
  adminRequest<Pick<Station, 'id' | 'name' | 'city' | 'lat' | 'lon' | 'alt' | 'config' | 'cfg_applied'>>('PUT', `/api/stations/${id}`, token, edit)

export const deleteStation = (id: string, token: string) => adminRequest<{ ok: boolean }>('DELETE', `/api/stations/${id}`, token)

export const createStation = (body: StationEdit & { id: string; owner_email?: string }, token: string) =>
  adminRequest<{ id: string; key: string }>('POST', '/api/stations', token, { ...body, ...body.config })

export const createClaim = (id: string, token: string) => adminRequest<{ id: string; code: string; expires_at: number }>('POST', `/api/stations/${id}/claim`, token, {})
export const rotateKey = (id: string, token: string) => adminRequest<{ id: string; key: string }>('POST', `/api/stations/${id}/key`, token)


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

/** "global" é o Telegram do servidor (administrador); "me" é o do usuário logado, para as estações dele. */
export type TgScope = 'global' | 'me'
const tgBase = (scope: TgScope) => (scope === 'me' ? '/api/me/telegram' : '/api/settings/telegram')
const tgOther = (scope: TgScope, tail: string) => (scope === 'me' ? `/api/me/telegram/${tail}` : `/api/telegram/${tail}`)

export const getTelegram = (token: string, scope: TgScope = 'global') => adminRequest<TelegramSettings & { ownedStations?: string[] }>('GET', tgBase(scope), token)
export const saveTelegram = (patch: Record<string, unknown>, token: string, scope: TgScope = 'global') => adminRequest<TelegramSettings>('PUT', tgBase(scope), token, patch)
export const testTelegram = (kind: string, token: string, scope: TgScope = 'global') => adminRequest<{ ok: boolean; error?: string }>('POST', tgOther(scope, 'test'), token, { kind })
export const detectTelegramChat = (botToken: string, token: string, scope: TgScope = 'global') =>
  adminRequest<{ ok: boolean; chatId?: string; title?: string; error?: string }>('POST', tgOther(scope, 'detect-chat'), token, { token: botToken })

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
