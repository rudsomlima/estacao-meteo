import { Check, Copy, KeyRound, RefreshCw, Save, TriangleAlert } from 'lucide-react'
import PairingCode from './PairingCode'
import { useState } from 'react'
import type { SaveResult } from '../hooks/useNetwork'
import { useToken } from '../hooks/useToken'
import { CHEMS, CHEM_KEYS } from '../lib/battery'
import type { BatteryChem, Source, Station, StationConfig } from '../types'

interface Field { key: keyof StationConfig; label: string; hint: string; min: number; max: number; step: number; unit: string; digits?: number }

const FIELDS: Field[] = [
  { key: 'interval_min', label: 'Intervalo entre envios', hint: 'Mais espaçado economiza bateria.', min: 1, max: 60, step: 1, unit: 'min' },
  { key: 'wind_window_s', label: 'Janela de medição do vento', hint: 'Tempo contando voltas do rotor em cada ciclo. Vale só no modo janela (sem contagem contínua).', min: 2, max: 30, step: 1, unit: 's' },
  { key: 'send_every', label: 'Enviar a cada', hint: 'Junta várias leituras e envia de uma vez. O Wi-Fi é o maior gasto de energia, então quanto maior, mais economia.', min: 1, max: 12, step: 1, unit: 'leituras' },
  { key: 'urgent_gust_kmh', label: 'Enviar na hora se a rajada passar de', hint: 'Avisa sem esperar o lote. Zero desliga.', min: 0, max: 120, step: 5, unit: 'km/h' },
  { key: 'gust_window_s', label: 'Janela da rajada', hint: 'Rajada é o maior trecho desse tamanho dentro da janela.', min: 1, max: 10, step: 1, unit: 's' },
  { key: 'samples', label: 'Amostras de temperatura, umidade e pressão', hint: 'A média reduz ruído.', min: 1, max: 32, step: 1, unit: '×' },
  { key: 'mm_per_tip', label: 'Chuva por basculada do tanque', hint: 'Calibre despejando um volume conhecido.', min: 0.05, max: 1, step: 0.01, unit: 'mm', digits: 2 },
  { key: 'k_wind', label: 'Fator do anemômetro', hint: 'm/s por volta/s. Calibre com um anemômetro de referência.', min: 0.1, max: 1.5, step: 0.01, unit: 'm/s', digits: 2 },
  { key: 'dir_offset', label: 'Ajuste do norte da biruta', hint: 'Graus lidos quando a biruta aponta para o norte.', min: 0, max: 359, step: 1, unit: '°' },
  { key: 'slow_below_v', label: 'Economizar abaixo de', hint: 'Abaixo dessa tensão a estação espaça os envios.', min: 1.8, max: 4.2, step: 0.01, unit: 'V', digits: 2 },
  { key: 'slow_factor', label: 'Espaçar envios por', hint: 'Multiplica o intervalo quando a bateria está baixa.', min: 1, max: 6, step: 1, unit: '×' },
  { key: 'critical_v', label: 'Hibernar abaixo de', hint: 'Abaixo dessa tensão a estação só dorme por 1 h, para proteger a bateria.', min: 1.5, max: 4, step: 0.01, unit: 'V', digits: 2 },
  { key: 'charge_above_v', label: 'Considerar "carregando" acima de', hint: 'Com o painel solar dando carga (tensão alta), a estação usa o intervalo curto abaixo. Zero desliga.', min: 0, max: 4.5, step: 0.05, unit: 'V', digits: 2 },
  { key: 'charge_interval_min', label: 'Intervalo enquanto carrega', hint: 'Sobra energia: pode medir mais vezes.', min: 1, max: 60, step: 1, unit: 'min' },
  { key: 'bench_min', label: 'Modo bancada ao ligar', hint: 'Minutos com uma página local para ver as leituras e calibrar a biruta sem cabo. Zero desliga.', min: 0, max: 30, step: 1, unit: 'min' },
]

interface Props {
  station: Station
  source: Source
  onChange: (s: Station) => void
  onSave: (s: Station, token: string) => Promise<SaveResult>
  onNewKey: (id: string, token: string) => Promise<SaveResult>
  dirty: boolean
}

const input = 'num rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'

export default function ConfigPanel({ station, source, onChange, onSave, onNewKey, dirty }: Props) {
  const [token, setToken] = useToken()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)
  const cfg = station.config

  const setCfg = (patch: Partial<StationConfig>) => onChange({ ...station, config: { ...cfg, ...patch } })
  const setMeta = (patch: Partial<Station>) => onChange({ ...station, ...patch })
  const pickChem = (c: BatteryChem) => setCfg({ battery_chem: c, slow_below_v: CHEMS[c].slow_below_v, critical_v: CHEMS[c].critical_v })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = await onSave(station, token)
    setMsg({ ok: r.ok, text: r.message })
    setBusy(false)
  }

  const rotate = async () => {
    const r = await onNewKey(station.id, token)
    setMsg({ ok: r.ok, text: r.message })
    if (r.key) { setKey(r.key); setCopied(false) }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(key); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid gap-5">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-display text-lg font-semibold">Bateria</legend>
          <label className="grid gap-1 text-sm font-medium">Tipo
            <select className={input} value={cfg.battery_chem} onChange={(e) => pickChem(e.target.value as BatteryChem)}>
              {CHEM_KEYS.map((k) => <option key={k} value={k}>{CHEMS[k].label} ({CHEMS[k].min.toFixed(1)} a {CHEMS[k].max.toFixed(1)} V)</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Capacidade (mAh)
            <input type="number" min={100} max={100000} step={100} className={input} value={cfg.battery_mah} onChange={(e) => setCfg({ battery_mah: Number(e.target.value) })} />
          </label>
          <p className="text-xs text-ink-3 sm:col-span-2">Ao trocar o tipo, os limites de economia e de hibernação abaixo recebem valores sugeridos para ele. O divisor de tensão do firmware precisa cobrir a tensão cheia da bateria escolhida.</p>
        </fieldset>

        <label className="flex items-start gap-3 rounded-xl border border-line bg-bg p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={cfg.continuous_wind === 1}
            onChange={(e) => setCfg({ continuous_wind: e.target.checked ? 1 : 0 })}
          />
          <span>
            <b className="font-medium">Contar o vento o tempo todo</b>
            <span className="mt-0.5 block text-xs text-ink-3">
              A estação fica em light sleep contando cada pulso e entrega média, rajada e direção do período inteiro, como os equipamentos profissionais. Gasta mais que o modo janela e exige um Hall de baixa corrente (por exemplo DRV5032). Não ligue com o A3144.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-line bg-bg p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={cfg.wifi_tx_save === 1}
            onChange={(e) => setCfg({ wifi_tx_save: e.target.checked ? 1 : 0 })}
          />
          <span>
            <b className="font-medium">Reduzir a potência do Wi-Fi automaticamente</b>
            <span className="mt-0.5 block text-xs text-ink-3">
              Com o sinal bom, a estação transmite com menos potência e gasta menos a cada envio (o Wi-Fi é o maior consumo). Ela decide pelo sinal do último envio: quanto mais forte, menor a potência. Se não conseguir conectar, volta à potência máxima e só tenta reduzir de novo depois de alguns envios. Com sinal fraco não muda nada.
            </span>
          </span>
        </label>

        {FIELDS.map((f) => {
          const id = `cfg-${f.key}`
          const v = cfg[f.key] as number
          return (
            <div key={f.key} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="text-sm font-medium">{f.label}</label>
                <output htmlFor={id} className="num text-sm text-cyan">{v.toFixed(f.digits ?? 0)} {f.unit}</output>
              </div>
              <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => setCfg({ [f.key]: Number(e.target.value) })} className="w-full" />
              <p className="text-xs text-ink-3">{f.hint}</p>
            </div>
          )
        })}

        <div className="grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
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

        {source === 'api' && (
          <label className="grid gap-1 text-sm font-medium">
            <span className="flex items-center gap-1.5"><KeyRound className="h-4 w-4" aria-hidden /> Token de administrador</span>
            <input type="password" autoComplete="current-password" className={input} value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !dirty} className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40">
            <Save className="h-4 w-4" aria-hidden /> {busy ? 'Salvando…' : 'Salvar configuração'}
          </button>
          {source === 'api' && (
            <button type="button" onClick={rotate} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-card-hover">
              <RefreshCw className="h-4 w-4" aria-hidden /> Gerar chave nova
            </button>
          )}
          {msg && (
            <p role="status" className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>
              {msg.ok ? <Check className="h-4 w-4" aria-hidden /> : <TriangleAlert className="h-4 w-4" aria-hidden />} {msg.text}
            </p>
          )}
        </div>

        {source === 'api' && <PairingCode id={station.id} name={station.name} token={token} />}

        {key && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg p-3">
            <code className="num min-w-0 flex-1 break-all text-sm text-cyan">{key}</code>
            <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">
              {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
