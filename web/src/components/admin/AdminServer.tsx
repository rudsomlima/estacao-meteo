import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { backupPart, getServer, type ServerStats } from '../../lib/admin'
import { store } from '../../lib/api'
import { ago } from '../../lib/derive'
import Chart, { type Pt } from '../Chart'
import { btnMain, errText, input, Msg, Section, useLoad } from './ui'

const PLAN_KEY = 'meteo.admin.plan'
type Plan = 'free' | 'paid'

/** Franquias e preços da Cloudflare (Workers + D1) como eu as conheço: confira em dash.cloudflare.com antes de decidir qualquer coisa. */
const PLANS = {
  free: { label: 'Gratuito', base: 0, reqDay: 100_000, writesDay: 100_000, dbBytes: 500e6, note: 'Passou da franquia diária, a Cloudflare recusa os pedidos até o dia seguinte (não cobra).' },
  paid: { label: 'Workers Pago (US$ 5/mês)', base: 5, reqMonth: 10e6, reqPerM: 0.3, writesMonth: 50e6, writesPerM: 1, storageGb: 5, storagePerGb: 0.75, dbBytes: 10e9, note: 'US$ 5 fixos; acima da franquia cobra por uso.' },
} as const

const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
const fmtN = (n: number) => n.toLocaleString('pt-BR')
const fmtDate = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString('pt-BR') : '—')
const usd = (n: number) => `US$ ${n.toFixed(2)}`

const dayTs = (d: string) => new Date(`${d}T12:00:00-03:00`).getTime() / 1000

function Bar({ pct, warn }: { pct: number; warn?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${warn || pct > 80 ? 'bg-warn' : 'bg-cyan'}`} style={{ width: `${Math.min(100, Math.max(0.5, pct))}%` }} />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="num text-xs text-ink-3">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      {sub && <p className="num mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

/** Gera o arquivo .sql no navegador, pedindo o banco em pedaços (cada pedido é curto). */
function Backup({ tables }: { tables: ServerStats['db']['tables'] }) {
  const [withFw, setWithFw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const BIN = ['firmware', 'firmware_chunks', 'release_chunks']

  const run = async () => {
    setBusy(true); setMsg(null)
    const parts: string[] = [`-- Backup da estação meteorológica, ${new Date().toISOString()}\n-- Restaurar: npx wrangler d1 execute estacao-meteo --remote --file=este-arquivo.sql\n`]
    let rowsTotal = 0
    try {
      setProgress('estrutura…')
      parts.push((await backupPart('schema=1')).sql)
      for (const t of tables.filter((x) => withFw || !BIN.includes(x.name))) {
        let after = ''
        let done = 0
        for (;;) {
          setProgress(`${t.name}: ${fmtN(done)} de ${fmtN(t.rows)}`)
          const r = await backupPart(`table=${t.name}${after ? `&after=${encodeURIComponent(after)}` : ''}`)
          if (r.sql) parts.push(r.sql)
          done += r.rows; rowsTotal += r.rows
          if (!r.next) break
          after = r.next
        }
      }
      const blob = new Blob(parts, { type: 'application/sql' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `estacao-meteo-backup-${new Date().toISOString().slice(0, 10)}.sql`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      setMsg({ ok: true, text: `Backup pronto: ${fmtN(rowsTotal)} linhas, ${fmtBytes(blob.size)}.` })
    } catch (e) {
      setMsg({ ok: false, text: `Backup interrompido: ${errText(e)}` })
    } finally { setBusy(false); setProgress('') }
  }

  return (
    <Section title="Backup" hint="Baixa o banco inteiro como um arquivo .sql (estrutura e dados). Fica só no seu computador.">
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={withFw} onChange={(e) => setWithFw(e.target.checked)} /> Incluir os binários de firmware (grande; os .bin originais costumam estar no seu computador)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={`${btnMain} inline-flex items-center gap-2`} disabled={busy} onClick={() => void run()}><Download className="h-4 w-4" aria-hidden /> {busy ? 'Gerando…' : 'Baixar backup (.sql)'}</button>
        {progress && <span className="num text-sm text-ink-3">{progress}</span>}
      </div>
      <Msg m={msg} />
      <p className="text-xs text-warn">O arquivo contém chaves de estações, tokens do Telegram e e-mails de usuários. Guarde-o como uma senha: não envie por e-mail nem suba para um repositório.</p>
      <p className="text-xs text-ink-3">Para restaurar em um banco vazio: <span className="num">npx wrangler d1 execute estacao-meteo --remote --file=arquivo.sql</span>. Os comandos são idempotentes (INSERT OR REPLACE), então rodar duas vezes não duplica.</p>
    </Section>
  )
}

export default function AdminServer() {
  const { data: s, error, reload } = useLoad(getServer, false)
  const [plan, setPlan] = useState<Plan>(() => (store.get(PLAN_KEY) === 'paid' ? 'paid' : 'free'))
  const pickPlan = (p: Plan) => { setPlan(p); store.set(PLAN_KEY, p) }

  const view = useMemo(() => {
    if (!s) return null
    const keys = Object.keys(s.days).sort()
    const series = (k: string): Pt[] => keys.slice(-30).map((d) => ({ t: dayTs(d), v: s.days[d]?.[k] ?? 0 }))
    const sum = (k: string, n: number) => keys.slice(-n).reduce((a, d) => a + (s.days[d]?.[k] ?? 0), 0)
    const today = s.days[keys[keys.length - 1]] ?? {}
    const n7 = Math.max(1, Math.min(7, keys.length))
    const monthly = (k: string) => (sum(k, 7) / n7) * 30
    const tableBytes = s.db.tables.reduce((a, t) => a + t.bytes, 0)
    const size = s.db.size ?? tableBytes
    const readingsRows = s.db.tables.find((t) => t.name === 'readings')?.rows ?? 0
    const spanDays = s.db.oldest ? Math.max(1, (s.now - s.db.oldest) / 86400) : 1
    const perDay = (readingsRows * 64) / spanDays // só as leituras: é o que cresce com o tempo
    return { keys, series, sum, today, monthly, tableBytes, size, perDay }
  }, [s])

  if (error) return <p role="alert" className="text-sm text-bad">{error}</p>
  if (!s || !view) return <p className="text-sm text-ink-3">Carregando o servidor…</p>
  const P = PLANS[plan]
  const limit = P.dbBytes
  const room = limit - view.size
  const daysLeft = view.perDay > 0 ? Math.floor(room / view.perDay) : Infinity

  // custo estimado do mês, projetado da média dos últimos 7 dias
  const reqM = view.monthly('req'), wM = view.monthly('d1w')
  let cost = 0
  const lines: [string, string][] = []
  if (plan === 'paid') {
    const p = PLANS.paid
    const reqOver = Math.max(0, reqM - p.reqMonth) / 1e6 * p.reqPerM
    const wOver = Math.max(0, wM - p.writesMonth) / 1e6 * p.writesPerM
    const sOver = Math.max(0, view.size / 1e9 - p.storageGb) * p.storagePerGb
    cost = p.base + reqOver + wOver + sOver
    lines.push(['Assinatura', usd(p.base)], [`Pedidos acima de ${fmtN(p.reqMonth)}/mês`, usd(reqOver)], [`Gravações acima de ${fmtN(p.writesMonth)}/mês`, usd(wOver)], ['Armazenamento acima de 5 GB', usd(sOver)])
  }
  const reqToday = view.today.req ?? 0, wToday = view.today.d1w ?? 0

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tamanho do banco (D1)" value={fmtBytes(view.size)} sub={`${((view.size / limit) * 100).toFixed(1)}% do limite de ${fmtBytes(limit)}`} />
        <Stat label="Leituras guardadas" value={fmtN(s.db.tables.find((t) => t.name === 'readings')?.rows ?? 0)} sub={`desde ${fmtDate(s.db.oldest)}`} />
        <Stat label="Visitantes hoje" value={fmtN(view.today.visitors ?? 0)} sub={`${fmtN(view.sum('visitors', 7))} nos últimos 7 dias (soma diária)`} />
        <Stat label="Custo estimado do mês" value={plan === 'free' ? 'US$ 0,00' : usd(cost)} sub={P.label} />
      </div>

      <Section title="Plano e custos" hint="Estimativa a partir dos contadores do próprio servidor (média dos últimos 7 dias × 30). O valor exato está no painel da Cloudflare.">
        <div role="radiogroup" aria-label="Plano" className="flex flex-wrap gap-1.5">
          {(['free', 'paid'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={plan === k} onClick={() => pickPlan(k)} className={`rounded-lg border px-3 py-1.5 text-sm ${plan === k ? 'border-cyan bg-cyan text-[#03212d]' : 'border-line text-ink-2 hover:text-ink'}`}>{PLANS[k].label}</button>
          ))}
        </div>
        {plan === 'free' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {([['Pedidos à API hoje', reqToday, PLANS.free.reqDay], ['Gravações no D1 hoje (estimadas)', wToday, PLANS.free.writesDay]] as const).map(([l, v, max]) => (
              <div key={l} className="grid gap-1.5 text-sm"><span className="text-ink-2">{l}</span><Bar pct={(v / max) * 100} /><span className="num text-xs text-ink-3">{fmtN(v)} de {fmtN(max)} por dia</span></div>
            ))}
            <div className="grid gap-1.5 text-sm"><span className="text-ink-2">Banco</span><Bar pct={(view.size / limit) * 100} /><span className="num text-xs text-ink-3">{fmtBytes(view.size)} de {fmtBytes(limit)}</span></div>
          </div>
        ) : (
          <table className="num w-full max-w-md text-sm"><tbody>
            {lines.map(([l, v]) => <tr key={l} className="border-b border-line"><td className="py-1.5 text-ink-2">{l}</td><td className="py-1.5 text-right">{v}</td></tr>)}
            <tr><td className="py-1.5 font-semibold">Total estimado</td><td className="py-1.5 text-right font-semibold">{usd(cost)}</td></tr>
          </tbody></table>
        )}
        <p className="num text-xs text-ink-3">Projeção do mês: {fmtN(Math.round(reqM))} pedidos · {fmtN(Math.round(wM))} gravações. {P.note}</p>
        <p className="text-xs text-ink-3">
          {Number.isFinite(daysLeft) ? `Com o ritmo atual de leituras (~${fmtBytes(view.perDay)}/dia) o banco enche em cerca de ${fmtN(daysLeft)} dias.` : 'Ainda sem histórico suficiente para projetar o crescimento.'} Leituras com mais de {s.retention.readingsDays} dias são apagadas sozinhas (o resumo por hora fica {s.retention.hourlyDays} dias, eventos {s.retention.eventsDays}).
        </p>
      </Section>

      <Section title="Acessos e uso" hint="Últimos 30 dias. Contagem do servidor, no horário de Brasília; a página inicial conta como uma visita por carregamento da lista de estações.">
        <div className="grid gap-4 lg:grid-cols-2">
          {([['visitors', 'Visitantes únicos por dia', '#38bdf8', true], ['visit', 'Carregamentos da lista de estações', '#a78bfa', true], ['view', 'Gráficos de estação abertos', '#4ade80', true], ['ingest', 'Envios das estações', '#fb923c', true], ['req', 'Pedidos à API', '#60a5fa', true], ['err', 'Erros do servidor (5xx)', '#f87171', true]] as const).map(([k, title, color]) => (
            <div key={k} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-baseline justify-between"><h3 className="text-sm font-semibold">{title}</h3><span className="num text-xs text-ink-3">hoje {fmtN(view.today[k] ?? 0)} · 30 dias {fmtN(view.sum(k, 30))}</span></div>
              <Chart unit="" decimals={0} zeroBase height={120} zoomKey={k} series={[{ label: title, color, bar: true, points: view.series(k) }]} />
            </div>
          ))}
        </div>
        <p className="num text-xs text-ink-3">Logins hoje: {fmtN(view.today.login ?? 0)} · negados (401/403) hoje: {fmtN(view.today.denied ?? 0)} · conexões em tempo real hoje: {fmtN(view.today.ws ?? 0)} · usuários: {s.users.total} ({s.users.admins} admin){s.users.lastLogin ? ` · último login ${ago(s.users.lastLogin)}` : ''}</p>
        {!view.keys.length && <p className="text-sm text-warn">Ainda sem contadores. Rode a migração 0006_metricas.sql no D1 e aguarde alguns minutos de uso.</p>}
      </Section>

      <Section title="Ocupação do banco" hint={s.db.exact ? 'Espaço medido por tabela.' : 'O D1 não informa o espaço por tabela: os tamanhos abaixo são estimados pelo número de linhas. O total do banco é o medido pela Cloudflare.'}>
        <div className="grid gap-2">
          {[...s.db.tables].sort((a, b) => b.bytes - a.bytes).map((t) => (
            <div key={t.name} className="grid grid-cols-[9rem_1fr_9rem] items-center gap-3 text-sm">
              <span className="num truncate text-ink-2">{t.name}</span>
              <Bar pct={view.tableBytes ? (t.bytes / view.tableBytes) * 100 : 0} />
              <span className="num text-right text-xs text-ink-3">{fmtN(t.rows)} linhas · {t.exact ? '' : '~'}{fmtBytes(t.bytes)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cada estação" hint="Cobertura das últimas 24 h: leituras recebidas em relação ao esperado pelo intervalo configurado. Cobertura baixa com a estação 'vista' costuma ser a placa dormindo (bateria) ou perdendo o lote.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="num w-full min-w-[720px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['Estação', 'Leituras', 'Desde', 'Espaço (~)', 'Últimas 24 h', 'Cobertura', 'Eventos', 'Visto'].map((h) => <th key={h} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {s.perStation.map((p) => {
                const cov = Math.round((p.n24 / Math.max(1, p.expected24)) * 100)
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2"><b className="font-sans font-semibold">{p.name}</b></td>
                    <td className="px-3 py-2">{fmtN(p.rows)}</td>
                    <td className="px-3 py-2">{fmtDate(p.oldest)}</td>
                    <td className="px-3 py-2">{fmtBytes(p.bytes)}</td>
                    <td className="px-3 py-2">{fmtN(p.n24)} / {fmtN(p.expected24)}</td>
                    <td className={`px-3 py-2 ${cov < 50 ? 'text-bad' : cov < 90 ? 'text-warn' : 'text-ok'}`}>{cov}%</td>
                    <td className="px-3 py-2">{fmtN(p.events)}</td>
                    <td className="px-3 py-2">{p.last_seen ? ago(p.last_seen) : 'nunca'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Backup tables={s.db.tables} />
      <div><button className={`${input} cursor-pointer`} onClick={reload}>Atualizar números</button></div>
    </div>
  )
}
