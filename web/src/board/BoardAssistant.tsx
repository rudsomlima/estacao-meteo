import { CircleCheck, Usb, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { go } from '../hooks/useRoute'
import { hasBattery } from '../lib/battery'
import { canEditStation, useIsAdmin, useSession } from '../lib/session'
import { describePort, usbSupported } from '../lib/usb'
import type { Source, Station } from '../types'
import { PICK_EVENT } from './events'
import KnownBoard from './KnownBoard'
import { loadManifest } from './manifest'
import NewBoard from './NewBoard'
import { useBoardSession, type BoardState } from './useBoardSession'

/**
 * Assistente da placa. Aparece sozinho quando uma placa ESP32 é plugada (ou pelo botão "Autorizar uma placa").
 * Lê a placa e escolhe o caminho:
 *   sem firmware        → gravar o firmware
 *   nova / sem vínculo  → NewBoard: estação, sensores, Wi-Fi
 *   já cadastrada       → KnownBoard: atualizar firmware, Wi-Fi e servidor, sensores e pinos
 * Depois de configurar, espera a primeira leitura chegar ao servidor.
 * Placas USB são só do administrador: para os outros o assistente nem existe (e a porta nunca é aberta).
 */
export default function BoardAssistant(props: { stations: Station[]; source: Source; onChanged: () => unknown }) {
  const admin = useIsAdmin()
  return admin && usbSupported() ? <Assistant {...props} /> : null
}

function Assistant({ stations, source, onChanged }: { stations: Station[]; source: Source; onChanged: () => unknown }) {
  const b = useBoardSession(onChanged)
  const { state } = b
  if (!state || b.hidden) return null

  return (
    <aside role="dialog" aria-label="Placa USB detectada" hidden={b.picking} className="glass fixed bottom-3 right-3 z-[70] max-h-[92svh] w-[min(400px,calc(100vw-24px))] overflow-y-auto rounded-2xl p-4">
      <button onClick={b.close} aria-label="Fechar" className="absolute right-3 top-3 rounded-lg p-1 text-ink-2 hover:bg-card-hover hover:text-ink"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-2 pr-8 font-display text-lg font-bold tracking-tight">
        <Usb className="h-5 w-5 text-cyan" aria-hidden />
        {state.s === 'online' ? 'Estação no ar' : state.s === 'waiting' ? 'Quase pronto' : 'Placa USB detectada'}
      </div>

      {state.s === 'probing' && <p className="mt-2 text-sm text-ink-2">{describePort(state.port)}. Procurando o firmware da estação…</p>}

      {state.s === 'flashing' && (
        <div className="mt-2 grid gap-2 text-sm text-ink-2">
          {state.waitBoard
            ? <p>Aperte RESET na placa (ou replugue o cabo): a gravação recomeça sozinha.</p>
            : <p>Gravando o firmware… <span className="num">{state.pct}%</span>. Não desligue a placa.</p>}
          <div className="h-2 overflow-hidden rounded-full bg-line"><i className="block h-full bg-cyan" style={{ width: `${state.pct}%` }} /></div>
        </div>
      )}

      {state.s === 'silent' && <Silent state={state} onFlash={() => void b.flashNow(state.port)} onRetry={() => void b.probe(state.port, true)} />}

      {state.s === 'ready' && (
        <Ready
          key={state.info.mac} state={state} stations={stations} source={source} onChanged={onChanged}
          onLost={() => b.lost(state.port, state.link)}
          onFlash={() => { void state.link.close(); void b.flashNow(state.port, 'app') }}
          onPickMap={() => { b.setPicking(true); go(''); window.setTimeout(() => window.dispatchEvent(new Event(PICK_EVENT)), 400) }}
          onDone={(id, name) => b.finish(state.link, id, name)}
        />
      )}

      {state.s === 'waiting' && (
        <div className="mt-2 grid gap-2 text-sm text-ink-2">
          <p>Configurada como <b className="text-ink">{state.name}</b>. A placa está reiniciando, conectando ao Wi-Fi e enviando a primeira leitura…</p>
          <p className="text-xs text-ink-3">Leva de 10 a 60 segundos. Se passar de 2 minutos, confira a senha do Wi-Fi e se a rede é de 2,4 GHz.</p>
        </div>
      )}

      {state.s === 'online' && (
        <div className="mt-2 grid gap-3 text-sm">
          <p className="flex items-start gap-2 text-ok"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Recebi a primeira leitura de {state.name}. Está funcionando.</p>
          <button onClick={() => { go(`s/${state.id}`); b.close() }} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white">Abrir a estação</button>
        </div>
      )}
    </aside>
  )
}

function Silent({ state, onFlash, onRetry }: { state: Extract<BoardState, { s: 'silent' }>; onFlash: () => void; onRetry: () => void }) {
  const { port, why, detail } = state
  const [has, setHas] = useState(false)
  useEffect(() => { void loadManifest().then((m) => setHas(m.length > 0)) }, [])
  if (why === 'busy') {
    return (
      <div className="mt-2 grid gap-3 text-sm text-ink-2">
        <p>{describePort(port)} conectada, mas a porta está em uso por outro programa.</p>
        <p className="text-xs text-ink-3">Feche o monitor serial do PlatformIO, a Arduino IDE ou outra aba deste site e tente de novo.</p>
        <button onClick={onRetry} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Tentar de novo</button>
      </div>
    )
  }
  return (
    <div className="mt-2 grid gap-3 text-sm text-ink-2">
      {why === 'flash' ? <p role="alert" className="text-bad">{detail}</p> : <p>{describePort(port)} conectada, mas o firmware da estação não respondeu.</p>}
      {has && <button onClick={onFlash} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white">Gravar o firmware agora</button>}
      <details className="text-xs text-ink-3">
        <summary className="cursor-pointer">Já gravei e não reconheceu</summary>
        <ul className="mt-2 list-disc pl-5">
          <li>A placa só escuta nos primeiros segundos depois de ligar: aperte RESET ou replugue o cabo.</li>
          <li>Se ela foi gravada por outro programa, regrave com o botão acima.</li>
          <li>Feche o monitor serial ou a IDE, que podem estar usando a porta.</li>
        </ul>
      </details>
      <button onClick={onRetry} className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Procurar de novo</button>
    </div>
  )
}

/** A placa respondeu: mostra quem ela é e segue para o caminho da placa nova ou da já cadastrada. */
function Ready({ state, stations, source, onPickMap, onLost, onFlash, onDone, onChanged }: {
  state: Extract<BoardState, { s: 'ready' }>; stations: Station[]; source: Source
  onPickMap: () => void; onLost: () => void; onFlash: () => void; onDone: (id: string, name: string) => void; onChanged: () => unknown
}) {
  const { info, link } = state
  const session = useSession()
  const known = stations.find((s) => s.id === info.id && canEditStation(s, source, session))
  const lost = useRef(onLost)
  useEffect(() => { lost.current = onLost })
  const stableLost = useCallback(() => lost.current(), []) // estável: os formulários o usam num efeito

  return (
    <div className="mt-2 grid gap-3 text-sm">
      <p className="text-ink-2">
        {info.chip} · firmware <span className="num">{info.fw}</span> · {hasBattery(info.vbat) ? `${info.vbat.toFixed(2)} V` : 'sem bateria'}
      </p>
      {known ? (
        <KnownBoard link={link} info={info} station={known} source={source} onFlash={onFlash} onLost={stableLost} onDone={onDone} onChanged={onChanged} />
      ) : (
        <>
          <p className="text-ink-2">
            {info.id ? `Configurada como "${info.id}", que não existe neste site.` : info.provisioned ? 'Já tem rede e chave salvas.' : 'Placa nova, ainda sem configuração.'}
          </p>
          <NewBoard link={link} info={info} stations={stations} source={source} onPickMap={onPickMap} onLost={stableLost} onCreated={onChanged} onDone={onDone} />
        </>
      )}
    </div>
  )
}
