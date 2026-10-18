import { useSyncExternalStore } from 'react'

/** Um relógio de 1 s compartilhado: quem o usa redesenha a cada segundo (para "há 2min10s" andar sozinho). */
let now = Date.now()
const subs = new Set<() => void>()
let timer = 0

function subscribe(cb: () => void) {
  subs.add(cb)
  if (!timer) timer = window.setInterval(() => { now = Date.now(); subs.forEach((f) => f()) }, 1000)
  return () => {
    subs.delete(cb)
    if (!subs.size) { clearInterval(timer); timer = 0 }
  }
}

export const useNow = () => useSyncExternalStore(subscribe, () => now)
