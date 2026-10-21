import { adminRequest } from './api'
import type { StationCommand, StationConfig } from '../types'

/** Rotas do administrador (/api/admin/*). A sessão do Google autentica; o token de administrador não é usado aqui. */
const call = <T>(method: string, path: string, body?: unknown, timeoutMs?: number) => adminRequest<T>(method, path, '', body, timeoutMs)

export interface AdminStation {
  id: string; name: string; city: string; owner_email: string | null; last_seen: number | null; fw_version: string | null
  fw_target: string | null; cfg_version: number; cfg_applied: number; cfg_applied_at: number | null; command: StationCommand | null; vbat: number | null; rssi: number | null; created_at: number
}
export interface AdminUser { email: string; name: string; picture: string; role: 'admin' | 'user'; created_at: number; last_login: number; stations: number }
export interface Release { id: number; version: string; size: number; sha256: string; notes: string; created_by: string; created_at: number; assigned: number }
export interface RolloutRow {
  id: string; name: string; target: string; release_id: number; installed: string | null; assigned_at: number; last_seen: number | null
  status: 'ok' | 'falhou' | 'aguardando'; contact: boolean; fail: { ts: number; stage: string | null; http: number | null } | null
}
export interface Rollout { summary: { total: number; ok: number; falhou: number; aguardando: number }; stations: RolloutRow[] }
export interface AuditRow { ts: number; actor: string; action: string; target: string; detail: string }
export type Scope = string[] | 'all'

export const getOverview = () => call<{ users: number; stations: AdminStation[] }>('GET', '/api/admin/overview')
export const bulkConfig = (ids: Scope, config: Partial<StationConfig>) => call<{ ok: boolean; updated: number; fields: string[] }>('POST', '/api/admin/config', { ids, config })
export const getDefaults = () => call<{ config: StationConfig }>('GET', '/api/admin/defaults')
export const putDefaults = (body: { config?: Partial<StationConfig> }) => call<{ config: StationConfig }>('PUT', '/api/admin/defaults', body)

export const listReleases = () => call<Release[]>('GET', '/api/admin/releases')
export const uploadRelease = (version: string, notes: string, bin: Uint8Array) =>
  call<{ id: number; version: string }>('POST', `/api/admin/releases?version=${encodeURIComponent(version)}&notes=${encodeURIComponent(notes)}`, bin, 90000)
export const deleteRelease = (id: number) => call<{ ok: boolean }>('DELETE', `/api/admin/releases/${id}`)
export const assignRelease = (id: number, ids: Scope) => call<{ ok: boolean; assigned: number; version: string }>('POST', `/api/admin/releases/${id}/assign`, { ids })
export const unassignRelease = (ids: Scope) => call<{ ok: boolean; unassigned: number }>('POST', '/api/admin/releases/unassign', { ids })
export const getRollout = () => call<Rollout>('GET', '/api/admin/rollout')

export const listUsers = () => call<AdminUser[]>('GET', '/api/admin/users')
export const addUser = (email: string, role: 'admin' | 'user' = 'admin') => call<{ ok: boolean; email: string; role: string }>('POST', '/api/admin/users', { email, role })
export const setUserRole = (email: string, role: 'admin' | 'user') => call<{ ok: boolean }>('PUT', `/api/admin/users/${encodeURIComponent(email)}`, { role })
export const removeUser = (email: string) => call<{ ok: boolean }>('DELETE', `/api/admin/users/${encodeURIComponent(email)}`)
export const setStationOwner = (id: string, email: string) => call<{ ok: boolean }>('PUT', `/api/admin/stations/${id}/owner`, { email })

export const rotateAdminToken = () => call<{ token: string }>('POST', '/api/admin/token/rotate', {})
export const restoreAdminToken = () => call<{ ok: boolean }>('DELETE', '/api/admin/token')
export const revokeSessions = () => call<{ ok: boolean }>('POST', '/api/admin/sessions/revoke', {})
export const getAudit = (limit = 100) => call<AuditRow[]>('GET', `/api/admin/audit?limit=${limit}`)

export const putLayout = (order: string[]) => call<{ ok: boolean; order: string[] }>('PUT', '/api/admin/layout', { order })

export const restartStation = (id: string) => call<{ ok: boolean }>('POST', `/api/admin/stations/${id}/restart`, {})
export const cancelStationCommand = (id: string) => call<{ ok: boolean }>('DELETE', `/api/admin/stations/${id}/command`)
export const clearStationEvents = (id: string) => call<{ ok: boolean; removed: number }>('DELETE', `/api/admin/stations/${id}/events`)
