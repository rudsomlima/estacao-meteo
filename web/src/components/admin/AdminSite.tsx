import { Usb } from 'lucide-react'
import { DEFAULT_PREFS, setPrefs, usePrefs } from '../../lib/prefs'
import { useLiveState } from '../../lib/refresh'
import { usbSupported } from '../../lib/usb'
import type { Source, Station } from '../../types'
import DataPanel from '../DataPanel'
import FlashPanel from '../FlashPanel'
import FlashSetup from '../FlashSetup'
import Panel from '../Panel'
import { requestUsb } from '../UsbDevice'

function Choice({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)}
            className={`num rounded-lg border px-3 py-1.5 text-sm transition-colors ${value === v ? 'border-cyan bg-cyan text-[#03212d]' : 'border-line text-ink-2 hover:border-line-hover hover:text-ink'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Atualização dos dados neste navegador, placa USB, gravação de firmware e dados: o que antes ficava em Ajustes. */
export default function AdminSite({ stations, source }: { stations: Station[]; source: Source }) {
  const p = usePrefs()
  const live = useLiveState()

  return (
    <div className="grid gap-4">
      <Panel id="g-atualizacao" title="Atualização dos dados" hint="como o site fica sabendo que a estação enviou (vale para este navegador)">
        <div className="grid gap-5 sm:grid-cols-2">
          <Choice label="Como atualizar" value={p.updates} options={[['live', 'Tempo real (WebSocket)'], ['poll', 'Consulta periódica']]} onPick={(v) => setPrefs({ updates: v as typeof p.updates })} />
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

      <Panel id="g-gravar" title="Placa USB: gravar firmware e deixar a placa pronta" hint="reconhece o ESP32 ao plugar, grava e configura Wi-Fi, endereço e chave pela USB">
        {!usbSupported() && <p className="mb-3 text-sm text-ink-2">Este navegador não tem Web Serial. Use o Chrome, o Edge ou o Opera, em endereço https:// ou localhost.</p>}
        {usbSupported() && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
            <button onClick={requestUsb} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:bg-card-hover"><Usb className="h-4 w-4" aria-hidden /> Autorizar uma placa</button>
            <span className="min-w-0 flex-1 text-xs text-ink-3">Autorize uma vez e o site passa a reconhecer a placa sempre que você plugar o cabo (de dados), oferecendo configurá-la sem o portal. Com o cabo no computador a placa fica acordada, e o site solta a porta quando você troca de janela.</span>
          </div>
        )}
        <FlashSetup stations={stations} />
        <details className="mt-5 rounded-xl border border-line p-3 text-sm">
          <summary className="cursor-pointer text-ink-2">Avançado: gravar só o firmware, ou um arquivo .bin</summary>
          <div className="mt-3"><FlashPanel /></div>
        </details>
      </Panel>

      <Panel id="g-dados" title="Dados e armazenamento" hint="exportar, backup e uso do banco" defaultOpen={false}>
        <DataPanel stations={stations} source={source} />
      </Panel>
    </div>
  )
}
