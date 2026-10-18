import { Check, Copy, MapPin, X } from 'lucide-react'
import PairingCode from './PairingCode'
import { useEffect, useState } from 'react'
import type { SaveResult } from '../hooks/useNetwork'
import { store, type StationEdit } from '../lib/api'
import { CHEMS, CHEM_KEYS } from '../lib/battery'
import { DEFAULT_CONFIG } from '../lib/demo'
import type { BatteryChem, Station } from '../types'

interface Props {
  open: boolean
  picked: { lat: number; lon: number } | null
  /** com uma estação, o diálogo edita (nome, cidade, local, altitude) e permite remover */
  station?: Station | null
  onClose: () => void
  onPickMap: () => void
  onCreate: (body: StationEdit & { id: string }, token: string) => Promise<SaveResult>
  onSave?: (s: Station, token: string) => Promise<SaveResult>
  onRemove?: (id: string, token: string) => Promise<SaveResult>
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

// min-w-0 e w-full: sem isso os campos de um grid não encolhem e o formulário passa da largura do diálogo
const field = 'num w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'
const cell = 'grid min-w-0 gap-1'

export default function AddStationDialog({ open, picked, station, onClose, onPickMap, onCreate, onSave, onRemove }: Props) {
  const editing = !!station
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
  const [confirmDel, setConfirmDel] = useState(false)

  // ao abrir para editar, preenche com os dados da estação (e só então: o ponto do mapa não deve ser sobrescrito)
  const sid = station?.id
  useEffect(() => {
    if (!station) return
    setName(station.name); setCity(station.city); setLat(String(station.lat)); setLon(String(station.lon)); setAlt(String(station.alt))
    setErr(''); setConfirmDel(false)
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (picked) { setLat(picked.lat.toFixed(5)); setLon(picked.lon.toFixed(5)) }
  }, [picked])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const id = station?.id ?? slug(name)
    const la = Number(lat), lo = Number(lon)
    if (!id || !name.trim()) return setErr('Dê um nome à estação.')
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !lat || !lon) return setErr('Informe a latitude e a longitude, ou escolha o ponto no mapa.')
    setBusy(true)
    store.set('meteo.token', token)
    if (station && onSave) {
      const r = await onSave({ ...station, name: name.trim(), city: city.trim(), lat: la, lon: lo, alt: Number(alt) || 0 }, token)
      setBusy(false)
      if (r.ok) close()
      else setErr(r.message)
      return
    }
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

  const remove = async () => {
    if (!station || !onRemove) return
    setBusy(true)
    setErr('')
    store.set('meteo.token', token)
    const r = await onRemove(station.id, token)
    setBusy(false)
    if (r.ok) close()
    else setErr(r.message)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(key); setCopied(true) } catch { setCopied(false) }
  }

  const close = () => { setKey(''); setName(''); setCity(''); setLat(''); setLon(''); setErr(''); setCopied(false); setConfirmDel(false); onClose() }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-line bg-card p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="add-title" className="font-display text-xl font-bold">{key ? 'Estação criada' : editing ? `Editar ${station?.name}` : 'Adicionar estação'}</h2>
          <button onClick={close} aria-label="Fechar" className="rounded-lg p-1 text-ink-2 hover:bg-card-hover"><X className="h-5 w-5" /></button>
        </div>

        {key ? (
          <div className="mt-4 grid gap-4 text-sm">
            <p className="text-ink-2">Quem for instalar só precisa do código abaixo: a placa busca a chave sozinha e ninguém copia chave nenhuma.</p>
            <PairingCode id={slug(name)} name={name.trim()} token={token} auto />
            <details className="rounded-lg border border-line p-3 text-ink-2">
              <summary className="cursor-pointer text-xs">Configurar à mão, com a chave (avançado)</summary>
              <p className="mt-2 text-xs">Copie a chave agora. Ela não é mostrada de novo. Se usar o código, esta chave é trocada por outra e deixa de valer.</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-bg p-3">
              <code className="num min-w-0 flex-1 break-all text-cyan">{key}</code>
              <button onClick={copy} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">
                {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-xs">
              <li>Conecte no Wi-Fi <b className="num text-ink">EstacaoMeteo-XXXX</b> pelo celular.</li>
              <li>Escolha a rede e informe o endereço do site: <b className="num break-all text-ink">{location.origin}</b></li>
              <li>Cole a chave em <b className="text-ink">Chave do dispositivo</b> e o ID <b className="num text-ink">{slug(name)}</b>.</li>
            </ol>
            </details>
            <ol className="grid list-decimal gap-1.5 pl-5 text-ink-2">
              <li>Ligue a placa (com o firmware já gravado).</li>
              <li>Conecte o celular no Wi-Fi <b className="num text-ink">EstacaoMeteo-XXXX</b>.</li>
              <li>Escolha a rede do local e digite o código de pareamento. Pronto.</li>
            </ol>
            <button onClick={close} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white">Concluir</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3 text-sm font-medium">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={cell}>Nome<input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Serra" maxLength={40} required /></label>
              <label className={cell}>Cidade<input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Campos do Jordão" maxLength={60} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className={cell}>Latitude<input className={field} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-22.74" /></label>
              <label className={cell}>Longitude<input className={field} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-45.59" /></label>
              <button type="button" onClick={onPickMap} className="col-span-2 flex items-center justify-center gap-1.5 self-end rounded-lg border border-line px-3 py-2 text-sm hover:bg-card-hover sm:col-span-1"><MapPin className="h-4 w-4" aria-hidden />No mapa</button>
            </div>
            <div className={`grid gap-3 ${editing ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
              <label className={cell}>Altitude (m)<input className={field} inputMode="numeric" value={alt} onChange={(e) => setAlt(e.target.value)} /></label>
              {!editing && (
                <>
                  <label className={cell}>Bateria
                    <select className={field} value={chem} onChange={(e) => setChem(e.target.value as BatteryChem)}>
                      {CHEM_KEYS.map((k) => <option key={k} value={k}>{CHEMS[k].label}</option>)}
                    </select>
                  </label>
                  <label className={`${cell} col-span-2 sm:col-span-1`}>Capacidade (mAh)<input className={field} inputMode="numeric" value={mah} onChange={(e) => setMah(e.target.value)} /></label>
                </>
              )}
            </div>
            {editing && <p className="text-xs font-normal text-ink-3">Bateria, intervalo e calibração ficam em <b>Configurações</b> da estação.</p>}
            <label className={cell}>Token de administrador<input type="password" autoComplete="current-password" className={field} value={token} onChange={(e) => setToken(e.target.value)} required /></label>
            {err && <p role="alert" className="text-bad">{err}</p>}
            <button type="submit" disabled={busy} className="rounded-xl bg-blue px-4 py-2.5 font-semibold text-white disabled:opacity-50">
              {busy ? (editing ? 'Salvando…' : 'Criando…') : editing ? 'Salvar alterações' : 'Criar estação'}
            </button>
            {editing && onRemove && (
              confirmDel ? (
                <div className="grid gap-2 rounded-lg border border-bad/40 p-3 font-normal">
                  <p className="text-bad">Remover <b>{station?.name}</b> apaga a estação, a chave e <b>todas as leituras</b>. Não dá para desfazer.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmDel(false)} className="rounded-lg border border-line px-3 py-2 hover:bg-card-hover">Cancelar</button>
                    <button type="button" onClick={remove} disabled={busy || !token} className="rounded-lg bg-bad px-3 py-2 font-semibold text-white disabled:opacity-50">Sim, remover</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDel(true)} className="rounded-xl border border-bad/40 px-4 py-2.5 text-bad hover:bg-bad/10">Remover estação…</button>
              )
            )}
          </form>
        )}
      </div>
    </div>
  )
}
