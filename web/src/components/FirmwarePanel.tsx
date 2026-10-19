import { AlertTriangle, Check, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { SESSION_TOKEN, useToken } from '../hooks/useToken'
import { useIsAdmin, useSession } from '../lib/session'
import { ApiError, publishFirmware, unpublishFirmware } from '../lib/api'
import type { FirmwareInfo, Source, Station } from '../types'

const input = 'num rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'

/** Publica o firmware para a estação baixar sozinha no próximo envio. */
export default function FirmwarePanel({ station, info, source, onChanged }: { station: Station; info: FirmwareInfo | null; source: Source; onChanged: () => void }) {
  const [token, setToken] = useToken()
  const editable = useIsAdmin()
  const { clientId } = useSession()
  const [version, setVersion] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const published = info?.published ?? null
  const installed = info?.installed ?? station.fw_version
  const pending = published && installed !== published.version

  const publish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setMsg({ ok: false, text: 'Escolha o arquivo firmware.bin.' })
    setBusy(true)
    setMsg(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const r = await publishFirmware(station.id, version.trim(), bytes, token)
      setMsg({ ok: true, text: `Versão ${r.version} publicada (${(r.size / 1024).toFixed(0)} KB). A estação baixa no próximo envio.` })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onChanged()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? (err.status === 401 ? 'Token de administrador incorreto.' : err.message) : 'Não foi possível publicar.' })
    }
    setBusy(false)
  }

  const unpublish = async () => {
    setBusy(true)
    try {
      await unpublishFirmware(station.id, token)
      setMsg({ ok: true, text: 'Despublicado. A estação não baixa mais nada.' })
      onChanged()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError && err.status === 401 ? 'Token de administrador incorreto.' : 'Não foi possível despublicar.' })
    }
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      <dl className="num grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-ink-3">Instalada na estação</dt><dd>{installed ?? 'desconhecida'}</dd></div>
        <div>
          <dt className="text-xs text-ink-3">Publicada</dt>
          <dd className={pending ? 'text-warn' : ''}>{published ? `${published.version} · ${(published.size / 1024).toFixed(0)} KB` : 'nenhuma'}{pending ? ' · aguardando a estação' : published ? ' · em dia' : ''}</dd>
        </div>
      </dl>

      {source !== 'demo' && !editable ? (
        <p className="text-sm text-ink-3">Só administradores publicam firmware.</p>
      ) : source === 'demo' ? (
        <p className="text-sm text-ink-3">Disponível só com a API ligada. Na demonstração não há servidor para guardar o firmware.</p>
      ) : (
        <form onSubmit={publish} className="grid gap-3 text-sm font-medium">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <label className="grid gap-1">Versão (diferente da instalada)
              <input className={input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="0.3.0" required pattern="[\w.+\-]{1,40}" />
            </label>
            <label className="grid gap-1">Arquivo firmware.bin
              <input ref={fileRef} type="file" accept=".bin" className={input} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </label>
          </div>
          {!clientId && token !== SESSION_TOKEN && (
            <label className="grid gap-1">Token de administrador
              <input type="password" autoComplete="current-password" className={input} value={token} onChange={(e) => setToken(e.target.value)} required />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2.5 font-semibold text-white disabled:opacity-50">
              <Upload className="h-4 w-4" aria-hidden /> {busy ? 'Enviando…' : 'Publicar'}
            </button>
            {published && <button type="button" onClick={unpublish} disabled={busy} className="rounded-xl border border-line px-4 py-2.5 hover:bg-card-hover disabled:opacity-50">Despublicar</button>}
            {msg && (
              <p role="status" className={`flex items-center gap-1.5 text-sm font-normal ${msg.ok ? 'text-ok' : 'text-bad'}`}>
                {msg.ok ? <Check className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />} {msg.text}
              </p>
            )}
          </div>
        </form>
      )}

      <ul className="grid gap-1.5 text-xs text-ink-3">
        <li>A estação atualiza quando a versão publicada é <b className="text-ink-2">diferente</b> da instalada, e não só quando é mais nova. Publicar por engano um arquivo antigo faz a estação voltar para ele. Use Despublicar para parar.</li>
        <li>O arquivo é o <span className="num">firmware.bin</span> gerado por <span className="num">pio run</span> (em <span className="num">firmware/.pio/build/esp32c3/</span>), e a versão deve bater com <span className="num">FW_VERSION</span> no <span className="num">config.h</span>.</li>
        <li>A estação confere o SHA-256 antes de ativar, adia com a bateria perto do crítico e desiste da versão após 3 falhas. Não há retorno automático para a versão anterior: um firmware que não conecta exige gravação por USB.</li>
      </ul>
    </div>
  )
}
