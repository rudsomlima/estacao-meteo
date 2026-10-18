import Lenis from 'lenis'
import { useEffect } from 'react'

let current: Lenis | null = null

/** Rola até uma seção. Usa o Lenis quando ligado e o scroll nativo quando não. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (current) current.scrollTo(el, { offset: -64 })
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Rolagem suave, como no site de referência. Desliga com prefers-reduced-motion. */
export function useLenis() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
    current = lenis
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
      current = null
    }
  }, [])
}
