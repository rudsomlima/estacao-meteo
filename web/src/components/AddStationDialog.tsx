import { Check, Copy, MapPin, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SaveResult } from '../hooks/useNetwork'
import { store, type StationEdit } from '../lib/api'
import { CHEMS, CHEM_KEYS } from '../lib/battery'
import { DEFAULT_CONFIG } from '../lib/demo'
import type { BatteryChem } from '../types'

interface Props {
  open: boolean
  picked: { lat: number; lon: number } | null
  onClose: () => void
  onPickMap: () => void
  onCreate: (body: StationEdit & { id: string }, token: string) => Promise<SaveResult>
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

const field = 'num rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'

export default function AddStationDialog({ open, picked, onClose, onPickMap, onCreate }: Props) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [alt, setAlt] = useState('0')
  const [chem, setChem] = useState<BatteryChem>('li')
  const [mah, setMah] = useState('3000')
  const [token, setToken] = useState(() => store.get('meteo.token'))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (picked) { setLat(picked.lat.toFixed(5)); setLon(picked.lon.toFixed(5)) }
  }, [picked])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const id = slug(name)
    const la = Number(lat), lo = Number(lon)
    if (!id) return setErr('Dê um nome à estação.')
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !lat || !lon) return setErr('Informe a latitude e a longitude, ou escolha o ponto no mapa.')
    setBusy(true)
    store.set('meteo.token', token)
    const c = CHEMS[chem]
    const r = await onCreate(
      { id, name: name.trim(), city: city.trim(), lat: la, lon: lo, alt: Number(alt) || 0,
        config: { ...DEFAULT_CONFIG, battery_chem: chem, battery_mah: Number(mah) || 3000, slow_below_v: c.slow_below_v, critical_v: c.critical_v } },
      token,
    )
    setBusy(false)
    if (r.ok && r.key) setKey(r.key)
    else setErr(r.message)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(key); setCopied(true) } catch { setCopied(false) }
  }

  const close = () => { setKey(''); setName(''); setCity(''); setLat(''); setLon(''); setErr(''); setCopied(false); onClose() }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="add-title" className="font-display text-xl font-bold">{key ? 'Estação criada' : 'Adicionar estação'}</h2>
          <button onClick={close} aria-label="Fechar" className="rounded-lg p-1 text-ink-2 hover:bg-card-hover"><X className="h-5 w-5" /></button>
        </div>

        {key ? (
          <div className="mt-4 grid gap-4 text-sm">
            <p className="text-ink-2">Copie a chave agora. Ela não é mostrada de novo (dá para gerar outra na configuração da estação).</p>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg p-3">
              <code className="num min-w-0 flex-1 break-all text-cyan">{key}</code>
              <button onClick={copy} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">
                {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <ol className="grid list-decimal gap-1.5 pl-5 text-ink-2">
              <li>Grave o firmware no ESP32-C3 e ligue.</li>
              <li>Conecte no Wi-Fi <b className="num text-ink">EstacaoMeteo-XXXX</b> pelo celular.</li>
              <li>Escolha sua rede e informe o endereço do site: <b className="num break-all text-ink">{location.origin}</b></li>
              <li>Cole a chave acima em <b className="text-ink">Chave do dispositivo</b> e salve.</li>
            </ol>
            <button onClick={close} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white">Concluir</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3 text-sm font-medium">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">Nome<input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Serra" maxLength={40} required /></label>
              <label className="grid gap-1">Cidade<input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Campos do Jordão" maxLength={60} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1">Latitude<input className={field} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-22.74" /></label>
              <label className="grid gap-1">Longitude<input className={field} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-45.59" /></label>
              <button type="button" onClick={onPickMap} className="flex items-center justify-center gap-1.5 self-end rounded-lg border border-line px-3 py-2 text-sm hover:bg-card-hover"><MapPin className="h-4 w-4" aria-hidden />No mapa</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1">Altitude (m)<input className={field} inputMode="numeric" value={alt} onChange={(e) => setAlt(e.target.value)} /></label>
              <label className="grid gap-1">Bateria
                <select className={field} value={chem} onChange={(e) => setChem(e.target.value as BatteryChem)}>
                  {CHEM_KEYS.map((k) => <option key={k} value={k}>{CHEMS[k].label}</option>)}
                </select>
              </label>
              <label className="grid gap-1">Capacidade (mAh)<input className={field} inputMode="numeric" value={mah} onChange={(e) => setMah(e.target.value)} /></label>
            </div>
            <label className="grid gap-1">Token de administrador<input type="password" autoComplete="current-password" className={field} value={token} onChange={(e) => setToken(e.target.value)} required /></label>
            {err && <p role="alert" className="text-bad">{err}</p>}
            <button type="submit" disabled={busy} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Criando…' : 'Criar estação'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
