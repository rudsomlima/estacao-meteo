import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useToken } from '../hooks/useToken'
import { ApiError, fetchReadingsRaw, getUsage, type Usage } from '../lib/api'
import { demoHistory } from '../lib/demo'
import { getPrefs, sanitize, setPrefs } from '../lib/prefs'
import type { Source, Station } from '../types'

const btn = 'flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover disabled:opacity-50'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
const fmtDate = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString('pt-BR') : '—')

/** Exportar leituras em CSV, salvar e restaurar as preferências, e ver quanto do banco está em uso. */
export default function DataPanel({ stations, source }: { stations: Station[]; source: Source }) {
  const [token] = useToken()
  const [id, setId] = useState(stations[0]?.id ?? '')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const exportCsv = async () => {
    if (!id) return
    setBusy(true)
    setMsg(null)
    try {
      const hours = days * 24
      const rs = source === 'api' ? await fetchReadingsRaw(id, hours) : demoHistory(id, hours)
      const head = 'data_hora_utc,unix,temperatura_c,umidade_pct,pressao_hpa,vento_ms,rajada_ms,direcao_graus,chuva_mm,bateria_v,sinal_dbm'
      const lines = rs.map((r) =>
        [new Date(r.ts * 1000).toISOString(), r.ts, r.temp, r.hum, r.pres, r.wind, r.gust, r.dir, r.rain, r.vbat, r.rssi].join(','))
      download(`${id}-${days}d.csv`, [head, ...lines].join('\n'), 'text/csv')
      setMsg({ ok: true, text: `${rs.length} leituras exportadas (unidades do sistema: m/s, °C, mm, hPa).` })
    } catch {
      setMsg({ ok: false, text: 'Não foi possível exportar.' })
    }
    setBusy(false)
  }

  const backup = () => download('estacao-meteo-ajustes.json', JSON.stringify({ app: 'estacao-meteo', prefs: getPrefs() }, null, 2), 'application/json')
  const restore = async (f: File | undefined) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text()) as { prefs?: unknown }
      setPrefs(sanitize(data.prefs ?? data))
      setMsg({ ok: true, text: 'Ajustes restaurados.' })
    } catch {
      setMsg({ ok: false, text: 'Arquivo inválido.' })
    }
    if (file.current) file.current.value = ''
  }

  const loadUsage = async () => {
    setBusy(true)
    try { setUsage(await getUsage(token)); setMsg(null) } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? (e.status === 401 ? 'Token de administrador incorreto (preencha em Telegram).' : e.message) : 'Não foi possível consultar.' })
    }
    setBusy(false)
  }

  return (
    <div className="grid gap-6">
      <div>
        <h3 className="text-sm font-semibold">Exportar leituras (CSV)</h3>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-ink-3">
            Estação
            <select value={id} onChange={(e) => setId(e.target.value)} className="num rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink">
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-ink-3">
            Período
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="num rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink">
              {[1, 7, 30].map((d) => <option key={d} value={d}>{d === 1 ? 'último dia' : `${d} dias`}</option>)}
            </select>
          </label>
          <button className={btn} onClick={exportCsv} disabled={busy || !id}><Download className="h-3.5 w-3.5" aria-hidden /> Baixar CSV</button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Ajustes deste navegador</h3>
        <p className="mt-1 text-xs text-ink-3">Unidades, favoritas e mapa. Salve num arquivo para levar a outro aparelho.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btn} onClick={backup}><Download className="h-3.5 w-3.5" aria-hidden /> Salvar arquivo</button>
          <button className={btn} onClick={() => file.current?.click()}><Upload className="h-3.5 w-3.5" aria-hidden /> Restaurar arquivo</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void restore(e.target.files?.[0])} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Uso do banco de dados</h3>
        {source === 'demo' ? (
          <p className="mt-1 text-xs text-ink-3">Disponível quando o site estiver ligado à API.</p>
        ) : (
          <>
            <div className="mt-2"><button className={btn} onClick={loadUsage} disabled={busy || !token}>Consultar</button></div>
            {usage && (
              <div className="mt-3 text-sm">
                <p className="num text-ink-2">
                  {usage.readings.toLocaleString('pt-BR')} leituras · {usage.events} eventos · ~{fmtBytes(usage.approxBytes)} · de {fmtDate(usage.oldest)} a {fmtDate(usage.newest)}
                </p>
                <ul className="num mt-2 grid gap-1 text-xs text-ink-3">
                  {usage.perStation.map((p) => <li key={p.id}>{p.id}: {p.n.toLocaleString('pt-BR')} leituras desde {fmtDate(p.oldest)}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
    </div>
  )
}
