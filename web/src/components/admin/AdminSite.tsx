import { Usb } from 'lucide-react'
import { useState } from 'react'
import photoThumb from '../../assets/cenario-estacao.jpg'
import { putScene } from '../../lib/admin'
import { DEFAULT_PREFS, setPrefs, usePrefs } from '../../lib/prefs'
import { useLiveState } from '../../lib/refresh'
import { setSceneLocal, useScene, type Scene } from '../../lib/scene'
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

/** Atualização dos dados neste navegador, placa USB, gravação de firmware e dados: o que antes ficava nas Preferências. */
export default function AdminSite({ stations, source }: { stations: Station[]; source: Source }) {
  const p = usePrefs()
  const live = useLiveState()
  const scene = useScene()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const pick = async (v: Scene) => {
    setSaving(true); setMsg('')
    try { await putScene(v); setSceneLocal(v); setMsg('Cenário salvo.') } catch { setMsg('Não consegui salvar o cenário. Tente de novo.') }
    setSaving(false)
  }

  return (
    <div className="grid gap-4">
      <Panel id="g-cenario" title="Cenário da página da estação" hint="o fundo do topo da página pública; vale para todos os visitantes">
        <div role="radiogroup" aria-label="Cenário" className="grid gap-3 sm:grid-cols-3">
          {([['animada', 'Animada', 'Desenho com sol, nuvens, chuva e a estação em movimento. A veleta aparece vista de cima, com o norte para o alto da tela.'], ['foto', 'Foto', 'Foto da estação que escurece à noite, avermelha no amanhecer e no entardecer e fecha com chuva, neblina ou céu encoberto, conforme as leituras.'], ['diorama', 'Diorama 3D', 'Cena escura com um instrumento 3D para cada medição: termômetro, umidade, pressão, anemômetro, biruta com rosa dos ventos, pluviômetro, painel solar e datalogger.']] as const).map(([v, name, text]) => (
            <button
              key={v} role="radio" aria-checked={scene === v} disabled={saving} onClick={() => void pick(v)}
              className={`grid gap-2 rounded-xl border p-3 text-left transition-colors ${scene === v ? 'border-cyan bg-card-hover' : 'border-line hover:border-line-hover'}`}
            >
              <span className="aspect-[3/2] w-full overflow-hidden rounded-lg border border-line" style={v === 'foto' ? { background: `center / cover url(${photoThumb})` } : v === 'diorama' ? { background: 'radial-gradient(120% 90% at 50% 0, #1d4a6e, #0d2236 55%, #07121c)' } : { background: 'linear-gradient(#3b82c4, #cfeaf7 60%, #4f9a62 60%, #2a5a40)' }} aria-hidden />
              <span className="text-sm font-semibold">{name}{scene === v ? ' (em uso)' : ''}</span>
              <span className="text-xs text-ink-3">{text}</span>
            </button>
          ))}
        </div>
        {msg && <p className="mt-3 text-sm text-ink-2" role="status">{msg}</p>}
      </Panel>

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

      <Panel id="g-gravar" title="Preparar placa (USB)" hint="grava o firmware que faltar e configura Wi-Fi, endereço e chave pela USB, sem portal nem código">
        {!usbSupported() && <p className="mb-3 text-sm text-ink-2">Este navegador não tem Web Serial. Use o Chrome, o Edge ou o Opera, em endereço https:// ou localhost.</p>}
        {usbSupported() && (
          <>
            <p className="mb-3 text-xs text-ink-3">
              Duas formas de chegar ao mesmo lugar: plugue a placa com o cabo (de dados) e, se o navegador já a conhece, um aviso aparece sozinho no canto da tela para configurar ou reconfigurar. Placa nova, em branco, ou primeira vez? Use o formulário abaixo: ele grava o firmware que faltar e configura tudo num só passo. Com o cabo no computador a placa fica acordada, e o site solta a porta quando você troca de janela.
            </p>
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
              <button onClick={requestUsb} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:bg-card-hover"><Usb className="h-4 w-4" aria-hidden /> Autorizar uma placa já plugada</button>
              <span className="min-w-0 flex-1 text-xs text-ink-3">Só na primeira vez com essa placa: o navegador pede para você escolhê-la numa lista.</span>
            </div>
          </>
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
