import { ApiError, createStation, rotateKey } from '../lib/api'
import { ADDRESS_FULL, explainFlashError, flash } from '../lib/flash'
import { waitForPlug, type Link, type Port } from '../lib/usb'
import type { StationConfig } from '../types'
import { fetchImage, loadManifest } from './manifest'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

export interface NewStation { name: string; owner: string; lat: string; lon: string; config: Partial<StationConfig> }

/** Cria a estação no servidor. A chave da criação já serve para a placa. */
export async function createNewStation(s: NewStation, token: string): Promise<{ id: string; label: string; key: string }> {
  const id = slug(s.name)
  if (!id) throw new Error('Dê um nome à estação.')
  const lat = Number(s.lat), lon = Number(s.lon)
  if (!s.lat || !s.lon || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Informe o local (latitude e longitude). Dá para ajustar depois no mapa.')
  const label = s.name.trim()
  const c = await createStation({ id, name: label, city: '', lat, lon, alt: 0, config: s.config, ...(s.owner.trim() ? { owner_email: s.owner.trim() } : {}) }, token)
  return { id, label, key: c.key }
}

/** Gera uma chave nova para uma estação que já existe. A anterior deixa de valer. */
export async function rotate(id: string, token: string): Promise<string> {
  return (await rotateKey(id, token)).key
}

/** Grava a imagem completa na placa. Se ela não estiver em modo de gravação, espera o RESET e tenta de novo. Devolve a porta (pode ter mudado). */
export async function flashFactory(port: Port, ev: { onPct: (pct: number) => void; onWait?: () => void }): Promise<Port> {
  const img = (await loadManifest())[0]
  if (!img) throw new Error('Não há imagem de firmware neste site (gere com tools/make_factory.py).')
  const data = await fetchImage(img)
  let current = port
  const run = () => flash(current, { name: img.file, data, address: ADDRESS_FULL }, { eraseAll: false, onProgress: ev.onPct, onLog: () => undefined })
  try { await run() } catch (e) {
    if (!explainFlashError(e).waitForBoard) throw e
    ev.onWait?.()
    const p = await waitForPlug(60000)
    if (!p) throw new Error('A placa não apareceu em 60 s. Confira o cabo (precisa ser de dados).')
    current = p
    await sleep(800)
    await run()
  }
  return current
}

/** Grava Wi-Fi, endereço e chave na placa (pelo cabo). */
export async function provisionBoard(link: Link, data: { ssid: string; pass: string; server: string; id: string; key: string }): Promise<void> {
  const r = await link.provisionWithRetry(data)
  if (!r.ok) throw new Error(`A placa recusou (${r.error ?? 'erro'}). Confira os dados e tente de novo.`)
}

export const errorText = (e: unknown) => (e instanceof ApiError ? (e.status === 401 ? 'Token de administrador incorreto.' : e.message) : e instanceof Error ? e.message : 'Falhou.')
