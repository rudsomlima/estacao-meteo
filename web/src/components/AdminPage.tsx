import { useState } from 'react'
import { go } from '../hooks/useRoute'
import { useNow } from '../hooks/useNow'
import { getOverview, type AdminStation } from '../lib/admin'
import { ago, isSeen } from '../lib/derive'
import { store } from '../lib/api'
import { useSession } from '../lib/session'
import AdminConfig from './admin/AdminConfig'
import AdminFirmware from './admin/AdminFirmware'
import AdminSite from './admin/AdminSite'
import type { Source, Station } from '../types'
import { AdminSecurity, AdminUsers } from './admin/AdminUsersSecurity'
import { Section, useLoad } from './admin/ui'
import { signInDev } from '../lib/auth'
import GoogleLogin from './GoogleLogin'

const TABS = [
  ['geral', 'Visão geral'],
  ['config', 'Configuração'],
  ['firmware', 'Firmware'],
  ['site', 'Site e placas'],
  ['usuarios', 'Usuários'],
  ['seguranca', 'Segurança'],
] as const
type Tab = (typeof TABS)[number][0]
const TAB_KEY = 'meteo.admin.tab'

function Overview({ stations, users }: { stations: AdminStation[]; users: number }) {
  useNow()
  const seen = stations.filter((s) => isSeen({ last_seen: s.last_seen, config: { interval_min: 10, send_every: 3 } })).length
  const pending = stations.filter((s) => s.cfg_version !== s.cfg_applied || (s.command && !s.command.done)).length
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[['Estações', stations.length], ['Falaram há pouco', seen], ['Mudanças pendentes', pending], ['Usuários', users]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-line bg-card p-4"><p className="num text-xs text-ink-3">{l}</p><p className="font-display text-3xl font-bold">{v}</p></div>
        ))}
      </div>
      <Section title="Todas as estações" hint="Clique numa linha para abrir a estação. O andamento das atualizações de firmware fica na aba Firmware.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="num w-full min-w-[760px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['Estação', 'Dono', 'Visto', 'Firmware', 'Configuração', 'Comando', 'Bateria', 'Wi-Fi'].map((h) => <th key={h} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.id} tabIndex={0} onClick={() => go(`s/${s.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`s/${s.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-card-hover">
                  <td className="px-3 py-2"><b className="font-sans font-semibold">{s.name}</b><div className="text-xs text-ink-3">{s.city}</div></td>
                  <td className="px-3 py-2 text-ink-2">{s.owner_email ?? <i className="text-ink-3">sem dono</i>}</td>
                  <td className="px-3 py-2">{s.last_seen ? ago(s.last_seen) : 'nunca'}</td>
                  <td className="px-3 py-2">{s.fw_version ?? '—'}</td>
                  <td className="px-3 py-2">v{s.cfg_version}{s.cfg_version !== s.cfg_applied ? <span className="text-warn"> (a estação tem v{s.cfg_applied}: aguardando)</span> : <span className="text-ok"> aplicada{s.cfg_applied_at ? ` ${ago(s.cfg_applied_at)}` : ''}</span>}</td>
                  <td className={`px-3 py-2 text-xs ${s.command?.done ? 'text-ok' : s.command ? 'text-warn' : 'text-ink-3'}`}>{s.command ? (s.command.done ? 'reinício confirmado' : s.command.sent ? 'reinício entregue, sem confirmação' : 'reinício pedido') : '—'}</td>
                  <td className="px-3 py-2">{s.vbat != null && s.vbat > 1 ? `${s.vbat.toFixed(2)} V` : '—'}</td>
                  <td className="px-3 py-2">{s.rssi != null ? `${s.rssi} dBm` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

/** Painel do administrador: todas as estações, configuração em massa, firmware com acompanhamento, usuários e segurança. */
export default function AdminPage({ stations, source }: { stations: Station[]; source: Source }) {
  const { user, clientId, loaded, devLogin } = useSession()
  const [tab, setTab] = useState<Tab>(() => (TABS.some(([k]) => k === store.get(TAB_KEY)) ? (store.get(TAB_KEY) as Tab) : 'geral'))
  const { data, error, reload } = useLoad(getOverview, user?.role === 'admin')

  const pick = (t: Tab) => { setTab(t); store.set(TAB_KEY, t) }

  if (!loaded) return <div className="px-4 pt-24 text-sm text-ink-3">Carregando…</div>
  if (!clientId && !devLogin) return <div className="mx-auto max-w-2xl px-4 pt-24"><h1 className="font-display text-3xl font-bold">Administração</h1><p className="mt-3 text-ink-2">O login com Google não está configurado neste servidor (<span className="num">GOOGLE_CLIENT_ID</span>).</p></div>
  if (!user) return (
    <div className="mx-auto max-w-2xl px-4 pt-24">
      <h1 className="font-display text-3xl font-bold">Administração</h1>
      <p className="mt-3 text-ink-2">Entre com a conta Google de administrador.</p>
      <div className="mt-4 grid gap-3">
        {clientId && <GoogleLogin />}
        {devLogin && <button onClick={() => void signInDev('admin')} className="w-fit rounded-xl border border-line px-4 py-2 text-sm hover:bg-card-hover">Entrar como administrador (modo dev, sem senha)</button>}
      </div>
    </div>
  )
  if (user.role !== 'admin') return <div className="mx-auto max-w-2xl px-4 pt-24"><h1 className="font-display text-3xl font-bold">Administração</h1><p className="mt-3 text-ink-2">A conta <b>{user.email}</b> não é administradora.</p></div>

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6">
      <p className="num text-xs text-ink-3">{user.email}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Administração</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Todas as estações, os ajustes que valem para várias de uma vez, o firmware com o resultado em cada uma, os usuários e a segurança.</p>

      <div role="tablist" aria-label="Seções" className="mt-8 flex flex-wrap gap-1.5">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)} className={`rounded-lg border px-4 py-2 text-sm transition-colors ${tab === k ? 'border-cyan bg-cyan text-[#03212d]' : 'border-line text-ink-2 hover:border-line-hover hover:text-ink'}`}>{label}</button>
        ))}
      </div>

      <div className="mt-6">
        {error && <p role="alert" className="mb-4 text-sm text-bad">{error}</p>}
        {!data ? <p className="text-sm text-ink-3">Carregando…</p> : tab === 'geral' ? <Overview stations={data.stations} users={data.users} />
          : tab === 'config' ? <AdminConfig stations={data.stations} />
          : tab === 'firmware' ? <AdminFirmware stations={data.stations} />
          : tab === 'site' ? <AdminSite stations={stations} source={source} />
          : tab === 'usuarios' ? <AdminUsers stations={data.stations} onChanged={reload} />
          : <AdminSecurity />}
      </div>
    </div>
  )
}
