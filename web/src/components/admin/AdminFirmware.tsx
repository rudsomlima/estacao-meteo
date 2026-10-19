import { CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import { useRef, useState } from 'react'
import { assignRelease, deleteRelease, getRollout, listReleases, unassignRelease, uploadRelease, type AdminStation, type RolloutRow } from '../../lib/admin'
import { ago } from '../../lib/derive'
import { useNow } from '../../hooks/useNow'
import { btn, btnMain, errText, initialScope, input, Msg, scopeCount, Section, StationScope, toScope, useLoad } from './ui'

const kb = (n: number) => `${Math.round(n / 1024)} KB`

const STATUS: Record<RolloutRow['status'], { label: string; cls: string; Icon: typeof CircleCheck }> = {
  ok: { label: 'Atualizada', cls: 'text-ok', Icon: CircleCheck },
  falhou: { label: 'Falhou', cls: 'text-bad', Icon: CircleX },
  aguardando: { label: 'Aguardando', cls: 'text-warn', Icon: CircleDashed },
}

export default function AdminFirmware({ stations }: { stations: AdminStation[] }) {
  useNow()
  const { data: releases, reload: reloadReleases } = useLoad(listReleases, false)
  const { data: rollout, error, reload } = useLoad(getRollout) // recarrega sozinho quando uma estação envia
  const [scope, setScope] = useState(initialScope)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const n = scopeCount(scope, stations.length)
  const chosen = pick ?? releases?.[0]?.id ?? null

  const run = async (f: () => Promise<string>) => {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await f() }) } catch (e) { setMsg({ ok: false, text: errText(e) }) }
    setBusy(false); reload(); reloadReleases()
  }

  const upload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setMsg({ ok: false, text: 'Escolha o arquivo firmware.bin.' })
    void run(async () => {
      const r = await uploadRelease(version.trim(), notes.trim(), new Uint8Array(await file.arrayBuffer()))
      setFile(null); setVersion(''); setNotes(''); setPick(r.id)
      if (fileRef.current) fileRef.current.value = ''
      return `Versão ${r.version} guardada. Agora atribua às estações.`
    })
  }

  const assign = () => {
    if (chosen === null) return setMsg({ ok: false, text: 'Escolha a versão.' })
    const rel = releases?.find((r) => r.id === chosen)
    if (!window.confirm(`Enviar a versão ${rel?.version} para ${n} estação(ões)? Cada uma baixa no próximo envio e só atualiza se a bateria permitir.`)) return
    void run(async () => { const r = await assignRelease(chosen, toScope(scope)); return `Versão ${r.version} atribuída a ${r.assigned} estação(ões).` })
  }

  const s = rollout?.summary
  return (
    <div className="grid gap-4">
      <Section title="Versões de firmware" hint="Uma cópia do firmware serve para várias estações. A estação atualiza quando a versão atribuída é diferente da instalada, confere o SHA-256 e reinicia. Não há reversão automática: teste antes numa estação de bancada.">
        <form onSubmit={upload} className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm">Versão<input className={input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="0.4.0" required pattern="[\w.+\-]{1,40}" /></label>
          <label className="grid gap-1 text-sm">Notas (opcional)<input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="o que mudou" /></label>
          <label className="grid gap-1 text-sm">firmware.bin<input ref={fileRef} type="file" accept=".bin" className={input} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></label>
          <button className={btnMain} disabled={busy}>{busy ? 'Enviando…' : 'Guardar versão'}</button>
        </form>
        <p className="text-xs text-ink-3">O arquivo é o <span className="num">firmware.bin</span> de <span className="num">firmware/.pio/build/esp32c3/</span> (não a imagem de fábrica). A versão deve ser a mesma do <span className="num">FW_VERSION</span> compilado no arquivo.</p>

        {releases && releases.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="num w-full min-w-[560px] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['', 'Versão', 'Tamanho', 'Notas', 'Criada', 'Estações', ''].map((h, i) => <th key={i} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="pl-3"><input type="radio" name="rel" aria-label={`escolher ${r.version}`} checked={chosen === r.id} onChange={() => setPick(r.id)} /></td>
                    <td className="px-3 py-2 font-semibold">{r.version}</td>
                    <td className="px-3 py-2">{kb(r.size)}</td>
                    <td className="px-3 py-2 font-sans text-ink-2">{r.notes || '—'}</td>
                    <td className="px-3 py-2">{ago(r.created_at)}</td>
                    <td className="px-3 py-2">{r.assigned}</td>
                    <td className="px-3 py-2 text-right"><button className="text-xs text-ink-3 underline hover:text-bad disabled:no-underline disabled:opacity-40" disabled={busy || r.assigned > 0} title={r.assigned ? 'Retire a atribuição antes' : 'Apagar'} onClick={() => void run(async () => { await deleteRelease(r.id); return 'Versão apagada.' })}>apagar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Enviar para as estações" hint="Escolha a versão na tabela acima e as estações abaixo.">
        <StationScope stations={stations} scope={scope} onChange={setScope} />
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnMain} disabled={busy || chosen === null || n === 0} onClick={assign}>Atribuir a {n} estação(ões)</button>
          <button className={btn} disabled={busy || n === 0} onClick={() => { if (window.confirm(`Parar de oferecer firmware a ${n} estação(ões)?`)) void run(async () => { const r = await unassignRelease(toScope(scope)); return `Atribuição retirada de ${r.unassigned} estação(ões).` }) }}>Retirar a atribuição</button>
          <Msg m={msg} />
        </div>
      </Section>

      <Section title="Como foi a atualização" hint="Atualiza sozinho quando as estações enviam.">
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {s && (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="num rounded-full border border-ok/40 px-3 py-1 text-ok">{s.ok} atualizada(s)</span>
            <span className="num rounded-full border border-bad/40 px-3 py-1 text-bad">{s.falhou} falhou(aram)</span>
            <span className="num rounded-full border border-warn/40 px-3 py-1 text-warn">{s.aguardando} aguardando</span>
            <span className="num rounded-full border border-line px-3 py-1 text-ink-2">{s.total} no total</span>
          </div>
        )}
        {rollout && rollout.stations.length === 0 && <p className="text-sm text-ink-3">Nenhuma estação com firmware atribuído.</p>}
        {rollout && rollout.stations.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="num w-full min-w-[620px] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['Estação', 'Resultado', 'Instalada', 'Pedida', 'Último contato', 'Detalhe'].map((h) => <th key={h} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {rollout.stations.map((r) => {
                  const st = STATUS[r.status]
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-sans font-semibold">{r.name}</td>
                      <td className={`px-3 py-2 ${st.cls}`}><span className="flex items-center gap-1.5"><st.Icon className="h-4 w-4" aria-hidden />{st.label}</span></td>
                      <td className="px-3 py-2">{r.installed ?? '—'}</td>
                      <td className="px-3 py-2">{r.target}</td>
                      <td className="px-3 py-2">{r.last_seen ? ago(r.last_seen) : 'nunca'}</td>
                      <td className="px-3 py-2 font-sans text-xs text-ink-2">
                        {r.status === 'falhou' && r.fail ? `falhou em "${r.fail.stage ?? '?'}"${r.fail.http ? ` (http ${r.fail.http})` : ''}, ${ago(r.fail.ts)}` : r.status === 'aguardando' ? (r.contact ? 'já falou com o servidor; ainda não atualizou (bateria baixa ou lote)' : 'sem contato desde a atribuição') : 'versão confere'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
