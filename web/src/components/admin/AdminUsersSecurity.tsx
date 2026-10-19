import { Copy, KeyRound, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getAudit, listUsers, removeUser, restoreAdminToken, revokeSessions, rotateAdminToken, setStationOwner, setUserRole, type AdminStation } from '../../lib/admin'
import { ago } from '../../lib/derive'
import { useSession } from '../../lib/session'
import { btn, btnMain, errText, input, Msg, Section, useLoad } from './ui'

export function AdminUsers({ stations, onChanged }: { stations: AdminStation[]; onChanged: () => void }) {
  const me = useSession().user
  const { data: users, error, reload } = useLoad(listUsers, false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [owner, setOwner] = useState<Record<string, string>>({})

  const run = async (f: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try { await f(); setMsg({ ok: true, text: ok }); reload(); onChanged() } catch (e) { setMsg({ ok: false, text: errText(e) }) }
  }

  return (
    <div className="grid gap-4">
      <Section title="Usuários" hint="Quem entrou com o Google. Usuário comum cadastra e altera só as próprias estações; administrador altera tudo.">
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="num w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['Usuário', 'Papel', 'Estações', 'Último acesso', ''].map((h, i) => <th key={i} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.email} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><b className="font-sans font-semibold">{u.name || u.email}</b><div className="text-xs text-ink-3">{u.email}</div></td>
                  <td className="px-3 py-2">
                    <select className={input} value={u.role} disabled={u.email === me?.email} onChange={(e) => void run(() => setUserRole(u.email, e.target.value as 'admin' | 'user'), `${u.email} agora é ${e.target.value === 'admin' ? 'administrador' : 'usuário comum'}.`)} aria-label={`papel de ${u.email}`}>
                      <option value="user">Usuário</option><option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">{u.stations}</td>
                  <td className="px-3 py-2">{ago(u.last_login)}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-bad disabled:opacity-40" disabled={u.email === me?.email} onClick={() => { if (window.confirm(`Remover ${u.email}? As estações dele ficam sem dono (só administradores mexem).`)) void run(() => removeUser(u.email), 'Usuário removido.') }}><Trash2 className="h-3.5 w-3.5" aria-hidden /> remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Msg m={msg} />
      </Section>

      <Section title="Donos das estações" hint="Passe uma estação para outra conta (por e-mail) ou deixe-a sem dono.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="num w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['Estação', 'Dono', 'Novo dono', ''].map((h, i) => <th key={i} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-sans font-semibold">{s.name}</td>
                  <td className="px-3 py-2 text-ink-2">{s.owner_email ?? 'sem dono'}</td>
                  <td className="px-3 py-2"><input className={`${input} w-56`} type="email" placeholder="e-mail do novo dono" value={owner[s.id] ?? ''} onChange={(e) => setOwner({ ...owner, [s.id]: e.target.value })} aria-label={`novo dono de ${s.name}`} /></td>
                  <td className="px-3 py-2 text-right">
                    <button className={btn} onClick={() => void run(() => setStationOwner(s.id, owner[s.id] ?? ''), owner[s.id] ? 'Dono alterado.' : 'Estação sem dono.')}>{owner[s.id] ? 'Transferir' : 'Tirar o dono'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

const loadAudit = () => getAudit(150) // referência estável: o useLoad recarrega quando ela muda

export function AdminSecurity() {
  const [newToken, setNewToken] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const { data: audit, reload } = useLoad(loadAudit, false)

  const run = async (f: () => Promise<string>) => { setMsg(null); try { setMsg({ ok: true, text: await f() }); reload() } catch (e) { setMsg({ ok: false, text: errText(e) }) } }

  return (
    <div className="grid gap-4">
      <Section title="Token de administrador" hint="Usado só por scripts e pela API (assina os pedidos; nunca viaja). Quem entra com o Google não precisa dele.">
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnMain} onClick={() => { if (window.confirm('Gerar um token novo? O anterior deixa de valer na hora.')) void run(async () => { setNewToken((await rotateAdminToken()).token); return 'Token trocado. Copie agora: ele não é mostrado de novo.' }) }}><KeyRound className="mr-1.5 inline h-4 w-4" aria-hidden />Gerar token novo</button>
          <button className={btn} onClick={() => { if (window.confirm('Voltar a valer o segredo ADMIN_TOKEN do Worker (o token gerado aqui deixa de valer)?')) void run(async () => { await restoreAdminToken(); setNewToken(''); return 'Voltou a valer o segredo ADMIN_TOKEN do Worker.' }) }}>Voltar ao token do Worker</button>
        </div>
        {newToken && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg p-3">
            <code className="num min-w-0 flex-1 break-all text-cyan">{newToken}</code>
            <button className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover" onClick={() => void navigator.clipboard.writeText(newToken)}><Copy className="h-3.5 w-3.5" aria-hidden /> Copiar</button>
          </div>
        )}
        <Msg m={msg} />
      </Section>

      <Section title="Sessões" hint="Encerra o login de todos os usuários, inclusive o seu. Use se suspeitar que alguém entrou indevidamente.">
        <div><button className={btn} onClick={() => { if (window.confirm('Encerrar todas as sessões? Todos precisarão entrar de novo.')) void run(async () => { await revokeSessions(); return 'Sessões encerradas. Entre de novo.' }) }}><LogOut className="mr-1.5 inline h-4 w-4" aria-hidden />Encerrar todas as sessões</button></div>
      </Section>

      <Section title="Registro de atividades" hint="Quem fez o quê: acessos, alterações de configuração, firmware, usuários e token.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="num w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{['Quando', 'Quem', 'Ação', 'Alvo', 'Detalhe'].map((h) => <th key={h} className="border-b border-line px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {(audit ?? []).map((a, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5">{ago(a.ts)}</td>
                  <td className="px-3 py-1.5">{a.actor}</td>
                  <td className="px-3 py-1.5"><ShieldCheck className="mr-1 inline h-3 w-3 text-cyan" aria-hidden />{a.action}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5" title={a.target}>{a.target}</td>
                  <td className="max-w-[240px] truncate px-3 py-1.5 font-sans text-xs text-ink-2" title={a.detail}>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
