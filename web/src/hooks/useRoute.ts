import { useEffect, useState } from 'react'

export type Route =
  | { page: 'map'; id: null }
  | { page: 'station'; id: string }
  | { page: 'settings'; id: string }
  | { page: 'config'; id: null }
  | { page: 'analyses'; id: null }
  | { page: 'admin'; id: null }

function parse(): Route {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash.startsWith('config')) return { page: 'config', id: null }
  if (hash.startsWith('analises')) return { page: 'analyses', id: null }
  if (hash.startsWith('admin')) return { page: 'admin', id: null }
  const m = hash.match(/^s\/([a-z0-9-]+)(\/config)?/)
  if (!m) return { page: 'map', id: null }
  return m[2] ? { page: 'settings', id: m[1] } : { page: 'station', id: m[1] }
}

export const go = (path: string) => { location.hash = '#/' + path }

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
