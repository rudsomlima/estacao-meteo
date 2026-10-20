import { Activity, ArrowLeft, BarChart3, Radio, Settings, SlidersHorizontal } from 'lucide-react'
import { go } from '../hooks/useRoute'
import { useNow } from '../hooks/useNow'
import { scrollToId } from '../hooks/useLenis'
import { ago } from '../lib/derive'
import AuthMenu from './AuthMenu'
import type { Source } from '../types'

const STATION_LINKS = [
  ['agora', 'Agora'],
  ['tendencias', 'Tendências'],
]
const MAP_LINKS = [
  ['mapa', 'Mapa'],
  ['rede', 'Rede'],
]
const CONFIG_LINKS = [
  ['unidades', 'Unidades'],
  ['favoritas', 'Favoritas'],
  ['telegram', 'Telegram'],
]
const ANALYSES_LINKS = [
  ['comparar', 'Comparar'],
  ['resumo', 'Resumo'],
]
const ADMIN_LINKS: string[][] = []
const SETTINGS_LINKS = [
  ['energia', 'Energia'],
  ['diagnostico', 'Diagnóstico'],
  ['config', 'Configuração'],
]

interface Props {
  mode: 'map' | 'station' | 'settings' | 'config' | 'analyses' | 'admin'
  title: string
  source: Source
  status: { color: string; text: string } | null
  lastTs?: number
  /** rota de destino do botão voltar (sem o `#/`) e o texto dele */
  back?: { to: string; label: string }
  /** link para a página de Configurações da estação, mostrado na página da estação */
  settingsTo?: string
}

export default function Navbar({ mode, title, source, status, lastTs, back, settingsTo }: Props) {
  useNow() // redesenha a cada segundo: as idades ("há 2min10s") andam sozinhas
  const links = { station: STATION_LINKS, settings: SETTINGS_LINKS, config: CONFIG_LINKS, analyses: ANALYSES_LINKS, map: MAP_LINKS, admin: ADMIN_LINKS }[mode]
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {back && (
            <button onClick={() => go(back.to)} aria-label={back.label} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-card-hover hover:text-ink">
              <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{back.label}</span>
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
          {mode === 'map' && (
            <>
              <li>
                <button onClick={() => go('analises')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-card-hover hover:text-ink">
                  <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Análises
                </button>
              </li>
              <li>
                <button onClick={() => go('config')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-card-hover hover:text-ink">
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Ajustes
                </button>
              </li>
            </>
          )}
          {settingsTo && (
            <li>
              <button onClick={() => go(settingsTo)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-card-hover hover:text-ink">
                <Settings className="h-3.5 w-3.5" aria-hidden /> Configurações
              </button>
            </li>
          )}
        </ul>
        {mode === 'map' && (
          <div className="flex shrink-0 gap-1 md:hidden">
            <button onClick={() => go('analises')} aria-label="Análises" className="rounded-lg p-2 text-ink-2 hover:bg-card-hover"><BarChart3 className="h-4 w-4" /></button>
            <button onClick={() => go('config')} aria-label="Ajustes" className="rounded-lg p-2 text-ink-2 hover:bg-card-hover"><SlidersHorizontal className="h-4 w-4" /></button>
          </div>
        )}
        {status && (
          <span className="num flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-2">
            <i className={`inline-block h-2 w-2 rounded-full ${status.color}`} />
            <Radio className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
            {status.text}{lastTs ? ` · ${ago(lastTs)}` : ''}{source === 'demo' && mode === 'station' ? '' : ''}
          </span>
        )}
        <AuthMenu />
      </nav>
    </header>
  )
}
