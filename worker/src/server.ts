/**
 * Painel "Servidor" do administrador: ocupação do banco, uso (acessos, envios, gravações), cobertura das estações e backup.
 *
 *  - Contadores: cada isolate do Worker soma em memória e grava em `metrics` (um UPSERT por chave) no máximo a cada 30 s,
 *    para não gastar uma gravação do D1 por pedido. O que ainda está na memória quando o isolate é descartado se perde,
 *    então os números são uma estimativa (para menos). Visitantes únicos: hash do IP + dia, que muda todo dia.
 *  - Backup: o navegador pede o banco em pedaços (tabela + cursor) e monta o arquivo .sql; cada pedido é curto, cabe no
 *    limite de CPU do plano gratuito.
 */
import { sha256Hex } from './crypto'
import { json, type Config, type Env } from './shared'

// ---------------- contadores ----------------
const buf = new Map<string, number>()
const visitors = new Set<string>()
let lastFlush = 0
const FLUSH_MS = 30_000

/** Dia no horário de Brasília (UTC-3), que é o dia que o painel mostra. */
export const dayKey = (ts = Date.now()) => new Date(ts - 3 * 3600_000).toISOString().slice(0, 10)

export function count(key: string, n = 1) {
  buf.set(key, (buf.get(key) ?? 0) + n)
}

/** Registra um pedido da API. `visit` é a lista de estações (a página inicial), contada também por visitante. */
export async function noteRequest(req: Request, path: string, status: number) {
  count('req')
  if (status >= 500) count('err')
  else if (status === 401 || status === 403) count('denied')
  if (path === '/api/ingest') count('ingest')
  else if (path === '/api/live') count('ws')
  else if (req.method === 'GET' && path === '/api/stations') {
    count('visit')
    const ip = req.headers.get('cf-connecting-ip')
    if (ip) visitors.add((await sha256Hex(`${ip}|${dayKey()}`)).slice(0, 16))
  } else if (req.method === 'GET' && /^\/api\/stations\/[a-z0-9-]+\/readings$/.test(path)) count('view')
}

/** Grava os contadores acumulados, no máximo a cada 30 s por isolate. Falhar (tabela ainda não migrada) não derruba o pedido. */
export function flushMetrics(env: Env, ctx: ExecutionContext) {
  const now = Date.now()
  if (now - lastFlush < FLUSH_MS || (!buf.size && !visitors.size)) return
  lastFlush = now
  const day = dayKey(now)
  const up = env.DB.prepare('INSERT INTO metrics (day, k, n) VALUES (?,?,?) ON CONFLICT(day, k) DO UPDATE SET n = n + excluded.n')
  const vis = env.DB.prepare('INSERT OR IGNORE INTO visitors (day, h) VALUES (?,?)')
  const stmts = [...[...buf].map(([k, n]) => up.bind(day, k, n)), ...[...visitors].map((h) => vis.bind(day, h))]
  buf.clear(); visitors.clear()
  ctx.waitUntil(env.DB.batch(stmts).then(() => undefined, (e) => console.warn('métricas', e)))
}

// ---------------- estatísticas ----------------
/** Tabelas do backup: a chave primária (para paginar) e quantas linhas por pedido. `bin` = pedaços de firmware (grandes). */
export const BACKUP_TABLES: Record<string, { pk: string[]; page: number; bin?: boolean }> = {
  stations: { pk: ['id'], page: 500 },
  users: { pk: ['email'], page: 500 },
  settings: { pk: ['key'], page: 500 },
  releases: { pk: ['id'], page: 500 },
  fw_assign: { pk: ['station_id'], page: 500 },
  alert_state: { pk: ['station_id', 'kind'], page: 500 },
  claims: { pk: ['code_hash'], page: 500 },
  audit: { pk: ['id'], page: 1000 },
  events: { pk: ['id'], page: 1000 },
  readings_hourly: { pk: ['station_id', 'hour'], page: 1500 },
  readings: { pk: ['station_id', 'ts'], page: 1500 },
  firmware: { pk: ['station_id'], page: 50, bin: true },
  firmware_chunks: { pk: ['station_id', 'idx'], page: 15, bin: true },
  release_chunks: { pk: ['release_id', 'idx'], page: 15, bin: true },
}

/** Quanto cada linha ocupa, em média, quando o D1 não deixa medir (estimativa). */
const ROW_BYTES: Record<string, number> = { readings: 64, readings_hourly: 110, events: 120, audit: 140, stations: 1500 }

export async function serverStats(env: Env) {
  const now = Math.floor(Date.now() / 1000)
  const size = (await env.DB.prepare('SELECT 1').run()).meta?.size_after ?? null

  const counts = await Promise.all(Object.keys(BACKUP_TABLES).map(async (t) => {
    const r = await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first<{ n: number }>().catch(() => null)
    return [t, r?.n ?? 0] as const
  }))
  // espaço de cada tabela: o D1 pode não expor a tabela dbstat; sem ela, estima por linha (e marca como estimativa)
  let bytes: Record<string, number> | null = null
  try {
    const { results } = await env.DB.prepare('SELECT name, SUM(pgsize) b FROM dbstat GROUP BY name').all<{ name: string; b: number }>()
    bytes = Object.fromEntries(results.map((r) => [r.name, r.b]))
  } catch { /* estimativa abaixo */ }
  const tables = counts.map(([name, rows]) => {
    const exact = bytes?.[name]
    return { name, rows, bytes: exact ?? Math.round(rows * (ROW_BYTES[name] ?? 200)), exact: exact != null }
  })

  const [stations, oldest] = await Promise.all([
    env.DB.prepare('SELECT s.id, s.name, s.config, s.last_seen, (SELECT COUNT(*) FROM readings r WHERE r.station_id = s.id) n, (SELECT MIN(ts) FROM readings r WHERE r.station_id = s.id) oldest, (SELECT COUNT(*) FROM readings r WHERE r.station_id = s.id AND r.ts > ?) n24, (SELECT COUNT(*) FROM events e WHERE e.station_id = s.id) ev FROM stations s ORDER BY s.name')
      .bind(now - 86400).all<{ id: string; name: string; config: string; last_seen: number | null; n: number; oldest: number | null; n24: number; ev: number }>(),
    env.DB.prepare('SELECT MIN(ts) t FROM readings').first<{ t: number | null }>(),
  ])
  const perStation = stations.results.map((s) => {
    const cfg = JSON.parse(s.config) as Config
    const expected = Math.round(86400 / (Math.max(1, cfg.interval_min) * 60))
    return { id: s.id, name: s.name, rows: s.n, oldest: s.oldest, n24: s.n24, expected24: expected, events: s.ev, last_seen: s.last_seen, bytes: s.n * ROW_BYTES.readings }
  })

  // últimos 90 dias de contadores e visitantes
  const from = dayKey(Date.now() - 90 * 86400_000)
  const [m, v] = await Promise.all([
    env.DB.prepare('SELECT day, k, n FROM metrics WHERE day >= ? ORDER BY day').bind(from).all<{ day: string; k: string; n: number }>().catch(() => ({ results: [] as { day: string; k: string; n: number }[] })),
    env.DB.prepare('SELECT day, COUNT(*) n FROM visitors WHERE day >= ? GROUP BY day ORDER BY day').bind(from).all<{ day: string; n: number }>().catch(() => ({ results: [] as { day: string; n: number }[] })),
  ])
  const days: Record<string, Record<string, number>> = {}
  for (const r of m.results) (days[r.day] ??= {})[r.k] = r.n
  for (const r of v.results) (days[r.day] ??= {}).visitors = r.n
  const [users, sessions] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) n, SUM(role = \'admin\') a FROM users').first<{ n: number; a: number | null }>().catch(() => null),
    env.DB.prepare('SELECT MAX(last_login) t FROM users').first<{ t: number | null }>().catch(() => null),
  ])

  return {
    now, db: { size, tables, exact: !!bytes, oldest: oldest?.t ?? null }, perStation, days,
    users: { total: users?.n ?? 0, admins: users?.a ?? 0, lastLogin: sessions?.t ?? null },
    retention: { readingsDays: 400, hourlyDays: 800, eventsDays: 120 },
  }
}

// ---------------- backup ----------------
const sqlValue = (v: unknown): string => {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

/** `?schema=1`: as definições das tabelas e índices. `?table=<nome>&after=<cursor>`: um pedaço das linhas, como INSERTs. */
export async function backupChunk(url: URL, env: Env) {
  if (url.searchParams.get('schema')) {
    const { results } = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name").all<{ sql: string }>()
    const sql = results.map((r) => r.sql.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) (?!IF NOT EXISTS)/i, 'CREATE $1$2 IF NOT EXISTS ') + ';').join('\n')
    return json({ sql: sql + '\n', next: null, rows: 0 })
  }
  const name = url.searchParams.get('table') ?? ''
  const spec = BACKUP_TABLES[name]
  if (!spec) return json({ error: 'tabela desconhecida' }, 422)
  let after: unknown[] = []
  try { const a = JSON.parse(url.searchParams.get('after') || '[]'); if (Array.isArray(a)) after = a.slice(0, spec.pk.length) } catch { return json({ error: 'cursor inválido' }, 422) }
  const key = `(${spec.pk.join(',')})`
  const where = after.length === spec.pk.length ? `WHERE ${key} > (${spec.pk.map(() => '?').join(',')})` : ''
  const { results } = await env.DB.prepare(`SELECT * FROM ${name} ${where} ORDER BY ${spec.pk.join(',')} LIMIT ?`).bind(...(where ? after : []), spec.page).all<Record<string, unknown>>()
  if (!results.length) return json({ sql: '', next: null, rows: 0 })
  const cols = Object.keys(results[0])
  const head = `INSERT OR REPLACE INTO ${name} (${cols.join(',')}) VALUES `
  const sql = results.map((r) => `${head}(${cols.map((c) => sqlValue(r[c])).join(',')});`).join('\n') + '\n'
  const last = results[results.length - 1]
  return json({ sql, rows: results.length, next: results.length < spec.page ? null : JSON.stringify(spec.pk.map((c) => last[c])) })
}
