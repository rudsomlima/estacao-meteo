import { Check, Copy, KeyRound, RefreshCw, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import PairingCode from './PairingCode'
import { useState, type ReactNode } from 'react'
import type { SaveResult } from '../hooks/useNetwork'
import { SESSION_TOKEN, useToken } from '../hooks/useToken'
import { useCanEdit, useIsAdmin, useSession } from '../lib/session'
import { CHEMS, CHEM_KEYS } from '../lib/battery'
import { ENV_SENSORS, PIN_DEFAULTS, PINS, pinProblem, pinValue, USABLE_PINS, type PinKey } from '../lib/pins'
import type { BatteryChem, Source, Station, StationConfig } from '../types'

export interface Field { key: keyof StationConfig; label: string; hint: string; min: number; max: number; step: number; unit: string; digits?: number }

const F = (key: keyof StationConfig, label: string, hint: string, min: number, max: number, step: number, unit: string, digits?: number): Field => ({ key, label, hint, min, max, step, unit, digits })

/** Os controles de cada parte da configuração. Os limites são os mesmos do servidor (worker/src/shared.ts). */
export const GROUPS = {
  medicao: [
    F('interval_min', 'Intervalo entre leituras', 'A cada quanto tempo a estação acorda e mede. Mais espaçado economiza bateria.', 1, 60, 1, 'min'),
    F('wind_window_s', 'Janela de medição do vento', 'Tempo contando voltas do rotor em cada leitura. Vale só no modo janela (sem contagem contínua).', 2, 30, 1, 's'),
    F('gust_window_s', 'Janela da rajada', 'Rajada é o maior trecho desse tamanho dentro da janela.', 1, 10, 1, 's'),
    F('samples', 'Amostras de temperatura, umidade e pressão', 'A média reduz ruído.', 1, 32, 1, '×'),
  ],
  envio: [
    F('send_every', 'Enviar a cada', 'Junta várias leituras e envia de uma vez. O Wi-Fi é o maior gasto de energia, então quanto maior, mais economia.', 1, 12, 1, 'leituras'),
    F('urgent_gust_kmh', 'Enviar na hora se a rajada passar de', 'Avisa sem esperar o lote. Zero desliga.', 0, 200, 5, 'km/h'),
    F('idle_every', 'Sem leitura de sensor, dar sinal de vida a cada', 'Para estação sem sensor (ou com o sensor falhando): em vez de ligar o Wi-Fi a cada leitura só para dizer que está viva, espera N leituras. Economiza bateria; o site considera atrasada depois de 2,5 vezes esse tempo.', 1, 12, 1, 'leituras'),
    F('wifi_timeout_s', 'Tempo para conectar ao Wi-Fi', 'Quanto a estação insiste antes de desistir e guardar as leituras para o próximo envio. Pouco demais falha em redes lentas; muito gasta bateria quando a rede some.', 4, 30, 1, 's'),
  ],
  bateria: [
    F('slow_below_v', 'Economizar abaixo de', 'Abaixo dessa tensão a estação espaça as leituras. 0 desativa (estação sem bateria).', 0, 4.2, 0.01, 'V', 2),
    F('slow_factor', 'Espaçar as leituras por', 'Multiplica o intervalo quando a bateria está baixa.', 1, 12, 1, '×'),
    F('critical_v', 'Hibernar abaixo de', 'Abaixo dessa tensão a estação só dorme por 1 h, para proteger a bateria. 0 desativa (estação sem bateria: o pino solto lê tensão aleatória).', 0, 4, 0.01, 'V', 2),
    F('charge_above_v', 'Considerar "carregando" acima de', 'Com o painel solar dando carga (tensão alta), a estação usa o intervalo curto abaixo. Zero desliga.', 0, 5, 0.05, 'V', 2),
    F('charge_interval_min', 'Intervalo enquanto carrega', 'Sobra energia: pode medir mais vezes.', 1, 60, 1, 'min'),
  ],
  calibracao: [
    F('mm_per_tip', 'Chuva por basculada do tanque', 'Calibre despejando um volume conhecido.', 0.01, 2, 0.01, 'mm', 2),
    F('k_wind', 'Fator do anemômetro', 'm/s por volta/s. Calibre com um anemômetro de referência.', 0.05, 3, 0.01, 'm/s', 2),
    F('dir_offset', 'Ajuste do norte da biruta', 'Graus lidos quando a biruta aponta para o norte (o modo bancada mostra o valor).', 0, 359, 1, '°'),
  ],
  bancada: [
    F('bench_min', 'Modo bancada ao ligar', 'Minutos com uma página local para ver as leituras e calibrar a biruta sem cabo. Zero desliga.', 0, 30, 1, 'min'),
  ],
} satisfies Record<string, Field[]>

/** Todos os campos numéricos, em uma lista (usada também pelos testes e pela configuração em massa). */
export const FIELDS: Field[] = Object.values(GROUPS).flat()

export type Section = 'sensores' | 'envio' | 'instalacao'

const input = 'num w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'

function Sliders({ fields, cfg, set }: { fields: Field[]; cfg: StationConfig; set: (p: Partial<StationConfig>) => void }) {
  return (
    <>
      {fields.map((f) => {
        const id = `cfg-${f.key}`
        const v = (cfg[f.key] as number) ?? f.min // estação antiga sem este campo: usa o mínimo até salvar
        return (
          <div key={f.key} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={id} className="text-sm font-medium">{f.label}</label>
              <output htmlFor={id} className="num shrink-0 text-sm text-cyan">{v.toFixed(f.digits ?? 0)} {f.unit}</output>
            </div>
            <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => set({ [f.key]: Number(e.target.value) })} className="w-full" />
            <p className="text-xs text-ink-3">{f.hint}</p>
          </div>
        )
      })}
    </>
  )
}

function Group({ id, title, children, hint }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset id={id} className="grid min-w-0 scroll-mt-32 gap-4">
      <legend className="mb-1 font-display text-lg font-semibold">{title}</legend>
      {hint && <p className="-mt-2 text-xs text-ink-3">{hint}</p>}
      {children}
    </fieldset>
  )
}

function Toggle({ checked, onChange, title, children }: { checked: boolean; onChange: (v: boolean) => void; title: string; children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line bg-bg p-3 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><b className="font-medium">{title}</b><span className="mt-0.5 block text-xs text-ink-3">{children}</span></span>
    </label>
  )
}

/** Uma parte da configuração da estação (as abas da página de configurações). A edição vai para o rascunho; salvar é na barra de baixo. */
export function ConfigSection({ section, station, source, onChange }: { section: Section; station: Station; source: Source; onChange: (s: Station) => void }) {
  const editable = useCanEdit(station, source)
  const { user } = useSession()
  const cfg = station.config
  const set = (patch: Partial<StationConfig>) => onChange({ ...station, config: { ...cfg, ...patch } })
  const setMeta = (patch: Partial<Station>) => onChange({ ...station, ...patch })
  const pickChem = (c: BatteryChem) => set({ battery_chem: c, slow_below_v: CHEMS[c].slow_below_v, critical_v: CHEMS[c].critical_v })
  const pinErr = pinProblem(cfg)
  const sensor = ENV_SENSORS.find((x) => x.id === (cfg.env_sensor ?? 1)) ?? ENV_SENSORS[1]

  return (
    <>
      {!editable && (
        <p role="status" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Somente leitura. {user ? 'Esta estação é de outra conta: só o dono e os administradores alteram a configuração.' : 'Entre com o Google (canto superior direito) para alterar as suas estações.'}
        </p>
      )}
      <fieldset disabled={!editable} className="grid min-w-0 gap-8 disabled:opacity-60">
        {section === 'sensores' && (
          <>
            <Group id="cfg-placa" title="Placa, sensores e pinos">
              <div className="rounded-xl border border-line bg-bg p-3 text-sm">
                <div className="text-xs text-ink-3">Placa</div>
                <b className="font-medium">ESP32-C3 (SuperMini ou módulo nu)</b>
                <span className="ml-2 text-xs text-ink-3">firmware {station.fw_version ?? '—'} · é a placa que este firmware suporta; o modelo muda só a fiação, que se define pelos pinos abaixo.</span>
              </div>
              <label className="grid gap-1 text-sm font-medium">Sensor de ambiente
                <select className={input} value={cfg.env_sensor ?? 1} onChange={(e) => set({ env_sensor: Number(e.target.value) })}>
                  {ENV_SENSORS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <span className="text-xs font-normal text-ink-3">{sensor.hint}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle checked={(cfg.has_wind ?? 1) === 1} onChange={(v) => set({ has_wind: v ? 1 : 0 })} title="Tem anemômetro">
                  Desligue se não há biruta/rotor instalados: vento, rajada e direção somem da página (em vez de mostrar ruído do pino solto).
                </Toggle>
                <Toggle checked={(cfg.has_rain ?? 1) === 1} onChange={(v) => set({ has_rain: v ? 1 : 0 })} title="Tem pluviômetro">
                  Desligue se não há tanque basculante instalado: chuva some da página.
                </Toggle>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PINS.map((p) => {
                  const v = pinValue(cfg, p.key)
                  const taken = new Set(PINS.filter((o) => o.key !== p.key).map((o) => pinValue(cfg, o.key)))
                  const limit = p.key === 'pin_rain' ? 5 : p.key === 'pin_vbat' ? 4 : 99
                  return (
                    <label key={p.key} className="grid gap-1 text-sm font-medium">{p.label}
                      <select className={input} value={v} onChange={(e) => set({ [p.key]: Number(e.target.value) } as Partial<StationConfig>)}>
                        {USABLE_PINS.filter((n) => n <= limit || n === v).map((n) => (
                          <option key={n} value={n} disabled={taken.has(n)}>GPIO{n}{n === PIN_DEFAULTS[p.key as PinKey] ? ' (padrão)' : ''}{taken.has(n) ? ' · em uso' : ''}</option>
                        ))}
                      </select>
                      <span className="text-xs font-normal text-ink-3">{p.hint}</span>
                    </label>
                  )
                })}
              </div>
              <div>
                {pinErr && <p role="alert" className="mb-2 flex items-center gap-1.5 text-sm text-bad"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {pinErr}</p>}
                <button type="button" onClick={() => set({ ...PIN_DEFAULTS })} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Voltar aos pinos padrão</button>
                <p className="mt-2 text-xs text-ink-3">Mudar um pino reinicia a placa quando ela recebe a configuração, e a fiação precisa estar igual ao que está aqui. Ficam de fora os pinos de boot (8 e 9), da USB (18 e 19) e da memória flash (11 a 17).</p>
              </div>
            </Group>
            <Group id="cfg-calibracao" title="Calibração" hint="Ajustes finos dos sensores, depois de montada a estação.">
              <Sliders fields={GROUPS.calibracao} cfg={cfg} set={set} />
            </Group>
          </>
        )}

        {section === 'envio' && (
          <>
            <Group id="cfg-medicao" title="Medição">
              <Sliders fields={GROUPS.medicao} cfg={cfg} set={set} />
              <Toggle checked={cfg.continuous_wind === 1} onChange={(v) => set({ continuous_wind: v ? 1 : 0 })} title="Contar o vento o tempo todo">
                A estação fica em light sleep contando cada pulso e entrega média, rajada e direção do período inteiro, como os equipamentos profissionais. Gasta mais que o modo janela e exige um Hall de baixa corrente (por exemplo DRV5032). Não ligue com o A3144. Mudar isto reinicia a placa.
              </Toggle>
            </Group>
            <Group id="cfg-envio" title="Envio">
              <Sliders fields={GROUPS.envio} cfg={cfg} set={set} />
              <Toggle checked={cfg.wifi_tx_save === 1} onChange={(v) => set({ wifi_tx_save: v ? 1 : 0 })} title="Reduzir a potência do Wi-Fi automaticamente">
                Com o sinal bom, a estação transmite com menos potência e gasta menos a cada envio. Ela decide pelo sinal do último envio: quanto mais forte, menor a potência. Se não conseguir conectar, volta à potência máxima e só tenta reduzir de novo depois de alguns envios.
              </Toggle>
            </Group>
            <Group id="cfg-bateria" title="Bateria e economia">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">Tipo
                  <select className={input} value={cfg.battery_chem} onChange={(e) => pickChem(e.target.value as BatteryChem)}>
                    {CHEM_KEYS.map((k) => <option key={k} value={k}>{CHEMS[k].label} ({CHEMS[k].min.toFixed(1)} a {CHEMS[k].max.toFixed(1)} V)</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">Capacidade (mAh)
                  <input type="number" min={100} max={100000} step={100} className={input} value={cfg.battery_mah} onChange={(e) => set({ battery_mah: Number(e.target.value) })} />
                </label>
              </div>
              <p className="-mt-2 text-xs text-ink-3">Ao trocar o tipo, os limites de economia e de hibernação recebem valores sugeridos para ele. O divisor de tensão da placa precisa cobrir a tensão cheia da bateria escolhida.</p>
              <Sliders fields={GROUPS.bateria} cfg={cfg} set={set} />
            </Group>
          </>
        )}

        {section === 'instalacao' && (
          <>
            <Group id="cfg-local" title="Nome e local">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium sm:col-span-2">Nome da estação
                  <input className={input} value={station.name} maxLength={40} onChange={(e) => setMeta({ name: e.target.value })} />
                </label>
                <label className="grid gap-1 text-sm font-medium">Cidade
                  <input className={input} value={station.city} maxLength={60} onChange={(e) => setMeta({ city: e.target.value })} />
                </label>
                {(['lat', 'lon', 'alt'] as const).map((k) => (
                  <label key={k} className="grid gap-1 text-sm font-medium">{k === 'lat' ? 'Latitude' : k === 'lon' ? 'Longitude' : 'Altitude (m)'}
                    <input type="number" step="any" className={input} value={station[k]} onChange={(e) => setMeta({ [k]: Number(e.target.value) })} />
                  </label>
                ))}
              </div>
            </Group>
            <Group id="cfg-bancada" title="Modo bancada">
              <Sliders fields={GROUPS.bancada} cfg={cfg} set={set} />
            </Group>
          </>
        )}
      </fieldset>
    </>
  )
}

/** Chave do dispositivo e código de pareamento (só administrador). */
export function KeyTools({ station, source, onNewKey }: { station: Station; source: Source; onNewKey: (id: string, token: string) => Promise<SaveResult> }) {
  const [token] = useToken()
  const editable = useCanEdit(station, source)
  const admin = useIsAdmin()
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (source !== 'api' || !editable || !admin) return null
  const rotate = async () => {
    const r = await onNewKey(station.id, token)
    setMsg({ ok: r.ok, text: r.message })
    if (r.key) { setKey(r.key); setCopied(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(key); setCopied(true) } catch { setCopied(false) } }
  return (
    <div className="grid gap-3">
      <PairingCode id={station.id} name={station.name} token={token} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={rotate} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-card-hover">
          <RefreshCw className="h-4 w-4" aria-hidden /> Gerar chave nova
        </button>
        <span className="text-xs text-ink-3">A chave antiga deixa de valer na hora: grave a nova na placa (pela USB ou no portal).</span>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
      {key && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-bg p-3">
          <code className="num min-w-0 flex-1 break-all text-sm text-cyan">{key}</code>
          <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">
            {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Barra fixa no rodapé: aparece quando há alterações não salvas (em qualquer aba) e depois de salvar, com o resultado.
 * Assim não é preciso rolar até o fim de um formulário comprido.
 */
export function SaveBar({ draft, source, dirty, onSave, onDiscard }: { draft: Station; source: Source; dirty: boolean; onSave: (s: Station, token: string) => Promise<SaveResult>; onDiscard: () => void }) {
  const [token, setToken] = useToken()
  const editable = useCanEdit(draft, source)
  const { clientId } = useSession()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const pinErr = pinProblem(draft.config)
  if (!editable || (!dirty && !msg && !busy)) return null
  const save = async () => {
    setBusy(true)
    const r = await onSave(draft, token)
    setMsg({ ok: r.ok, text: r.message })
    setBusy(false)
  }
  const legacyToken = source === 'api' && token !== SESSION_TOKEN && !clientId
  return (
    <div role="region" aria-label="Salvar a configuração" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        {dirty ? (
          <span className="text-sm text-warn">Alterações não salvas{pinErr ? ':' : ''}</span>
        ) : msg && (
          <p role="status" className={`flex min-w-0 flex-1 items-center gap-1.5 text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>
            {msg.ok ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />} {msg.text}
          </p>
        )}
        {dirty && pinErr && <span className="flex items-center gap-1.5 text-sm text-bad"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {pinErr}</span>}
        {legacyToken && dirty && (
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <KeyRound className="h-4 w-4" aria-hidden /> Token
            <input type="password" autoComplete="current-password" className={`${input} !w-40`} value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
        )}
        <div className="ml-auto flex gap-2">
          {dirty && (
            <button type="button" onClick={() => { onDiscard(); setMsg(null) }} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm hover:bg-card-hover">
              <RotateCcw className="h-4 w-4" aria-hidden /> Descartar
            </button>
          )}
          {dirty ? (
            <button type="button" onClick={save} disabled={busy || !!pinErr} className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40">
              <Save className="h-4 w-4" aria-hidden /> {busy ? 'Salvando…' : 'Salvar configuração'}
            </button>
          ) : (
            <button type="button" onClick={() => setMsg(null)} className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-card-hover">Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
