import { useSyncExternalStore } from 'react'
import { store } from './api'

/** Preferências de quem está vendo o site. Ficam só no navegador e valem na hora, em todas as telas. */
export interface Prefs {
  wind: 'kmh' | 'ms' | 'kn' | 'mph'
  temp: 'c' | 'f'
  rain: 'mm' | 'in'
  pres: 'hpa' | 'inhg' | 'mmhg'
  /** estações favoritas; a primeira é a principal */
  favorites: string[]
  layer: 'wind' | 'temp' | 'rain' | 'battery'
  /** abrir direto na página da estação principal */
  openMain: boolean
}

export const DEFAULT_PREFS: Prefs = { wind: 'kmh', temp: 'c', rain: 'mm', pres: 'hpa', favorites: [], layer: 'wind', openMain: false }

const KEY = 'meteo.prefs'
const EVENT = 'meteo:prefs'

function read(): Prefs {
  try {
    const raw = store.get(KEY)
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/** Aceita só valores conhecidos (serve também para validar um backup importado). */
export function sanitize(input: unknown): Prefs {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, ok: readonly T[], fb: T) => (ok.includes(v as T) ? (v as T) : fb)
  return {
    wind: pick(o.wind, ['kmh', 'ms', 'kn', 'mph'], DEFAULT_PREFS.wind),
    temp: pick(o.temp, ['c', 'f'], DEFAULT_PREFS.temp),
    rain: pick(o.rain, ['mm', 'in'], DEFAULT_PREFS.rain),
    pres: pick(o.pres, ['hpa', 'inhg', 'mmhg'], DEFAULT_PREFS.pres),
    favorites: Array.isArray(o.favorites) ? o.favorites.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{2,32}$/.test(s)).slice(0, 50) : [],
    layer: pick(o.layer, ['wind', 'temp', 'rain', 'battery'], DEFAULT_PREFS.layer),
    openMain: o.openMain === true,
  }
}

let cache = read()
const listeners = new Set<() => void>()

export function setPrefs(patch: Partial<Prefs>) {
  cache = sanitize({ ...cache, ...patch })
  store.set(KEY, JSON.stringify(cache))
  listeners.forEach((l) => l())
}

export const getPrefs = () => cache

function subscribe(cb: () => void) {
  listeners.add(cb)
  const on = (e: StorageEvent) => { if (e.key === KEY) { cache = read(); cb() } } // outras abas
  window.addEventListener('storage', on)
  return () => { listeners.delete(cb); window.removeEventListener('storage', on) }
}

export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS)

export function toggleFavorite(id: string) {
  const f = cache.favorites
  setPrefs({ favorites: f.includes(id) ? f.filter((x) => x !== id) : [...f, id] })
}

/** Torna a estação a principal (a primeira da lista). */
export function makeMain(id: string) {
  setPrefs({ favorites: [id, ...cache.favorites.filter((x) => x !== id)] })
}

export { EVENT }
