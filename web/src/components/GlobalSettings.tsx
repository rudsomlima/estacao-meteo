import { Star } from 'lucide-react'
import { go } from '../hooks/useRoute'
import { DEFAULT_PREFS, MAP_LAYERS, makeMain, setPrefs, toggleFavorite, usePrefs, type Prefs } from '../lib/prefs'
import type { Source, Station } from '../types'
import Panel from './Panel'
import TelegramPanel from './TelegramPanel'
import { useSession } from '../lib/session'

function Choice<K extends keyof Prefs>({ label, name, options, value }: { label: string; name: K; options: [Prefs[K], string][]; value: Prefs[K] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={String(v)} role="radio" aria-checked={value === v} onClick={() => setPrefs({ [name]: v } as Partial<Prefs>)}
            className={`num rounded-lg border px-3 py-1.5 text-sm transition-colors ${value === v ? 'border-cyan bg-cyan text-[#03212d]' : 'border-line text-ink-2 hover:border-line-hover hover:text-ink'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Ajustes do site (valem para todas as estações e ficam só neste navegador), alertas e dados. */
export default function GlobalSettings({ stations, source }: { stations: Station[]; source: Source }) {
  const p = usePrefs()
  const { user, clientId } = useSession()
  const mine = stations.filter((s) => s.can_edit)
  const isAdmin = !clientId || user?.role === 'admin' // sem login no servidor vale o token; com login, só administradores
  const favs = p.favorites.map((id) => stations.find((s) => s.id === id)).filter((s): s is Station => !!s)
  const others = stations.filter((s) => !p.favorites.includes(s.id))

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-24 sm:px-6">
      <p className="num text-xs text-ink-3">Vale para o site inteiro</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Ajustes</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Unidades e mapa, estações favoritas e alertas no Telegram. Placas USB, firmware, atualização dos dados e armazenamento ficam no painel do administrador. A configuração de cada estação fica na página dela.</p>

      <div className="mt-10 grid gap-4">
        <div id="unidades" className="scroll-mt-20" />
        <Panel id="g-unidades" title="Unidades e mapa" hint="trocam na hora, em todas as telas">
          <div className="grid gap-5 sm:grid-cols-2">
            <Choice label="Vento" name="wind" value={p.wind} options={[['kmh', 'km/h'], ['ms', 'm/s'], ['kn', 'nós'], ['mph', 'mph']]} />
            <Choice label="Temperatura" name="temp" value={p.temp} options={[['c', '°C'], ['f', '°F']]} />
            <Choice label="Chuva" name="rain" value={p.rain} options={[['mm', 'mm'], ['in', 'polegadas']]} />
            <Choice label="Pressão" name="pres" value={p.pres} options={[['hpa', 'hPa'], ['inhg', 'inHg'], ['mmhg', 'mmHg']]} />
            <Choice label="Mapa de fundo" name="basemap" value={p.basemap} options={[['dark', 'Escuro'], ['streets', 'Ruas'], ['satellite', 'Satélite'], ['terrain', 'Relevo']]} />
            <div role="group" aria-label="Camadas do mapa" className="grid gap-1.5 sm:col-span-2">
              <span className="text-sm text-ink-2">Camadas ligadas ao abrir o mapa (pode ligar várias)</span>
              <div className="flex flex-wrap gap-1.5">
                {MAP_LAYERS.map(([k, text]) => {
                  const on = p.layers.includes(k)
                  return (
                    <button
                      key={k} aria-pressed={on} onClick={() => setPrefs({ layers: on ? p.layers.filter((x) => x !== k) : [...p.layers, k] })}
                      className={`num rounded-lg border px-3 py-1.5 text-sm transition-colors ${on ? 'border-cyan bg-cyan text-[#03212d]' : 'border-line text-ink-2 hover:border-line-hover hover:text-ink'}`}
                    >{text}</button>
                  )
                })}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-ink-3">Os dados são guardados sempre em m/s, °C, mm e hPa. A conversão acontece só na tela.</p>
          <button onClick={() => setPrefs(DEFAULT_PREFS)} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Voltar ao padrão</button>
        </Panel>

        <div id="favoritas" className="scroll-mt-20" />
        <Panel id="g-favoritas" title="Estações favoritas" hint="a primeira é a principal">
          {favs.length === 0 && <p className="text-sm text-ink-3">Nenhuma ainda. Use a estrela no mapa, na tabela ou abaixo.</p>}
          <ul className="grid gap-1.5">
            {favs.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <Star className="h-4 w-4 fill-warn text-warn" aria-hidden />
                <button onClick={() => go(`s/${s.id}`)} className="min-w-0 flex-1 truncate text-left hover:underline">{s.name}</button>
                {i === 0 ? <span className="num text-xs text-ok">principal</span> : <button onClick={() => makeMain(s.id)} className="num text-xs text-ink-3 hover:text-ink">tornar principal</button>}
                <button onClick={() => toggleFavorite(s.id)} className="num text-xs text-ink-3 hover:text-bad">remover</button>
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {others.map((s) => (
                <button key={s.id} onClick={() => toggleFavorite(s.id)} className="num flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-line-hover">
                  <Star className="h-3 w-3" aria-hidden /> {s.name}
                </button>
              ))}
            </div>
          )}
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.openMain} onChange={(e) => setPrefs({ openMain: e.target.checked })} disabled={!favs.length} />
            Abrir direto na estação principal
          </label>
        </Panel>

        {isAdmin ? (
          <>
        <div id="telegram" className="scroll-mt-20" />
        <Panel id="g-telegram" title="Alertas no Telegram" hint="offline, bateria, rajada e chuva" defaultOpen={false}>
          <TelegramPanel stations={stations} source={source} />
        </Panel>
          </>
        ) : user ? (
          <>
            <div id="telegram" className="scroll-mt-20" />
            <Panel id="g-telegram-me" title="Alertas no Telegram das suas estações" hint="o seu bot, o seu chat">
              {mine.length === 0
                ? <p className="text-sm text-ink-3">Você ainda não tem estações. Quando um administrador cadastrar uma em seu nome, os alertas dela são configurados aqui.</p>
                : <TelegramPanel scope="me" stations={mine} source={source} />}
            </Panel>
          </>
        ) : (
          <p className="rounded-xl border border-line px-4 py-3 text-sm text-ink-3">Entre com o Google para configurar os alertas no Telegram das suas estações.</p>
        )}
      </div>
    </div>
  )
}
