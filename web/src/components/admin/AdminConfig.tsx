import { useCallback, useEffect, useState } from 'react'
import { bulkConfig, getDefaults, putDefaults, type AdminStation } from '../../lib/admin'
import { CHEMS, CHEM_KEYS } from '../../lib/battery'
import { DEFAULT_CONFIG } from '../../lib/demo'
import type { BatteryChem, StationConfig } from '../../types'
import { FIELDS } from '../ConfigPanel'
import { btn, btnMain, errText, initialScope, input, Msg, scopeCount, Section, StationScope, toScope, useLoad } from './ui'

type Draft = Partial<StationConfig>

/** Um campo de configuração com a caixa "aplicar": só os campos marcados são enviados. */
function Form({ draft, on, onDraft, onOn }: { draft: StationConfig; on: Set<string>; onDraft: (d: Draft) => void; onOn: (s: Set<string>) => void }) {
  const flip = (k: string) => { const n = new Set(on); if (n.has(k)) n.delete(k); else n.add(k); onOn(n) }
  const set = (k: keyof StationConfig, v: number | string) => { onDraft({ ...draft, [k]: v }); if (!on.has(k)) flip(k) }
  const row = 'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm'
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <div className={row}>
        <input type="checkbox" aria-label="aplicar tipo de bateria" checked={on.has('battery_chem')} onChange={() => flip('battery_chem')} />
        <span>Tipo de bateria</span>
        <select className={input} value={draft.battery_chem} onChange={(e) => { set('battery_chem', e.target.value as BatteryChem) }}>
          {CHEM_KEYS.map((k) => <option key={k} value={k}>{CHEMS[k].label}</option>)}
        </select>
      </div>
      <div className={row}>
        <input type="checkbox" aria-label="aplicar capacidade" checked={on.has('battery_mah')} onChange={() => flip('battery_mah')} />
        <span>Capacidade da bateria</span>
        <span className="flex items-center gap-1"><input type="number" className={`${input} w-24`} min={100} max={100000} step={100} value={draft.battery_mah} onChange={(e) => set('battery_mah', Number(e.target.value))} /><span className="text-xs text-ink-3">mAh</span></span>
      </div>
      {([['continuous_wind', 'Contar o vento o tempo todo'], ['wifi_tx_save', 'Reduzir a potência do Wi-Fi automaticamente']] as const).map(([k, label]) => (
        <div key={k} className={row}>
          <input type="checkbox" aria-label={`aplicar ${label}`} checked={on.has(k)} onChange={() => flip(k)} />
          <span>{label}</span>
          <select className={input} value={draft[k] ? 1 : 0} onChange={(e) => set(k, Number(e.target.value))}><option value={1}>Ligado</option><option value={0}>Desligado</option></select>
        </div>
      ))}
      {FIELDS.map((f) => (
        <div key={f.key} className={row} title={f.hint}>
          <input type="checkbox" aria-label={`aplicar ${f.label}`} checked={on.has(f.key)} onChange={() => flip(f.key)} />
          <span>{f.label}</span>
          <span className="flex items-center gap-1">
            <input type="number" className={`${input} w-24`} min={f.min} max={f.max} step={f.step} value={Number(draft[f.key] ?? 0)} onChange={(e) => set(f.key, Number(e.target.value))} />
            <span className="w-10 text-xs text-ink-3">{f.unit}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function AdminConfig({ stations }: { stations: AdminStation[] }) {
  const [scope, setScope] = useState(initialScope)
  const [draft, setDraft] = useState<StationConfig>(DEFAULT_CONFIG)
  const [on, setOn] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // padrão das estações novas
  const load = useCallback(() => getDefaults(), [])
  const { data: defaults, reload } = useLoad(load, false)
  const [dDraft, setDDraft] = useState<StationConfig>(DEFAULT_CONFIG)
  const [dOn, setDOn] = useState<Set<string>>(new Set())
  const [dMsg, setDMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { if (defaults) setDDraft(defaults.config) }, [defaults])

  const payload = (d: StationConfig, keys: Set<string>) => Object.fromEntries([...keys].map((k) => [k, d[k as keyof StationConfig]])) as Draft
  const n = scopeCount(scope, stations.length)

  const apply = async () => {
    if (!on.size) return setMsg({ ok: false, text: 'Marque pelo menos um campo para aplicar.' })
    if (!n) return setMsg({ ok: false, text: 'Selecione as estações.' })
    if (!window.confirm(`Aplicar ${on.size} ajuste(s) em ${n} estação(ões)? Cada uma baixa a mudança no próximo envio.`)) return
    setBusy(true); setMsg(null)
    try {
      const r = await bulkConfig(toScope(scope), payload(draft, on))
      setMsg({ ok: true, text: `Aplicado em ${r.updated} estação(ões). Elas recebem no próximo envio.` })
    } catch (e) { setMsg({ ok: false, text: errText(e) }) }
    setBusy(false)
  }

  const saveDefaults = async () => {
    setBusy(true); setDMsg(null)
    try {
      await putDefaults({ config: payload(dDraft, dOn.size ? dOn : new Set(Object.keys(dDraft).filter((k) => k !== 'version'))) })
      reload()
      setDMsg({ ok: true, text: 'Padrão salvo. Vale para as estações cadastradas daqui para frente.' })
    } catch (e) { setDMsg({ ok: false, text: errText(e) }) }
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      <Section title="Configuração em massa" hint="Marque só o que quer mudar. Os campos desmarcados não são alterados. Cada estação soma 1 à versão da configuração e baixa a mudança no próximo envio.">
        <StationScope stations={stations} scope={scope} onChange={setScope} />
        <Form draft={draft} on={on} onDraft={(d) => setDraft(d as StationConfig)} onOn={setOn} />
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnMain} onClick={apply} disabled={busy || !on.size}>Aplicar a {n} estação(ões)</button>
          <button className={btn} onClick={() => { setOn(new Set()); setDraft(DEFAULT_CONFIG) }}>Limpar</button>
          <Msg m={msg} />
        </div>
      </Section>

      <Section title="Padrão para estações novas" hint="Toda estação cadastrada nasce com estes ajustes (o dono pode mudá-los depois).">
        <Form draft={dDraft} on={dOn} onDraft={(d) => setDDraft(d as StationConfig)} onOn={setDOn} />
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnMain} onClick={saveDefaults} disabled={busy}>Salvar o padrão</button>
          <Msg m={dMsg} />
        </div>
      </Section>
    </div>
  )
}
