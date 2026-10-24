import { Cpu, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ADDRESS_APP, ADDRESS_FULL, explainFlashError, flash } from '../lib/flash'
import { loadManifest, type FirmwareImage } from '../board/manifest'
import { askForPort, describePort, usbSupported, waitForPlug, type Port } from '../lib/usb'

/** Ferramenta avançada para gravar apenas o firmware por USB. */
export default function FlashPanel() {
  const [items, setItems] = useState<FirmwareImage[]>([])
  const [pick, setPick] = useState('')
  const [custom, setCustom] = useState<{ name: string; data: Uint8Array } | null>(null)
  const [kind, setKind] = useState<'full' | 'app'>('full')
  const [erase, setErase] = useState(false)
  const [port, setPort] = useState<Port | null>(null)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [waiting, setWaiting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadManifest().then((m) => { setItems(m); setPick(m[0]?.file ?? '') })
  }, [])

  if (!usbSupported()) return <p className="text-sm text-ink-2">Este navegador não tem Web Serial. Use o Chrome, o Edge ou o Opera.</p>

  const choose = async () => { const p = await askForPort(); if (p) setPort(p) }

  const run = async (retry = false) => {
    if (!port) return
    setBusy(true)
    setMsg(null)
    setLog([])
    setPct(0)
    try {
      let name: string, data: Uint8Array, address: number
      if (custom) { name = custom.name; data = custom.data; address = kind === 'full' ? ADDRESS_FULL : ADDRESS_APP }
      else {
        const it = items.find((i) => i.file === pick)
        if (!it) throw new Error('Escolha uma imagem.')
        const r = await fetch(`/firmware/${it.file}`)
        if (!r.ok) throw new Error('Não foi possível baixar a imagem.')
        name = it.file; data = new Uint8Array(await r.arrayBuffer()); address = it.kind === 'app' ? ADDRESS_APP : ADDRESS_FULL
      }
      if (data[0] !== 0xe9) throw new Error('Este arquivo não parece uma imagem de ESP32 (não começa com 0xE9).')
      const chip = await flash(port, { name, data, address }, {
        eraseAll: erase,
        onProgress: setPct,
        onLog: (l) => setLog((cur) => [...cur.slice(-40), l]),
      })
      setMsg({ ok: true, text: `Firmware gravado em ${chip}. A placa reiniciou${erase ? ' (flash apagada: ela volta sem Wi-Fi, chave, calibração e configuração salva)' : address === ADDRESS_FULL ? ' (imagem completa: os dados salvos podem ser redefinidos)' : ' (somente o aplicativo: os dados salvos foram preservados)'}. Esta etapa não configura Wi-Fi nem vincula a placa a uma estação.` })
      setTimeout(() => window.dispatchEvent(new Event('meteo:usb-probe')), 3000)
    } catch (e) {
      const { text, waitForBoard } = explainFlashError(e)
      // a placa dorme entre as leituras e a USB some: basta apertar RESET que ela reaparece, e a gravação recomeça sozinha
      if (!retry && waitForBoard) {
        setBusy(false)
        setWaiting(true)
        setMsg({ ok: false, text })
        const p = await waitForPlug(60000)
        setWaiting(false)
        if (p) { setPort(p); setMsg(null); await new Promise((r) => setTimeout(r, 800)); return run(true) }
        setMsg({ ok: false, text: 'A placa não apareceu em 60 s. Confira o cabo (precisa ser de dados). Se ainda assim não aparecer, segure BOOT, aperte RESET, solte o RESET e depois o BOOT, e tente de novo.' })
        return
      }
      setMsg({ ok: false, text })
    }
    setBusy(false)
  }

  const selected = custom ? null : items.find((i) => i.file === pick)

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-2">Use esta área avançada para atualizar o firmware de uma placa existente ou recuperar uma placa sem resposta. Ela não escolhe a estação nem configura Wi-Fi ou chave. Para atualizar somente o aplicativo sem mexer nos dados salvos, escolha o arquivo .bin do aplicativo e grave em 0x10000. A imagem completa em 0x0 pode redefinir dados salvos mesmo sem apagar toda a flash. Para preparar uma placa nova e deixá-la pronta para enviar dados, use o assistente acima. Se a placa estiver dormindo (a porta some do computador), aperte RESET nela.</p>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={choose} disabled={busy} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-card-hover disabled:opacity-50"><Cpu className="h-4 w-4" aria-hidden /> {port ? 'Trocar placa' : 'Escolher a placa'}</button>
        {port && <span className="num text-sm text-ok">{describePort(port)}</span>}
      </div>

      <fieldset className="grid gap-2" disabled={busy}>
        <legend className="mb-1 text-sm text-ink-2">Imagem</legend>
        {items.length === 0 && !custom && (
          <p className="text-xs text-ink-3">Nenhuma imagem neste site. Gere com <span className="num">python firmware/tools/make_factory.py --lan</span> (teste local) ou <span className="num">--server https://seu-site</span> (publicado) e recarregue, ou escolha um arquivo abaixo.</p>
        )}
        {!custom && items.map((i) => (
          <label key={i.file} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${pick === i.file ? 'border-cyan' : 'border-line'}`}>
            <input type="radio" name="img" checked={pick === i.file} onChange={() => setPick(i.file)} className="mt-1" />
            <span>
              <b>{i.title}</b> <span className="num text-xs text-ink-3">{i.fw ? `v${i.fw} · ` : ''}{Math.round(i.size / 1024)} KB{i.built ? ` · gerada em ${new Date(i.built * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span><br />
              <span className="text-xs text-ink-2">{i.note}</span>
              {i.server && <><br /><span className="num text-xs text-ink-3">site embutido: {i.server}</span></>}
            </span>
          </label>
        ))}
        {custom && (
          <div className="rounded-xl border border-cyan p-3 text-sm">
            <b className="num">{custom.name}</b> <span className="num text-xs text-ink-3">{Math.round(custom.data.length / 1024)} KB</span>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-2">
              <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'full'} onChange={() => setKind('full')} /> imagem completa (a partir de 0x0)</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'app'} onChange={() => setKind('app')} /> só o aplicativo (0x10000)</label>
            </div>
            <button onClick={() => { setCustom(null); if (fileRef.current) fileRef.current.value = '' }} className="mt-2 text-xs text-ink-3 underline">usar uma imagem do site</button>
          </div>
        )}
        <div>
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Escolher outro arquivo .bin</button>
          <input ref={fileRef} type="file" accept=".bin" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCustom({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }) }} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} /> Apagar toda a flash antes (remove Wi-Fi, chave, calibração e configuração salvos)</label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void run()} disabled={busy || waiting || !port || (!custom && !selected)} className="rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? `Gravando… ${pct}%` : waiting ? 'Aguardando a placa…' : 'Gravar firmware'}</button>
        {busy && <div className="h-2 w-40 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i className="block h-full bg-cyan" style={{ width: `${pct}%` }} /></div>}
      </div>
      {msg && <p role="status" className={`flex items-start gap-1.5 text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{!msg.ok && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{msg.text}</p>}
      {log.length > 0 && <pre className="num max-h-40 overflow-auto rounded-lg border border-line bg-bg p-3 text-[11px] text-ink-3">{log.join('\n')}</pre>}
    </div>
  )
}
