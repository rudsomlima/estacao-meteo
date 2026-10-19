import { Star, Usb } from 'lucide-react'
import { go } from '../hooks/useRoute'
import { DEFAULT_PREFS, MAP_LAYERS, makeMain, setPrefs, toggleFavorite, usePrefs, type Prefs } from '../lib/prefs'
import type { Source, Station } from '../types'
import DataPanel from './DataPanel'
import Panel from './Panel'
import FlashPanel from './FlashPanel'
import TelegramPanel from './TelegramPanel'
import { requestUsb } from './UsbDevice'
import { usbSupported } from '../lib/usb'
import { useLiveState } from '../lib/refresh'
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
  const live = useLiveState()
  const { user, clientId } = useSession()
  const isAdmin = !clientId || user?.role === 'admin' // sem login no servidor vale o token; com login, só administradores
  const favs = p.favorites.map((id) => stations.find((s) => s.id === id)).filter((s): s is Station => !!s)
  const others = stations.filter((s) => !p.favorites.includes(s.id))

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-24 sm:px-6">
      <p className="num text-xs text-ink-3">Vale para o site inteiro</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Ajustes</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Unidades, estações favoritas, alertas no Telegram e seus dados. A configuração de cada estação fica na página dela.</p>

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

        <div id="atualizacao" className="scroll-mt-20" />
        <Panel id="g-atualizacao" title="Atualização dos dados" hint="como o site fica sabendo que a estação enviou">
          <div className="grid gap-5 sm:grid-cols-2">
            <Choice label="Como atualizar" name="updates" value={p.updates} options={[['live', 'Tempo real (WebSocket)'], ['poll', 'Consulta periódica']]} />
            <label className="grid content-start gap-1.5 text-sm text-ink-2">
              {p.updates === 'live' ? 'Consulta de segurança (segundos, 0 desliga)' : 'Consultar a cada (segundos, mínimo 5)'}
              <input
                type="number" min={0} max={3600} step={5} value={p.pollS} aria-label="Segundos entre consultas"
                onChange={(e) => setPrefs({ pollS: Number(e.target.value) })}
                className="num w-32 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>
          <p className="mt-3 text-sm" role="status">
            {source !== 'api' ? <span className="text-ink-3">Sem servidor (demonstração): não há o que atualizar.</span>
              : live === 'live' ? <span className="text-ok">Conectado em tempo real: o servidor avisa na hora em que a estação envia.</span>
              : live === 'connecting' ? <span className="text-warn">Conectando ao servidor em tempo real…</span>
              : live === 'poll' ? <span className="text-ink-2">Consultando o servidor a cada {Math.max(5, p.pollS || 15)} s.</span>
              : <span className="text-ink-3">Inativo nesta tela.</span>}
          </p>
          <ul className="mt-3 grid gap-1.5 text-xs text-ink-3">
            <li><b className="text-ink-2">Tempo real:</b> o site mantém uma conexão aberta e só busca dados quando o servidor avisa. Gasta poucas requisições.</li>
            <li><b className="text-ink-2">Consulta de segurança:</b> uma consulta comum de tempos em tempos, caso a conexão caia sem o navegador perceber. Em 60 s custa cerca de 1.400 requisições por dia por aba aberta.</li>
            <li><b className="text-ink-2">Consulta periódica:</b> sem WebSocket. Cada consulta do intervalo gasta requisições do plano gratuito da Cloudflare (100 mil por dia).</li>
            <li>Com a aba escondida o site não consulta e atualiza na hora quando você volta.</li>
          </ul>
          <button onClick={() => setPrefs({ updates: DEFAULT_PREFS.updates, pollS: DEFAULT_PREFS.pollS })} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Voltar ao padrão</button>
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

        <div id="placa" className="scroll-mt-20" />
        <Panel id="g-placa" title="Placa USB" hint="reconhece o ESP32 ao plugar e o configura">
          {usbSupported() ? (
            <>
              <p className="text-sm text-ink-2">Depois de autorizar a placa uma vez, o site a reconhece sozinho sempre que você plugar o cabo e oferece configurar o Wi-Fi, o endereço e a chave, sem usar o portal.</p>
              <button onClick={requestUsb} className="mt-3 flex items-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white"><Usb className="h-4 w-4" aria-hidden /> Autorizar uma placa</button>
              <p className="mt-3 text-xs text-ink-3">Precisa do firmware da estação (grave em <b>Gravar firmware</b>, abaixo) e de um cabo de dados. Com o cabo no computador a placa fica acordada, e o site solta a porta quando você troca de janela (para o PlatformIO poder usá-la).</p>
            </>
          ) : (
            <p className="text-sm text-ink-2">Este navegador não tem Web Serial. Use o Chrome, o Edge ou o Opera, em endereço https:// ou localhost.</p>
          )}
        </Panel>

        <div id="gravar" className="scroll-mt-20" />
        <Panel id="g-gravar" title="Gravar firmware" hint="numa placa nova, pelo navegador" defaultOpen={false}>
          <FlashPanel />
        </Panel>

        {isAdmin ? (
          <>
        <div id="telegram" className="scroll-mt-20" />
        <Panel id="g-telegram" title="Alertas no Telegram" hint="offline, bateria, rajada e chuva" defaultOpen={false}>
          <TelegramPanel stations={stations} source={source} />
        </Panel>

        <div id="dados" className="scroll-mt-20" />
        <Panel id="g-dados" title="Dados e armazenamento" hint="exportar, backup e uso do banco" defaultOpen={false}>
          <DataPanel stations={stations} source={source} />
        </Panel>
          </>
        ) : (
          <p className="rounded-xl border border-line px-4 py-3 text-sm text-ink-3">Alertas no Telegram e dados do banco são só do administrador.</p>
        )}
      </div>
    </div>
  )
}
