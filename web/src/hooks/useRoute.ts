import { useEffect, useState } from 'react'

export type Route =
  | { page: 'map'; id: null }
  | { page: 'station'; id: string }
  | { page: 'settings'; id: string }

function parse(): Route {
  const m = location.hash.replace(/^#\/?/, '').match(/^s\/([a-z0-9-]+)(\/config)?/)
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
