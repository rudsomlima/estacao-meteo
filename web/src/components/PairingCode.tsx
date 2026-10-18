import { Check, Copy, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, createClaim } from '../lib/api'

/**
 * Código de pareamento: quem instala a estação digita no portal e a placa busca a chave sozinha.
 * Vale uma vez e por 24 horas, e gerar outro cancela o anterior.
 */
export default function PairingCode({ id, name, token, auto = false }: { id: string; name: string; token: string; auto?: boolean }) {
  const [claim, setClaim] = useState<{ code: string; expires_at: number } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const make = async () => {
    setBusy(true)
    setErr('')
    try { setClaim(await createClaim(id, token)); setCopied(false) } catch (e) {
      setErr(e instanceof ApiError ? (e.status === 401 ? 'Token de administrador incorreto.' : e.message) : 'Não foi possível gerar o código.')
    }
    setBusy(false)
  }
  useEffect(() => { if (auto) void make() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const text = claim
    ? `Instalar a estação ${name}: ligue a placa, conecte o celular na rede Wi-Fi "EstacaoMeteo-XXXX", escolha a rede do local e digite o código ${claim.code}. O código vale 24 h e só uma vez.`
    : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <div className="grid gap-2">
      {!claim ? (
        <button type="button" onClick={make} disabled={busy} className="flex w-fit items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-card-hover disabled:opacity-50">
          <KeyRound className="h-4 w-4" aria-hidden /> {busy ? 'Gerando…' : 'Gerar código de pareamento'}
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-bg p-4">
          <p className="text-xs text-ink-3">Código de pareamento · vale até {new Date(claim.expires_at * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
          <p className="num mt-1 text-4xl font-bold tracking-[0.12em] text-cyan">{claim.code}</p>
          <p className="mt-2 text-xs text-ink-2">{text}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">
              {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? 'Copiado' : 'Copiar instruções'}
            </button>
            <button type="button" onClick={make} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Gerar outro</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-bad">{err}</p>}
    </div>
  )
}
