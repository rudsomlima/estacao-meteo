import { useEffect, useState } from 'react'

export type Route = { page: 'map'; id: null } | { page: 'station'; id: string }

function parse(): Route {
  const m = location.hash.replace(/^#\/?/, '').match(/^s\/([a-z0-9-]+)/)
  return m ? { page: 'station', id: m[1] } : { page: 'map', id: null }
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
