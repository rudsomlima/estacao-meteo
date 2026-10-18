import type { Reading, Station, StationConfig } from '../types'

async function json<T>(url: string, init?: RequestInit, timeoutMs = 6000): Promise<T> {
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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const admin = (token: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` })

export const fetchStations = () => json<Station[]>('/api/stations')
export const fetchReadings = (id: string, hours: number) => json<Reading[]>(`/api/stations/${id}/readings?hours=${hours}`)

export interface StationEdit {
  name: string; city: string; lat: number; lon: number; alt: number
  config: Partial<StationConfig>
}

export const updateStation = (id: string, edit: StationEdit, token: string) =>
  json<Pick<Station, 'id' | 'name' | 'city' | 'lat' | 'lon' | 'alt' | 'config'>>(`/api/stations/${id}`, {
    method: 'PUT', headers: admin(token), body: JSON.stringify(edit),
  })

export const createStation = (body: StationEdit & { id: string }, token: string) =>
  json<{ id: string; key: string }>('/api/stations', {
    method: 'POST', headers: admin(token), body: JSON.stringify({ ...body, ...body.config }),
  })

export const rotateKey = (id: string, token: string) =>
  json<{ id: string; key: string }>(`/api/stations/${id}/key`, { method: 'POST', headers: admin(token) })

export const store = {
  get(key: string): string {
    try { return localStorage.getItem(key) ?? '' } catch { return '' }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* modo privado */ }
  },
}
