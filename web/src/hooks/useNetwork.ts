import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, createStation, fetchReadings, fetchStations, rotateKey, store, updateStation, type StationEdit } from '../lib/api'
import { demoHistory, demoNetwork, demoNext } from '../lib/demo'
import type { Reading, Source, Station } from '../types'

const POLL_MS = 30_000
const DEMO_TICK_MS = 6_000
const HISTORY_HOURS = 24 * 7

export interface SaveResult { ok: boolean; message: string; key?: string }

export function useNetwork() {
  const [stations, setStations] = useState<Station[]>([])
  const [source, setSource] = useState<Source>('demo')
  const [loading, setLoading] = useState(true)
  const sourceRef = useRef<Source>('demo')

  const refresh = useCallback(async () => {
    try {
      const list = await fetchStations()
      sourceRef.current = 'api'
      setStations(list)
      setSource('api')
      setLoading(false)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let alive = true
    let timer = 0
    refresh().then((ok) => {
      if (!alive) return
      if (ok) { timer = window.setInterval(refresh, POLL_MS); return }
      // sem API (por exemplo `npm run dev` sozinho): rede simulada
      sourceRef.current = 'demo'
      setStations(demoNetwork().map((s) => ({ ...s, ...patchFromLocal(s) })))
      setSource('demo')
      setLoading(false)
      timer = window.setInterval(() => {
        setStations((prev) => prev.map((s) => {
          const next = demoNext(s.id)
          return next ? { ...s, latest: next } : s
        }))
      }, DEMO_TICK_MS)
    })
    return () => { alive = false; clearInterval(timer) }
  }, [refresh])

  const save = useCallback(async (s: Station, token: string): Promise<SaveResult> => {
    const edit: StationEdit = { name: s.name, city: s.city, lat: s.lat, lon: s.lon, alt: s.alt, config: s.config }
    if (sourceRef.current === 'demo') {
      store.set('meteo.demo.' + s.id, JSON.stringify(edit))
      setStations((prev) => prev.map((p) => (p.id === s.id ? { ...p, ...s } : p)))
      return { ok: true, message: 'Salvo só neste navegador (modo demonstração).' }
    }
    try {
      const saved = await updateStation(s.id, edit, token)
      setStations((prev) => prev.map((p) => (p.id === s.id ? { ...p, ...saved } : p)))
      return { ok: true, message: `Versão ${saved.config.version} salva. O ESP32 baixa no próximo ciclo.` }
    } catch (e) {
      return { ok: false, message: explain(e) }
    }
  }, [])

  const add = useCallback(async (body: StationEdit & { id: string }, token: string): Promise<SaveResult> => {
    if (sourceRef.current === 'demo') return { ok: false, message: 'Na demonstração não há servidor para criar estações. Rode a API do worker.' }
    try {
      const r = await createStation(body, token)
      await refresh()
      return { ok: true, message: 'Estação criada.', key: r.key }
    } catch (e) {
      return { ok: false, message: explain(e) }
    }
  }, [refresh])

  const newKey = useCallback(async (id: string, token: string): Promise<SaveResult> => {
    if (sourceRef.current === 'demo') return { ok: false, message: 'Disponível só com a API.' }
    try {
      const r = await rotateKey(id, token)
      return { ok: true, message: 'Chave nova gerada. A antiga deixou de valer.', key: r.key }
    } catch (e) {
      return { ok: false, message: explain(e) }
    }
  }, [])

  return { stations, source, loading, save, add, newKey, refresh }
}

function patchFromLocal(s: Station): Partial<Station> {
  try {
    const raw = store.get('meteo.demo.' + s.id)
    if (!raw) return {}
    const e = JSON.parse(raw) as StationEdit
    return { name: e.name, city: e.city, lat: e.lat, lon: e.lon, alt: e.alt, config: { ...s.config, ...e.config } }
  } catch {
    return {}
  }
}

function explain(e: unknown) {
  if (e instanceof ApiError) return e.status === 401 ? 'Token de administrador incorreto.' : e.message
  return 'Não foi possível falar com o servidor. Tente de novo.'
}

/** Histórico de uma estação (API ou demonstração), com atualização periódica. */
export function useReadings(id: string | null, source: Source, hours = HISTORY_HOURS) {
  const [readings, setReadings] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let alive = true
    let timer = 0
    setLoading(true)
    const load = async () => {
      try {
        const list = await fetchReadings(id, hours)
        if (alive) { setReadings(list); setLoading(false) }
      } catch {
        if (alive) setLoading(false)
      }
    }
    if (source === 'api') {
      load()
      timer = window.setInterval(load, POLL_MS)
    } else {
      setReadings(demoHistory(id, hours))
      setLoading(false)
      timer = window.setInterval(() => {
        const next = demoNext(id)
        if (next) setReadings((prev) => [...prev.slice(-1100), next])
      }, DEMO_TICK_MS)
    }
    return () => { alive = false; clearInterval(timer) }
  }, [id, source, hours])

  return { readings, loading }
}
