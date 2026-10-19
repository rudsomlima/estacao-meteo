/**
 * Rotas do administrador (/api/admin/*): visão geral, configuração em massa e padrão para estações novas, firmware com
 * acompanhamento por estação, usuários, token de administrador e registro de auditoria. Tudo exige papel "admin".
 */
import { audit, type Actor, getSetting, putSetting, revokeSessions, rotateAdminToken } from './auth'
import { sha256Hex, toBase64 } from './crypto'
import { notifyLive } from './hub'
import { type Config, DEFAULT_CONFIG, type Env, json, LIMITS } from './shared'
import { cleanConfig, pinProblem } from './config'

const MAX_FIRMWARE = 1_600_000
const CHUNK = 192 * 1024
const dec = new TextDecoder()

interface StationLite { id: string; name: string; owner_email: string | null; config: string; last_seen: number | null; fw_version: string | null; cfg_applied: number; vbat: number | null; rssi: number | null }

const parse = (raw: Uint8Array): Record<string, unknown> | null => {
  try { const b = JSON.parse(dec.decode(raw)); return b && typeof b === 'object' && !Array.isArray(b) ? b : null } catch { return null }
}

/** Configuração padrão das estações novas: a do servidor (DEFAULT_CONFIG) com o que o administrador mudou. */
export async function defaultConfig(env: Env): Promise<Config> {
  const saved = await getSetting(env, 'default_config')
  return cleanConfig(saved ? (JSON.parse(saved) as Record<string, unknown>) : {}, DEFAULT_CONFIG)
}
/** Resolve "todas" ou uma lista de ids para estações que existem. */
async function targets(env: Env, ids: unknown): Promise<StationLite[]> {
  const { results } = await env.DB.prepare('SELECT id, name, owner_email, config, last_seen, fw_version, cfg_applied, vbat, rssi FROM stations ORDER BY name').all<StationLite>()
  if (ids === 'all') return results
  if (!Array.isArray(ids)) return []
  const want = new Set(ids.filter((x): x is string => typeof x === 'string'))
  return results.filter((s) => want.has(s.id))
}

// ---------------- visão geral ----------------
async function overview(env: Env) {
  const [st, users, assign] = await Promise.all([
    env.DB.prepare('SELECT id, name, city, owner_email, config, last_seen, fw_version, cfg_applied, cfg_applied_at, vbat, rssi, created_at, cmd, cmd_at, cmd_sent, cmd_done FROM stations ORDER BY name').all<StationLite & { city: string; created_at: number; cfg_applied_at: number | null; cmd: string | null; cmd_at: number | null; cmd_sent: number | null; cmd_done: number | null }>(),
    env.DB.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    env.DB.prepare('SELECT a.station_id, r.version FROM fw_assign a JOIN releases r ON r.id = a.release_id').all<{ station_id: string; version: string }>(),
  ])
  const target = new Map(assign.results.map((a) => [a.station_id, a.version]))
  return json({
    users: users?.n ?? 0,
    stations: st.results.map((s) => {
      const c = JSON.parse(s.config) as Config
      return { id: s.id, name: s.name, city: s.city, owner_email: s.owner_email, last_seen: s.last_seen, fw_version: s.fw_version, fw_target: target.get(s.id) ?? null, cfg_version: c.version, cfg_applied: s.cfg_applied, cfg_applied_at: s.cfg_applied_at, command: s.cmd ? { name: s.cmd, at: s.cmd_at, sent: s.cmd_sent, done: s.cmd_done } : null, vbat: s.vbat, rssi: s.rssi, created_at: s.created_at }
    }),
  })
}

// ---------------- configuração em massa ----------------
async function bulkConfig(env: Env, actor: Actor, raw: Uint8Array) {
  const body = parse(raw)
  if (!body || typeof body.config !== 'object' || !body.config) return json({ error: 'informe "config" e "ids" ("all" ou uma lista)' }, 422)
  const patch = body.config as Record<string, unknown>
  const fields = Object.keys(patch).filter((k) => k in LIMITS || k === 'battery_chem')
  if (!fields.length) return json({ error: 'nenhum campo de configuração válido' }, 422)
  const list = await targets(env, body.ids)
  if (!list.length) return json({ error: 'nenhuma estação selecionada' }, 422)
  const only: Record<string, unknown> = Object.fromEntries(fields.map((k) => [k, patch[k]]))
  const stmts: D1PreparedStatement[] = []
  for (const s of list) {
    const old = JSON.parse(s.config) as Config
    const cfg = { ...cleanConfig(only, old), version: old.version + 1 }
    const bad = pinProblem(cfg)
    if (bad) return json({ error: `${s.id}: ${bad}` }, 422)
    stmts.push( env.DB.prepare('UPDATE stations SET config = ? WHERE id = ?').bind(JSON.stringify(cfg), s.id))
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50))
  await audit(env, actor, 'config.massa', body.ids === 'all' ? 'todas' : list.map((s) => s.id).join(','), fields.join(','))
  await notifyLive(env, null)
  return json({ ok: true, updated: list.length, fields })
}

async function getDefaults(env: Env) {
  return json({ config: await defaultConfig(env) })
}
async function putDefaults(env: Env, actor: Actor, raw: Uint8Array) {
  const body = parse(raw)
  if (!body) return json({ error: 'JSON inválido' }, 400)
  if (body.config && typeof body.config === 'object') {
    const cfg = cleanConfig(body.config as Record<string, unknown>, await defaultConfig(env))
    const { version: _v, ...rest } = cfg
    await putSetting(env, 'default_config', JSON.stringify(rest))
  }
  await audit(env, actor, 'padroes.alterados')
  return getDefaults(env)
}

// ---------------- firmware ----------------
async function listReleases(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.version, r.size, r.sha256, r.notes, r.created_by, r.created_at, (SELECT COUNT(*) FROM fw_assign a WHERE a.release_id = r.id) AS assigned
     FROM releases r ORDER BY r.id DESC`,
  ).all()
  return json(results)
}

async function createRelease(url: URL, env: Env, actor: Actor, raw: Uint8Array) {
  const version = (url.searchParams.get('version') ?? '').trim()
  const notes = (url.searchParams.get('notes') ?? '').trim().slice(0, 300)
  if (!/^[\w.+-]{1,40}$/.test(version)) return json({ error: 'informe a versão (letras, números, ponto, hífen)' }, 422)
  if (raw.length < 100_000 || raw.length > MAX_FIRMWARE) return json({ error: `o firmware deve ter entre 100 KB e ${Math.round(MAX_FIRMWARE / 1000)} KB` }, 422)
  if (raw[0] !== 0xe9) return json({ error: 'o arquivo não parece um firmware de ESP32 (não começa com 0xE9)' }, 422)
  const sha = await sha256Hex(raw)
  const n = Math.ceil(raw.length / CHUNK)
  const r = await env.DB.prepare('INSERT INTO releases (version, size, sha256, chunks, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(version, raw.length, sha, n, notes, actor.email ?? 'token-admin', Math.floor(Date.now() / 1000)).run()
  const id = Number(r.meta.last_row_id)
  const stmts: D1PreparedStatement[] = []
  for (let i = 0; i < n; i++) stmts.push(env.DB.prepare('INSERT INTO release_chunks (release_id, idx, data) VALUES (?,?,?)').bind(id, i, toBase64(raw.subarray(i * CHUNK, (i + 1) * CHUNK))))
  await env.DB.batch(stmts)
  await audit(env, actor, 'firmware.nova', `${id}`, `${version} ${raw.length} bytes`)
  return json({ id, version, size: raw.length, sha256: sha }, 201)
}

async function deleteRelease(env: Env, actor: Actor, id: number) {
  const used = await env.DB.prepare('SELECT COUNT(*) n FROM fw_assign WHERE release_id = ?').bind(id).first<{ n: number }>()
  if ((used?.n ?? 0) > 0) return json({ error: 'a versão está atribuída a estações: retire a atribuição antes' }, 409)
  await env.DB.batch([env.DB.prepare('DELETE FROM release_chunks WHERE release_id = ?').bind(id), env.DB.prepare('DELETE FROM releases WHERE id = ?').bind(id)])
  await audit(env, actor, 'firmware.removida', `${id}`)
  return json({ ok: true })
}

async function assign(env: Env, actor: Actor, id: number, raw: Uint8Array) {
  const rel = await env.DB.prepare('SELECT version FROM releases WHERE id = ?').bind(id).first<{ version: string }>()
  if (!rel) return json({ error: 'versão não encontrada' }, 404)
  const list = await targets(env, parse(raw)?.ids)
  if (!list.length) return json({ error: 'nenhuma estação selecionada' }, 422)
  const now = Math.floor(Date.now() / 1000)
  const ins = env.DB.prepare('INSERT INTO fw_assign (station_id, release_id, assigned_at) VALUES (?,?,?) ON CONFLICT(station_id) DO UPDATE SET release_id = excluded.release_id, assigned_at = excluded.assigned_at')
  for (let i = 0; i < list.length; i += 50) await env.DB.batch(list.slice(i, i + 50).map((s) => ins.bind(s.id, id, now)))
  await audit(env, actor, 'firmware.atribuida', list.map((s) => s.id).join(','), rel.version)
  await notifyLive(env, null)
  return json({ ok: true, assigned: list.length, version: rel.version })
}

async function unassign(env: Env, actor: Actor, raw: Uint8Array) {
  const list = await targets(env, parse(raw)?.ids)
  if (!list.length) return json({ error: 'nenhuma estação selecionada' }, 422)
  const del = env.DB.prepare('DELETE FROM fw_assign WHERE station_id = ?')
  for (let i = 0; i < list.length; i += 50) await env.DB.batch(list.slice(i, i + 50).map((s) => del.bind(s.id)))
  await audit(env, actor, 'firmware.retirada', list.map((s) => s.id).join(','))
  await notifyLive(env, null)
  return json({ ok: true, unassigned: list.length })
}

/**
 * Como foi a atualização em cada estação: "ok" (a estação já informa a versão nova), "falhou" (houve evento ota_fail depois de
 * atribuir) ou "aguardando" (ainda não atualizou; `contato` diz se ela falou com o servidor depois de atribuir).
 */
async function rollout(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT a.station_id id, s.name, s.fw_version, s.last_seen, a.assigned_at, r.id release_id, r.version target
     FROM fw_assign a JOIN stations s ON s.id = a.station_id JOIN releases r ON r.id = a.release_id ORDER BY s.name`,
  ).all<{ id: string; name: string; fw_version: string | null; last_seen: number | null; assigned_at: number; release_id: number; target: string }>()
  const fails = await env.DB.prepare(
    `SELECT e.station_id id, e.ts, e.data FROM events e JOIN fw_assign a ON a.station_id = e.station_id
     WHERE e.kind = 'ota_fail' AND e.ts >= a.assigned_at ORDER BY e.ts DESC`,
  ).all<{ id: string; ts: number; data: string }>()
  const failBy = new Map<string, { ts: number; data: Record<string, unknown> }>()
  for (const f of fails.results) if (!failBy.has(f.id)) failBy.set(f.id, { ts: f.ts, data: JSON.parse(f.data) as Record<string, unknown> })
  const rows = results.map((r) => {
    const fail = failBy.get(r.id)
    const status = r.fw_version === r.target ? 'ok' : fail ? 'falhou' : 'aguardando'
    return {
      id: r.id, name: r.name, target: r.target, release_id: r.release_id, installed: r.fw_version, assigned_at: r.assigned_at, last_seen: r.last_seen, status,
      contact: !!r.last_seen && r.last_seen >= r.assigned_at, fail: status === 'falhou' ? { ts: fail!.ts, stage: fail!.data.stage ?? null, http: fail!.data.http ?? null } : null,
    }
  })
  const count = (s: string) => rows.filter((r) => r.status === s).length
  return json({ summary: { total: rows.length, ok: count('ok'), falhou: count('falhou'), aguardando: count('aguardando') }, stations: rows })
}

// ---------------- usuários ----------------
async function listUsers(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT u.email, u.name, u.picture, u.role, u.created_at, u.last_login, (SELECT COUNT(*) FROM stations s WHERE s.owner_email = u.email) AS stations
     FROM users u ORDER BY u.role, u.email`,
  ).all()
  return json(results)
}

/** Cadastra um e-mail antes de a pessoa entrar (por exemplo um novo administrador): no primeiro login com o Google ela já entra com o papel. */
async function addUser(env: Env, actor: Actor, raw: Uint8Array) {
  const body = parse(raw)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body?.role === 'user' ? 'user' : 'admin'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'e-mail inválido' }, 422)
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `INSERT INTO users (email, name, picture, role, created_at, last_login) VALUES (?, '', '', ?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET role = excluded.role`,
  ).bind(email, role, now).run()
  await audit(env, actor, 'usuario.adicionado', email, role)
  return json({ ok: true, email, role }, 201)
}

async function updateUser(env: Env, actor: Actor, email: string, raw: Uint8Array) {
  const body = parse(raw)
  if (body?.role !== 'admin' && body?.role !== 'user') return json({ error: 'role precisa ser "admin" ou "user"' }, 422)
  if (actor.email === email && body.role !== 'admin') return json({ error: 'você não pode tirar o próprio papel de administrador' }, 409)
  const r = await env.DB.prepare('UPDATE users SET role = ? WHERE email = ?').bind(body.role, email).run()
  if (!r.meta.changes) return json({ error: 'usuário não encontrado' }, 404)
  await audit(env, actor, 'usuario.papel', email, String(body.role))
  return json({ ok: true })
}

async function deleteUser(env: Env, actor: Actor, email: string) {
  if (actor.email === email) return json({ error: 'você não pode remover a si mesmo' }, 409)
  // as estações dele ficam sem dono (só administradores mexem) em vez de sumirem
  await env.DB.batch([env.DB.prepare('UPDATE stations SET owner_email = NULL WHERE owner_email = ?').bind(email), env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email)])
  await audit(env, actor, 'usuario.removido', email)
  await notifyLive(env, null)
  return json({ ok: true })
}

async function setOwner(env: Env, actor: Actor, id: string, raw: Uint8Array) {
  const email = typeof parse(raw)?.email === 'string' ? String(parse(raw)!.email).trim().toLowerCase() : ''
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'e-mail inválido' }, 422)
  const r = await env.DB.prepare('UPDATE stations SET owner_email = ? WHERE id = ?').bind(email || null, id).run()
  if (!r.meta.changes) return json({ error: 'estação não encontrada' }, 404)
  await audit(env, actor, 'estacao.dono', id, email || '(sem dono)')
  await notifyLive(env, id)
  return json({ ok: true })
}

// ---------------- comandos para a estação ----------------
/** Pede que a estação reinicie. Ela recebe no próximo envio; a confirmação é o reinício dela, que chega no envio seguinte. */
async function restartStation(env: Env, actor: Actor, id: string) {
  const now = Math.floor(Date.now() / 1000)
  const r = await env.DB.prepare("UPDATE stations SET cmd = 'restart', cmd_at = ?, cmd_sent = NULL, cmd_done = NULL WHERE id = ?").bind(now, id).run()
  if (!r.meta.changes) return json({ error: 'estação não encontrada' }, 404)
  await audit(env, actor, 'estacao.reiniciar', id)
  await notifyLive(env, id)
  return json({ ok: true, requested_at: now })
}

async function cancelCommand(env: Env, actor: Actor, id: string) {
  await env.DB.prepare('UPDATE stations SET cmd = NULL, cmd_at = NULL, cmd_sent = NULL, cmd_done = NULL WHERE id = ?').bind(id).run()
  await audit(env, actor, 'estacao.comando.cancelado', id)
  await notifyLive(env, id)
  return json({ ok: true })
}

/** Apaga os eventos (reinícios, atualizações, modo bancada) de uma estação: zera o diagnóstico. */
async function clearEvents(env: Env, actor: Actor, id: string) {
  const r = await env.DB.prepare('DELETE FROM events WHERE station_id = ?').bind(id).run()
  await audit(env, actor, 'estacao.eventos.limpos', id, `${r.meta.changes} eventos`)
  await notifyLive(env, id)
  return json({ ok: true, removed: r.meta.changes })
}

// ---------------- segurança e auditoria ----------------
async function auditLog(url: URL, env: Env) {
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
  const { results } = await env.DB.prepare('SELECT ts, actor, action, target, detail FROM audit ORDER BY id DESC LIMIT ?').bind(limit).all()
  return json(results)
}

export async function adminRoute(req: Request, env: Env, actor: Actor, raw: Uint8Array): Promise<Response | null> {
  const url = new URL(req.url)
  const p = url.pathname.replace(/^\/api\/admin/, '')
  const m = req.method

  if (p === '/overview' && m === 'GET') return overview(env)
  if (p === '/config' && m === 'POST') return bulkConfig(env, actor, raw)
  if (p === '/defaults' && m === 'GET') return getDefaults(env)
  if (p === '/defaults' && m === 'PUT') return putDefaults(env, actor, raw)

  if (p === '/releases' && m === 'GET') return listReleases(env)
  if (p === '/releases' && m === 'POST') return createRelease(url, env, actor, raw)
  if (p === '/releases/unassign' && m === 'POST') return unassign(env, actor, raw)
  if (p === '/rollout' && m === 'GET') return rollout(env)
  const rel = p.match(/^\/releases\/(\d+)(?:\/(assign))?$/)
  if (rel) {
    const id = Number(rel[1])
    if (rel[2] === 'assign' && m === 'POST') return assign(env, actor, id, raw)
    if (!rel[2] && m === 'DELETE') return deleteRelease(env, actor, id)
  }

  if (p === '/users' && m === 'GET') return listUsers(env)
  if (p === '/users' && m === 'POST') return addUser(env, actor, raw)
  const usr = p.match(/^\/users\/([^/]+)$/)
  if (usr) {
    const email = decodeURIComponent(usr[1]).toLowerCase()
    if (m === 'PUT') return updateUser(env, actor, email, raw)
    if (m === 'DELETE') return deleteUser(env, actor, email)
  }
  const cmd = p.match(/^\/stations\/([a-z0-9-]+)\/(restart|command|events)$/)
  if (cmd) {
    if (cmd[2] === 'restart' && m === 'POST') return restartStation(env, actor, cmd[1])
    if (cmd[2] === 'command' && m === 'DELETE') return cancelCommand(env, actor, cmd[1])
    if (cmd[2] === 'events' && m === 'DELETE') return clearEvents(env, actor, cmd[1])
  }
  const own = p.match(/^\/stations\/([a-z0-9-]+)\/owner$/)
  if (own && m === 'PUT') return setOwner(env, actor, own[1], raw)

  if (p === '/token/rotate' && m === 'POST') {
    const token = await rotateAdminToken(env)
    await audit(env, actor, 'token.trocado')
    return json({ token })
  }
  if (p === '/token' && m === 'DELETE') {
    await env.DB.prepare("DELETE FROM settings WHERE key = 'admin_token'").run()
    await audit(env, actor, 'token.restaurado', '', 'volta a valer o segredo ADMIN_TOKEN do Worker')
    return json({ ok: true })
  }
  if (p === '/sessions/revoke' && m === 'POST') {
    await revokeSessions(env)
    await audit(env, actor, 'sessoes.encerradas')
    return json({ ok: true })
  }
  if (p === '/audit' && m === 'GET') return auditLog(url, env)
  return null
}
