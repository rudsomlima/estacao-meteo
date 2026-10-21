import { useSyncExternalStore } from 'react'
import { fetchLayout } from './api'

export type Scene = 'animada' | 'foto' | 'diorama'

/** Cenário do topo da página, escolhido pelo administrador e igual para todo mundo. Busca uma vez; sem servidor fica na animada. */
let scene: Scene = 'animada'
let started = false
const subs = new Set<() => void>()

export function setSceneLocal(s: Scene) {
  scene = s
  subs.forEach((f) => f())
}

function start() {
  if (started) return
  started = true
  void fetchLayout().then((r) => { if (r.scene === 'foto' || r.scene === 'animada' || r.scene === 'diorama') setSceneLocal(r.scene) }).catch(() => {})
}

export function useScene(): Scene {
  start()
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => scene)
}
