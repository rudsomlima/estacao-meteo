import { Activity, ArrowLeft, Radio } from 'lucide-react'
import { go } from '../hooks/useRoute'
import { scrollToId } from '../hooks/useLenis'
import { ago } from '../lib/derive'
import type { Source } from '../types'

const STATION_LINKS = [
  ['agora', 'Agora'],
  ['tendencias', 'Tendências'],
  ['energia', 'Energia'],
  ['config', 'Configuração'],
]
const MAP_LINKS = [
  ['mapa', 'Mapa'],
  ['rede', 'Rede'],
]

interface Props {
  mode: 'map' | 'station'
  title: string
  source: Source
  status: { color: string; text: string } | null
  lastTs?: number
}

export default function Navbar({ mode, title, source, status, lastTs }: Props) {
  const links = mode === 'station' ? STATION_LINKS : MAP_LINKS
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {mode === 'station' && (
            <button onClick={() => go('')} aria-label="Voltar ao mapa" className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-card-hover hover:text-ink">
              <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Rede</span>
            </button>
          )}
          <span className="flex min-w-0 items-center gap-2 font-display text-lg font-bold tracking-tight">
            <Activity className="h-5 w-5 shrink-0 text-cyan" aria-hidden />
            <span className="truncate">{title}</span>
          </span>
        </div>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map(([id, label]) => (
            <li key={id}>
              <button onClick={() => scrollToId(id)} className="rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-card-hover hover:text-ink">{label}</button>
            </li>
          ))}
        </ul>
        {status && (
          <span className="num flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-2">
            <i className={`inline-block h-2 w-2 rounded-full ${status.color}`} />
            <Radio className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
            {status.text}{lastTs ? ` · ${ago(lastTs)}` : ''}{source === 'demo' && mode === 'station' ? '' : ''}
          </span>
        )}
      </nav>
    </header>
  )
}
