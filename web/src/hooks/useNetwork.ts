import { subscribeRefresh } from '../lib/refresh'
import { pushConfigToUsb } from '../lib/usb'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, createStation, deleteStation, fetchDaily, fetchEvents, fetchFirmware, fetchReadings, fetchStations, rotateKey, store, updateStation, type StationEdit } from '../lib/api'
import { aggregateDaily, localTzMinutes } from '../lib/daily'
import { demoHistory, demoNetwork, demoNext } from '../lib/demo'
import type { DailyRow, FirmwareInfo, Reading, Source, Station, StationEvent } from '../types'

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
    let unsub = () => {}
    refresh().then((ok) => {
      if (!alive) return
      if (ok) { unsub = subscribeRefresh(() => void refresh()); return }
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
    return () => { alive = false; clearInterval(timer); unsub() }
  }, [refresh])

  const save = useCallback(async (s: Station, token: string): Promise<SaveResult> => {
    const edit: StationEdit = { name: s.name, city: s.city, lat: s.lat, lon: s.lon, alt: s.alt, config: s.config }
    if (sourceRef.current === 'demo') {
      store.set('meteo.demo.' + s.id, JSON.stringify(edit))
      const next = { ...s, config: { ...s.config, version: s.config.version + 1 } }
      setStations((prev) => prev.map((p) => (p.id === s.id ? { ...p, ...next } : p)))
      // na demonstração a "estação" confirma a versão depois de alguns segundos, para mostrar o fluxo pendente → aplicada
      window.setTimeout(() => setStations((prev) => prev.map((p) => (p.id === s.id ? { ...p, cfg_applied: next.config.version } : p))), 8000)
      return { ok: true, message: `Versão ${next.config.version} salva neste navegador (modo demonstração).` }
    }
    try {
      const saved = await updateStation(s.id, edit, token)
      setStations((prev) => prev.map((p) => (p.id === s.id ? { ...p, ...saved } : p)))
      // placa desta estação no cabo USB: aplica agora, sem esperar o próximo envio
      const usb = await pushConfigToUsb(s.id, saved.config)
      if (usb?.ok) {
        return { ok: true, message: `Versão ${saved.config.version} salva e aplicada na placa pelo cabo USB${usb.restarting ? ' (a placa reiniciou para usar os pinos ou o modo novos)' : ''}. Ela envia agora para o servidor confirmar.` }
      }
      if (usb && !usb.ok) {
        return { ok: true, message: `Versão ${saved.config.version} salva no servidor, mas a placa no cabo não aplicou (${usb.error}). Ela pega no próximo envio.` }
      }
      return { ok: true, message: `Versão ${saved.config.version} salva no servidor. Acompanhe abaixo se a estação foi encontrada, recebeu e aplicou.` }
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

  const remove = useCallback(async (id: string, token: string): Promise<SaveResult> => {
    if (sourceRef.current === 'demo') return { ok: false, message: 'Na demonstração não há servidor. Rode a API do worker.' }
    try {
      await deleteStation(id, token)
      setStations((prev) => prev.filter((s) => s.id !== id))
      return { ok: true, message: 'Estação removida.' }
    } catch (e) {
      return { ok: false, message: explain(e) }
    }
  }, [])

  const newKey = useCallback(async (id: string, token: string): Promise<SaveResult> => {
    if (sourceRef.current === 'demo') return { ok: false, message: 'Disponível só com a API.' }
    try {
      const r = await rotateKey(id, token)
      return { ok: true, message: 'Chave nova gerada. A antiga deixou de valer.', key: r.key }
    } catch (e) {
      return { ok: false, message: explain(e) }
    }
  }, [])

  return { stations, source, loading, save, add, remove, newKey, refresh }
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
    let unsub = () => {}
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
      unsub = subscribeRefresh((sid) => { if (!sid || sid === id) void load() })
    } else {
      setReadings(demoHistory(id, hours))
      setLoading(false)
      timer = window.setInterval(() => {
        const next = demoNext(id)
        if (next) setReadings((prev) => [...prev.slice(-1100), next])
      }, DEMO_TICK_MS)
    }
    return () => { alive = false; clearInterval(timer); unsub() }
  }, [id, source, hours])

  return { readings, loading }
}

/** Leituras de várias estações de uma vez (comparação). Devolve um mapa id → leituras. */
export function useMultiReadings(ids: string[], source: Source, hours: number) {
  const [data, setData] = useState<Record<string, Reading[]>>({})
  const [loading, setLoading] = useState(false)
  const key = ids.join(',')

  useEffect(() => {
    if (!ids.length) { setData({}); return }
    let alive = true
    setLoading(true)
    Promise.all(
      ids.map(async (id) => {
        try {
          return [id, source === 'api' ? await fetchReadings(id, hours) : demoHistory(id, hours)] as const
        } catch {
          return [id, [] as Reading[]] as const
        }
      }),
    ).then((rows) => { if (alive) { setData(Object.fromEntries(rows)); setLoading(false) } })
    return () => { alive = false }
  }, [key, source, hours]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading }
}

/** Um resumo por dia (para o calendário e o resumo do mês). */
export function useDaily(id: string | null, source: Source, days = 365) {
  const [rows, setRows] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) { setRows([]); return }
    let alive = true
    setLoading(true)
    const tz = localTzMinutes()
    const run = source === 'api' ? fetchDaily(id, days, tz) : Promise.resolve(aggregateDaily(demoHistory(id, days * 24), tz))
    run.then((r) => { if (alive) setRows(r) }).catch(() => { if (alive) setRows([]) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, source, days])

  return { rows, loading }
}

const DEMO_EVENTS = (): StationEvent[] => {
  const now = Math.floor(Date.now() / 1000)
  return [
    { ts: now - 3 * 3600, kind: 'boot', reason: 1, count: 12, wake: 'power-on' },
    { ts: now - 3 * 3600 + 40, kind: 'bench', minutes: 2, ip: '192.168.0.57' },
    { ts: now - 26 * 3600, kind: 'boot', reason: 3, count: 11, wake: 'timer' },
  ]
}

/** Eventos do firmware (reinícios, atualizações, modo bancada). */
export function useEvents(id: string | null, source: Source) {
  const [events, setEvents] = useState<StationEvent[]>([])

  useEffect(() => {
    if (!id) return
    let alive = true
    const load = () => (source === 'api' ? fetchEvents(id, 50).catch(() => [] as StationEvent[]) : Promise.resolve(DEMO_EVENTS()))
      .then((e) => { if (alive) setEvents(e) })
    load()
    const unsub = source === 'api' ? subscribeRefresh((sid) => { if (!sid || sid === id) load() }) : () => {}
    return () => { alive = false; unsub() }
  }, [id, source])

  return events
}

export function useFirmware(id: string | null, source: Source) {
  const [info, setInfo] = useState<FirmwareInfo | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!id) return
    if (source !== 'api') { setInfo({ published: null, installed: '0.2.0' }); return }
    let alive = true
    fetchFirmware(id).then((i) => { if (alive) setInfo(i) }).catch(() => { if (alive) setInfo(null) })
    return () => { alive = false }
  }, [id, source, tick])

  return { info, reload: () => setTick((t) => t + 1) }
}
