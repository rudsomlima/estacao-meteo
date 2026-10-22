/**
 * API da rede de estações. Detalhes de cada rota em docs/api.md.
 *
 * Estação (ESP32):
 *   POST /api/ingest             lote de leituras e eventos. Autenticação por X-Device-Key (HTTPS) ou assinada (HTTP).
 *   GET  /api/ota/firmware.bin   baixa o firmware publicado para ela
 *   POST /api/claim              troca um código de pareamento (de uso único) pela chave da estação
 * Público (somente leitura):
 *   GET  /api/live                WebSocket: avisa quando uma estação envia ou muda (o navegador então busca o dado novo)
 *   GET  /api/stations, /api/stations/:id, /:id/readings, /:id/daily, /:id/events, /:id/firmware
 *   GET  /api/layout              ordem dos cartões de gráfico na página da estação (PUT em /api/admin/layout)
 * Administrador (sessão do login com Google; o ADMIN_TOKEN só como acesso de emergência):
 *   POST /api/stations, PUT|DELETE /api/stations/:id, POST /:id/key, POST /:id/claim
 *   firmware: POST /api/admin/releases (publica uma versão) e /releases/:id/assign (atribui a estações) — veja admin.ts
 *   GET|PUT /api/settings/telegram, POST /api/telegram/*, GET /api/usage, GET /api/admin/*
 */
import { count, flushMetrics, noteRequest } from './server'
import {
  userKey, detectChat, DEFAULT_TEMPLATES, evaluateAfterIngest, evaluateOffline, loadTelegram, publicTelegram, render, saveTelegram, sendTelegram,
} from './alerts'
import { adminRoute, CARD_KEYS, defaultConfig } from './admin'
import { audit, type Actor, getActor, getSetting, getUser, newSession, sessionCookie, upsertUser, verifyGoogleToken, type User } from './auth'
import { cleanConfig, pinProblem } from './config'
import { notifyLive } from './hub'
import { backfillHourly, daySummaries, hourAsReading, rebuildTouched, type HourRow } from './hourly'
import { fromBase64, hmacHex, newKey, randomHex, same, sha256Hex, toBase64 } from './crypto'
import {
  type Config, DEFAULT_CONFIG, type Env, EVENT_KINDS, json, MAX_AGE_S, MAX_BATCH, OPTIONAL_READINGS, READING_RANGES,
} from './shared'

export { Hub } from './hub'


interface StationRow {
  id: string; name: string; city: string; lat: number; lon: number; alt: number; config: string; created_at: number
  key_hash: string; nonce: string; cfg_applied: number; last_seen: number | null; fw_version: string | null
  vbat: number | null; rssi: number | null; owner_email: string | null
  cfg_applied_at: number | null; cfg_sent: number | null; cfg_sent_at: number | null; cmd: string | null; cmd_at: number | null; cmd_sent: number | null; cmd_done: number | null
  latest: string | null
}
const COLS = 'id,name,city,lat,lon,alt,config,created_at,key_hash,nonce,cfg_applied,last_seen,fw_version,vbat,rssi,owner_email,cfg_applied_at,cfg_sent,cfg_sent_at,cmd,cmd_at,cmd_sent,cmd_done,latest'
const dec = new TextDecoder()

// ---------------- autenticação ----------------
const readRaw = async (req: Request) => new Uint8Array(await req.arrayBuffer())

function parseJson(raw: Uint8Array): Record<string, unknown> | null {
  try {
    const b = JSON.parse(dec.decode(raw))
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

interface DeviceAuth { st: StationRow; secret: string; nonceUsed: string; signed: boolean }

/**
 * Estação, de duas formas:
 *  - HTTPS: X-Device-Key com a chave (o servidor compara o SHA-256).
 *  - HTTP assinado: X-Station, X-Nonce e X-Sig = HMAC(sha256(chave), `${id}|${nonce}|${corpo}`). A chave não viaja,
 *    e o nonce, que muda a cada envio, impede repetir um pedido capturado.
 */
async function authDevice(req: Request, env: Env, raw: Uint8Array): Promise<DeviceAuth | Response> {
  const key = req.headers.get('x-device-key')
  if (key) {
    const st = await env.DB.prepare(`SELECT ${COLS} FROM stations WHERE key_hash = ?`).bind(await sha256Hex(key)).first<StationRow>()
    return st ? { st, secret: st.key_hash, nonceUsed: '', signed: false } : json({ error: 'chave inválida' }, 401)
  }
  const id = req.headers.get('x-station') ?? ''
  const sig = req.headers.get('x-sig') ?? ''
  const st = id ? await env.DB.prepare(`SELECT ${COLS} FROM stations WHERE id = ?`).bind(id).first<StationRow>() : null
  if (!st) return json({ error: 'credencial ausente' }, 401)
  const nonce = req.headers.get('x-nonce') ?? ''
  const expected = await hmacHex(st.key_hash, `${id}|${nonce}|${dec.decode(raw)}`)
  if (!same(expected, sig)) return json({ error: 'assinatura inválida' }, 401)
  // assinatura boa (a estação é ela mesma), mas o nonce é velho: devolve o atual para ela tentar de novo
  if (nonce !== st.nonce) return json({ error: 'nonce', nonce: st.nonce }, 401)
  return { st, secret: st.key_hash, nonceUsed: nonce, signed: true }
}

/** Resposta assinada para a estação conferir que veio do servidor (protege a configuração e o OTA em HTTP). */
async function signedJson(auth: DeviceAuth, body: unknown) {
  const text = JSON.stringify(body)
  return new Response(text, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-sig': await hmacHex(auth.secret, `${auth.nonceUsed}|${text}`) },
  })
}

// ---------------- configuração ----------------
function meta(input: Record<string, unknown>, base?: Pick<StationRow, 'name' | 'city' | 'lat' | 'lon' | 'alt'>) {
  const str = (v: unknown, fb: string, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fb)
  const num = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb)
  return {
    name: str(input.name, base?.name ?? '', 40),
    city: str(input.city, base?.city ?? '', 60),
    lat: num(input.lat, base?.lat ?? NaN, -90, 90),
    lon: num(input.lon, base?.lon ?? NaN, -180, 180),
    alt: num(input.alt, base?.alt ?? 0, -500, 9000),
  }
}

/** O dono pode mexer na estação; o administrador mexe em todas. */
const canManage = (u: Pick<Actor, 'email' | 'role'> | null, owner: string | null) => !!u && (u.role === 'admin' || (!!u.email && u.email === owner))

const publicStation = (s: StationRow, u: User | null = null) => ({
  id: s.id, name: s.name, city: s.city, lat: s.lat, lon: s.lon, alt: s.alt, config: JSON.parse(s.config) as Config,
  cfg_applied: s.cfg_applied, last_seen: s.last_seen, fw_version: s.fw_version, vbat: s.vbat, rssi: s.rssi,
  cfg_applied_at: s.cfg_applied_at,
  cfg_sent: s.cfg_sent,
  cfg_sent_at: s.cfg_sent_at,
  can_edit: canManage(u, s.owner_email),
  ...(u?.role === 'admin' ? { owner_email: s.owner_email } : {}),
  // comando pendente (reinício) e se a estação confirmou: só para quem pode mexer na estação
  ...(canManage(u, s.owner_email) && s.cmd ? { command: { name: s.cmd, at: s.cmd_at, sent: s.cmd_sent, done: s.cmd_done } } : {}),
})

/** Firmware oferecido à estação: o atribuído pelo administrador (versão única, várias estações) ou, se não há, o publicado só para ela. */
async function otaFor(env: Env, id: string): Promise<{ version: string; size: number; sha256: string } | null> {
  const a = await env.DB.prepare('SELECT r.version, r.size, r.sha256 FROM fw_assign a JOIN releases r ON r.id = a.release_id WHERE a.station_id = ?').bind(id).first<{ version: string; size: number; sha256: string }>()
  if (a) return a
  return env.DB.prepare('SELECT version, size, sha256 FROM firmware WHERE station_id = ?').bind(id).first<{ version: string; size: number; sha256: string }>()
}

const unauthorized = () => json({ error: 'não autorizado' }, 401)

// ---------------- estação: envio ----------------
/** Formato em colunas (firmware 0.5+): uma lista por medida, uma posição por leitura; o sinal (rssi) vale para o lote todo. */
function fromColumns(body: Record<string, unknown>): Record<string, unknown>[] {
  const ages = (body.t as unknown[]).slice(0, MAX_BATCH + 1)
  const col = (k: string) => (Array.isArray(body[k]) ? (body[k] as unknown[]) : [])
  const cols = { temp: col('temp'), hum: col('hum'), pres: col('pres'), wind: col('wind'), gust: col('gust'), dir: col('dir'), rain: col('rain'), vbat: col('vb') }
  return ages.map((age, i) => ({
    age, rssi: body.rssi,
    ...Object.fromEntries(Object.entries(cols).map(([k, list]) => [k, list[i]])),
  }))
}

async function ingest(req: Request, env: Env, ctx: ExecutionContext) {
  const raw = await readRaw(req)
  const auth = await authDevice(req, env, raw)
  if (auth instanceof Response) return auth
  const { st } = auth

  const body = parseJson(raw)
  if (!body) return json({ error: 'JSON inválido' }, 400)

  // Três formatos: em colunas (firmware 0.5+: {"v":2,"t":[idades],"temp":[...],...}), lote de objetos ({ batch: [...] }) ou uma
  // leitura solta. Lote vazio é permitido: a placa está conectada mas sem leitura de sensor; conta como "visto" e troca a configuração
  const items: unknown[] = Array.isArray(body.t) ? fromColumns(body) : Array.isArray(body.batch) ? body.batch : [body]
  const heartbeat = (Array.isArray(body.t) || Array.isArray(body.batch)) && items.length === 0
  if ((items.length < 1 && !heartbeat) || items.length > MAX_BATCH) return json({ error: `o lote precisa ter de 1 a ${MAX_BATCH} leituras` }, 422)

  const nowTs = Math.floor(Date.now() / 1000)
  const ins = env.DB.prepare('INSERT OR REPLACE INTO readings (station_id,ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  const writes: D1PreparedStatement[] = []
  let latest: ({ ts: number } & Record<string, number | null>) | null = null
  const stamps: number[] = []
  for (const rawItem of items) {
    const item = (rawItem ?? {}) as Record<string, unknown>
    const v: Record<string, number> = {}
    for (const [k, [lo, hi]] of Object.entries(READING_RANGES)) {
      const n = item[k]
      if (OPTIONAL_READINGS.includes(k) && n == null) { v[k] = null as unknown as number; continue } // umidade sem o sensor, direção sem a biruta
      if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) {
        console.warn(`ingest recusado (${st.id}): campo ${k} = ${JSON.stringify(n)} fora de ${lo}..${hi}`) // aparece no log do wrangler
        return json({ error: `campo ${k} ausente ou fora da faixa` }, 422)
      }
      v[k] = n
    }
    const age = typeof item.age === 'number' && Number.isFinite(item.age) ? Math.min(MAX_AGE_S, Math.max(0, Math.round(item.age))) : 0
    const ts = nowTs - age
    writes.push(ins.bind(st.id, ts, v.temp, v.hum, v.pres, v.wind, v.gust, v.dir, v.rain, v.vbat, v.rssi))
    stamps.push(ts)
    if (!latest || ts >= latest.ts) latest = { ts, temp: v.temp, hum: v.hum, pres: v.pres, wind: v.wind, gust: v.gust, dir: v.dir, rain: v.rain, vbat: v.vbat, rssi: v.rssi }
  }

  // eventos do firmware (reinício, falha de atualização...)
  const evIns = env.DB.prepare('INSERT INTO events (station_id, ts, kind, data) VALUES (?,?,?,?)')
  let lastBootTs = 0 // o reinício mais recente informado nesta remessa (confirma um comando de reinício)
  for (const e of Array.isArray(body.events) ? body.events.slice(0, 16) : []) {
    const ev = (e ?? {}) as Record<string, unknown>
    if (typeof ev.kind !== 'string' || !EVENT_KINDS.includes(ev.kind)) continue
    const age = typeof ev.age === 'number' && Number.isFinite(ev.age) ? Math.min(MAX_AGE_S, Math.max(0, Math.round(ev.age))) : 0
    const { kind: _k, age: _a, ...data } = ev
    const text = JSON.stringify(data)
    if (text.length > 400) continue
    writes.push(evIns.bind(st.id, nowTs - age, ev.kind, text))
    if (ev.kind === 'boot') lastBootTs = Math.max(lastBootTs, nowTs - age)
  }

  // bateria e sinal do contato (vêm junto mesmo sem leitura de sensor); sem eles, usa os da leitura mais recente
  const inRange = (n: unknown, [lo, hi]: [number, number]) => (typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : null)
  const stV = inRange(body.vbat, READING_RANGES.vbat) ?? latest?.vbat ?? null
  const stR = inRange(body.rssi, READING_RANGES.rssi) ?? latest?.rssi ?? null
  const fw = typeof body.fw === 'string' ? body.fw.slice(0, 40) : null
  const cfg = JSON.parse(st.config) as Config
  const reported = Number(body.cfg)
  const nonce = auth.signed ? randomHex(8) : st.nonce
  writes.push(
    env.DB.prepare('UPDATE stations SET cfg_applied = ?, cfg_applied_at = CASE WHEN ? != cfg_applied THEN ? ELSE cfg_applied_at END, last_seen = ?, fw_version = COALESCE(?, fw_version), nonce = ?, vbat = COALESCE(?, vbat), rssi = COALESCE(?, rssi) WHERE id = ?')
      .bind(Number.isFinite(reported) ? reported : st.cfg_applied, Number.isFinite(reported) ? reported : st.cfg_applied, nowTs, nowTs, fw, nonce, stV, stR, st.id),
  )
  // configuração entregue na resposta: guarda a versão e o momento da primeira entrega (a estação confirma no envio seguinte)
  const sendCfg = reported !== cfg.version
  if (sendCfg) {
    writes.push(env.DB.prepare('UPDATE stations SET cfg_sent_at = CASE WHEN cfg_sent = ? THEN cfg_sent_at ELSE ? END, cfg_sent = ? WHERE id = ?').bind(cfg.version, nowTs, cfg.version, st.id))
  }
  // comando pendente: entrega na resposta; vira "confirmado" quando a estação volta com um reinício posterior à entrega
  let cmdOut: string | null = null
  if (st.cmd && !st.cmd_done) {
    if (st.cmd_sent && lastBootTs >= st.cmd_sent - 5) writes.push(env.DB.prepare('UPDATE stations SET cmd_done = ? WHERE id = ?').bind(nowTs, st.id))
    else { cmdOut = st.cmd; writes.push(env.DB.prepare('UPDATE stations SET cmd_sent = ? WHERE id = ?').bind(nowTs, st.id)) }
  }
  // a leitura mais recente fica na própria estação: a lista de estações não precisa varrer as leituras
  if (latest) writes.push(env.DB.prepare("UPDATE stations SET latest = ? WHERE id = ? AND (latest IS NULL OR json_extract(latest, '$.ts') <= ?)").bind(JSON.stringify(latest), st.id, latest.ts))
  count('rows', items.length); count('d1w', writes.length + 4) // gravações estimadas: as de cima + o resumo por hora
  await env.DB.batch(writes)
  if (stamps.length) await rebuildTouched(env, st.id, stamps) // resumo por hora das horas que este lote tocou
  if (Math.random() < 0.01) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM readings WHERE ts < ?').bind(nowTs - 400 * 86400),
      env.DB.prepare('DELETE FROM readings_hourly WHERE hour < ?').bind(Math.floor((nowTs - 800 * 86400) / 3600)),
      env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(nowTs - 120 * 86400),
    ])
  }

  const fwMeta = await otaFor(env, st.id)
  // o aviso aos navegadores já leva o que mudou: eles atualizam sem buscar a lista de novo
  const prevLatest = st.latest ? (JSON.parse(st.latest) as { ts: number }) : null
  const appliedNow = Number.isFinite(reported) ? reported : st.cfg_applied
  const snapshot = {
    last_seen: nowTs, vbat: stV ?? st.vbat, rssi: stR ?? st.rssi, fw_version: fw ?? st.fw_version,
    cfg_applied: appliedNow, cfg_applied_at: appliedNow !== st.cfg_applied ? nowTs : st.cfg_applied_at,
    cfg_sent: sendCfg ? cfg.version : st.cfg_sent, cfg_sent_at: sendCfg ? (st.cfg_sent === cfg.version ? st.cfg_sent_at : nowTs) : st.cfg_sent_at,
    latest: latest && (!prevLatest || latest.ts >= prevLatest.ts) ? latest : prevLatest,
    day: stamps.length ? ((await daySummaries(env, st.id)).get(st.id) ?? null) : undefined,
  }
  const cmdChanged = !!st.cmd && !st.cmd_done // o estado do comando só vai para quem pode mexer na estação: estes buscam a estação
  const ev = Array.isArray(body.events) && body.events.length > 0 // vieram eventos: quem mostra o diagnóstico busca de novo
  ctx.waitUntil(notifyLive(env, st.id, cmdChanged ? { ev } : { st: snapshot, ev }))
  if (latest) ctx.waitUntil(evaluateAfterIngest(env, { id: st.id, name: st.name, city: st.city, config: cfg, owner_email: st.owner_email }, latest as unknown as Parameters<typeof evaluateAfterIngest>[2]).catch(() => undefined))

  return signedJson(auth, {
    ts: nowTs,
    fmt: 2, // aceita o envio em colunas (o firmware 0.5+ passa a usá-lo depois de ver isto)
    stored: items.length,
    config: sendCfg ? cfg : null,
    // só oferece atualização quando a versão publicada é DIFERENTE da instalada (não "mais nova")
    ota: fwMeta && fw !== fwMeta.version ? fwMeta : null,
    ...(cmdOut ? { cmd: cmdOut } : {}),
    ...(auth.signed ? { nonce } : {}),
  })
}

async function firmwareDownload(req: Request, env: Env) {
  const auth = await authDevice(req, env, new Uint8Array())
  if (auth instanceof Response) return auth
  const rel = await env.DB.prepare('SELECT r.id, r.version, r.size, r.sha256 FROM fw_assign a JOIN releases r ON r.id = a.release_id WHERE a.station_id = ?').bind(auth.st.id).first<{ id: number; version: string; size: number; sha256: string }>()
  const own = rel ? null : await env.DB.prepare('SELECT version, size, sha256 FROM firmware WHERE station_id = ?').bind(auth.st.id).first<{ version: string; size: number; sha256: string }>()
  const meta = rel ?? own
  if (!meta) return json({ error: 'nenhum firmware publicado' }, 404)
  const { results } = rel
    ? await env.DB.prepare('SELECT data FROM release_chunks WHERE release_id = ? ORDER BY idx').bind(rel.id).all<{ data: string }>()
    : await env.DB.prepare('SELECT data FROM firmware_chunks WHERE station_id = ? ORDER BY idx').bind(auth.st.id).all<{ data: string }>()
  const parts = results.map((r) => fromBase64(r.data))
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  if (out.length !== meta.size) return json({ error: 'firmware incompleto no servidor' }, 500)
  return new Response(out, {
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(out.length), 'x-sha256': meta.sha256, 'x-version': meta.version, 'cache-control': 'no-store' },
  })
}

// ---------------- leitura pública ----------------
async function getLayout(env: Env) {
  const raw = await getSetting(env, 'card_layout')
  let order: string[] | null = null
  try { const v = raw ? JSON.parse(raw) : null; if (Array.isArray(v) && v.length === CARD_KEYS.length && CARD_KEYS.every((k) => v.includes(k))) order = v } catch { /* ignora: volta ao padrão */ }
  const saved = await getSetting(env, 'scene')
  const scene = saved === 'foto' || saved === 'diorama' ? saved : 'animada'
  return json({ order: order ?? CARD_KEYS, scene })
}

async function listStations(env: Env, user: User | null) {
  const [stations, day] = await Promise.all([
    env.DB.prepare(`SELECT ${COLS} FROM stations ORDER BY name`).all<StationRow>(),
    daySummaries(env),
  ])
  return json(stations.results.map((s) => ({ ...publicStation(s, user), latest: s.latest ? JSON.parse(s.latest) : null, day: day.get(s.id) ?? null })))
}

async function getStation(env: Env, id: string, user: User | null) {
  const s = await env.DB.prepare(`SELECT ${COLS} FROM stations WHERE id = ?`).bind(id).first<StationRow>()
  return s ? json(publicStation(s, user)) : json({ error: 'estação não encontrada' }, 404)
}

/**
 * Leituras de uma estação.
 *  - `since=<unix>`: só as leituras depois desse instante (o site pede só o que falta a cada aviso), no máximo 2000;
 *  - `hours=<n>` (padrão 24): até 48 h vêm leitura a leitura; acima disso, as últimas 24 h leitura a leitura e o resto resumido
 *    por hora (com `agg: "h"`), para a semana não custar milhares de linhas;
 *  - `from=<unix>&to=<unix>`: um trecho (até 48 h) leitura a leitura, para escolher um dia do histórico;
 *  - `res=raw`: tudo leitura a leitura (exportação), até 30 dias.
 */
async function readings(url: URL, env: Env, id: string) {
  const raw = (from: number, limit = 50000) => env.DB
    .prepare('SELECT ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi FROM readings WHERE station_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?')
    .bind(id, from, limit).all()
  const since = Number(url.searchParams.get('since'))
  if (Number.isFinite(since) && since > 0) return json((await raw(Math.floor(since), 2000)).results)
  // `from` e `to` (unix): um trecho do histórico, leitura a leitura (até 48 h), para o site mostrar um dia escolhido
  const from = Number(url.searchParams.get('from')), to = Number(url.searchParams.get('to'))
  if (Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from) {
    const end = Math.min(to, Math.floor(from) + 48 * 3600)
    const { results } = await env.DB
      .prepare('SELECT ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi FROM readings WHERE station_id = ? AND ts >= ? AND ts < ? ORDER BY ts ASC LIMIT 50000')
      .bind(id, Math.floor(from), Math.floor(end)).all()
    return json(results)
  }
  const hours = Math.min(24 * 30, Math.max(1, Number(url.searchParams.get('hours')) || 24))
  const now = Math.floor(Date.now() / 1000)
  const start = now - hours * 3600
  if (hours <= 48 || url.searchParams.get('res') === 'raw') return json((await raw(start - 1)).results)
  const recentFrom = now - 24 * 3600
  const [old, recent] = await Promise.all([
    env.DB.prepare('SELECT * FROM readings_hourly WHERE station_id = ? AND hour >= ? AND hour < ? ORDER BY hour')
      .bind(id, Math.floor(start / 3600), Math.floor(recentFrom / 3600)).all<HourRow>(),
    raw(Math.floor(recentFrom / 3600) * 3600 - 1),
  ])
  return json([...old.results.map(hourAsReading), ...recent.results])
}

/** Um resumo por dia local (tz em minutos a leste de UTC; o Brasil é -180), a partir do resumo por hora. Alimenta o calendário e o resumo do mês. */
async function daily(url: URL, env: Env, id: string) {
  const days = Math.min(730, Math.max(1, Number(url.searchParams.get('days')) || 90))
  const tz = Math.min(840, Math.max(-720, Math.round(Number(url.searchParams.get('tz')) || 0)))
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const { results } = await env.DB
    .prepare(
      `SELECT date(hour * 3600 + ? * 60, 'unixepoch') AS day, MIN(temp_min) tmin, MAX(temp_max) tmax,
              ROUND(SUM(temp_avg * n) / SUM(CASE WHEN temp_avg IS NULL THEN 0 ELSE n END), 2) tavg, ROUND(SUM(rain), 2) rain,
              MAX(gust_max) gust, ROUND(SUM(wind_avg * n) / SUM(CASE WHEN wind_avg IS NULL THEN 0 ELSE n END), 2) wind,
              MIN(pres_min) pmin, MAX(pres_max) pmax, SUM(n) n
       FROM readings_hourly WHERE station_id = ? AND hour >= ? GROUP BY day ORDER BY day`,
    )
    .bind(tz, id, Math.floor(since / 3600))
    .all()
  return json(results)
}

async function events(url: URL, env: Env, id: string) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const { results } = await env.DB.prepare('SELECT ts, kind, data FROM events WHERE station_id = ? ORDER BY ts DESC LIMIT ?').bind(id, limit).all<{ ts: number; kind: string; data: string }>()
  return json(results.map((r) => ({ ts: r.ts, kind: r.kind, ...(JSON.parse(r.data) as object) })))
}

async function firmwareInfo(env: Env, id: string) {
  const s = await env.DB.prepare('SELECT fw_version FROM stations WHERE id = ?').bind(id).first<{ fw_version: string | null }>()
  if (!s) return json({ error: 'estação não encontrada' }, 404)
  const a = await env.DB.prepare('SELECT r.version, r.size, r.sha256, a.assigned_at AS uploaded_at FROM fw_assign a JOIN releases r ON r.id = a.release_id WHERE a.station_id = ?').bind(id).first()
  // plano B: estações com firmware ainda pelo caminho antigo (nada novo é gravado lá)
  const f = a ? null : await env.DB.prepare('SELECT version, size, sha256, uploaded_at FROM firmware WHERE station_id = ?').bind(id).first()
  return json({ published: a ?? f ?? null, installed: s.fw_version, assigned: !!a })
}

// ---------------- administrador ----------------
async function createStation(env: Env, actor: Actor, raw: Uint8Array) {
  const body = parseJson(raw)
  if (!body) return json({ error: 'JSON inválido' }, 400)
  const id = String(body.id ?? '').toLowerCase()
  if (!/^[a-z0-9-]{2,32}$/.test(id)) return json({ error: 'id precisa ter 2 a 32 letras minúsculas, números ou hífen' }, 422)
  const m = meta(body)
  if (!m.name || !Number.isFinite(m.lat) || !Number.isFinite(m.lon)) return json({ error: 'informe nome, latitude e longitude' }, 422)
  if (await env.DB.prepare('SELECT 1 FROM stations WHERE id = ?').bind(id).first()) return json({ error: 'já existe uma estação com esse id' }, 409)

  // o administrador pode já indicar quem é o dono (o usuário que vai ajustar a estação)
  const owner = typeof body.owner_email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.owner_email.trim()) ? body.owner_email.trim().toLowerCase() : null
  const key = newKey()
  const cfg = cleanConfig(body, await defaultConfig(env))
  const bad = pinProblem(cfg)
  if (bad) return json({ error: bad }, 422)
  await env.DB
    .prepare('INSERT INTO stations (id,name,city,lat,lon,alt,key_hash,config,created_at,nonce,owner_email) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, m.name, m.city, m.lat, m.lon, m.alt, await sha256Hex(key), JSON.stringify(cfg), Math.floor(Date.now() / 1000), randomHex(8), owner)
    .run()
  await audit(env, actor, 'estacao.criada', id, owner ?? '')
  return json({ id, ...m, config: cfg, key }, 201)
}

async function updateStation(env: Env, id: string, raw: Uint8Array) {
  const body = parseJson(raw)
  if (!body) return json({ error: 'JSON inválido' }, 400)
  const cur = await env.DB.prepare(`SELECT ${COLS} FROM stations WHERE id = ?`).bind(id).first<StationRow>()
  if (!cur) return json({ error: 'estação não encontrada' }, 404)
  const m = meta(body, cur)
  const old = JSON.parse(cur.config) as Config
  const cfg = { ...cleanConfig((body.config as Record<string, unknown>) ?? body, old), version: old.version + 1 }
  const bad = pinProblem(cfg)
  if (bad) return json({ error: bad }, 422)
  await env.DB.prepare('UPDATE stations SET name=?, city=?, lat=?, lon=?, alt=?, config=? WHERE id=?').bind(m.name, m.city, m.lat, m.lon, m.alt, JSON.stringify(cfg), id).run()
  return json({ id, ...m, config: cfg, cfg_applied: cur.cfg_applied })
}

async function rotateKey(env: Env, id: string) {
  const key = newKey()
  const r = await env.DB.prepare('UPDATE stations SET key_hash = ?, nonce = ? WHERE id = ?').bind(await sha256Hex(key), randomHex(8), id).run()
  return r.meta.changes ? json({ id, key }) : json({ error: 'estação não encontrada' }, 404)
}

// ---------------- pareamento por código ----------------
const CLAIM_TTL_S = 24 * 3600
const CLAIM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // sem 0/O/1/I/L, para não errar ao digitar
const CLAIM_MAX_FAILS = 20 // por janela
const CLAIM_WINDOW_S = 600

const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

async function createClaim(env: Env, id: string) {
  if (!(await env.DB.prepare('SELECT 1 FROM stations WHERE id = ?').bind(id).first())) return json({ error: 'estação não encontrada' }, 404)
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const code = Array.from(bytes, (b) => CLAIM_ALPHABET[b % CLAIM_ALPHABET.length]).join('')
  const expires = Math.floor(Date.now() / 1000) + CLAIM_TTL_S
  await env.DB.batch([
    env.DB.prepare('DELETE FROM claims WHERE station_id = ? OR expires_at < ?').bind(id, Math.floor(Date.now() / 1000)),
    env.DB.prepare('INSERT INTO claims (code_hash, station_id, expires_at) VALUES (?,?,?)').bind(await sha256Hex(code), id, expires),
  ])
  return json({ id, code: `${code.slice(0, 3)}-${code.slice(3)}`, expires_at: expires }, 201)
}

/** A estação troca o código pela chave. Pública, então limita tentativas erradas para ninguém adivinhar códigos. */
async function claim(req: Request, env: Env, raw: Uint8Array) {
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'claim_guard'").first<{ value: string }>()
  let guard = row ? (JSON.parse(row.value) as { n: number; since: number }) : { n: 0, since: now }
  if (now - guard.since > CLAIM_WINDOW_S) guard = { n: 0, since: now }
  if (guard.n >= CLAIM_MAX_FAILS) return json({ error: 'muitas tentativas, aguarde alguns minutos' }, 429, { 'retry-after': String(CLAIM_WINDOW_S) })

  const body = parseJson(raw)
  const code = typeof body?.code === 'string' ? normalizeCode(body.code) : ''
  const hit = code.length === 6 ? await env.DB.prepare('SELECT station_id FROM claims WHERE code_hash = ? AND expires_at > ?').bind(await sha256Hex(code), now).first<{ station_id: string }>() : null
  if (!hit) {
    guard.n++
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('claim_guard', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(guard)).run()
    return json({ error: 'código inválido ou expirado' }, 403)
  }
  const key = newKey()
  const st = await env.DB.prepare('SELECT name FROM stations WHERE id = ?').bind(hit.station_id).first<{ name: string }>()
  await env.DB.batch([
    env.DB.prepare('UPDATE stations SET key_hash = ?, nonce = ? WHERE id = ?').bind(await sha256Hex(key), randomHex(8), hit.station_id),
    env.DB.prepare('DELETE FROM claims WHERE code_hash = ?').bind(await sha256Hex(code)),
  ])
  return json({ id: hit.station_id, name: st?.name ?? hit.station_id, key })
}

async function deleteStation(env: Env, id: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM readings WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM readings_hourly WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM events WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM alert_state WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM firmware_chunks WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM firmware WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM claims WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM stations WHERE id = ?').bind(id),
  ])
  return json({ ok: true })
}


async function usage(env: Env) {
  const one = async (sql: string) => (await env.DB.prepare(sql).first<Record<string, number>>()) ?? {}
  const [st, rd, ev, fw] = await Promise.all([
    one('SELECT COUNT(*) n FROM stations'),
    one('SELECT COUNT(*) n, MIN(ts) oldest, MAX(ts) newest FROM readings'),
    one('SELECT COUNT(*) n FROM events'),
    one('SELECT COUNT(*) n, COALESCE(SUM(size),0) bytes FROM firmware'),
  ])
  const perStation = await env.DB.prepare('SELECT station_id id, COUNT(*) n, MIN(ts) oldest, MAX(ts) newest FROM readings GROUP BY station_id').all()
  return json({
    stations: st.n, readings: rd.n, events: ev.n, firmware: fw.n,
    oldest: rd.oldest ?? null, newest: rd.newest ?? null,
    // ~64 bytes por leitura + ~120 por evento + o firmware (estimativa; o tamanho real está no painel da Cloudflare)
    approxBytes: Math.round((rd.n ?? 0) * 64 + (ev.n ?? 0) * 120 + (fw.bytes ?? 0) * 1.34),
    perStation: perStation.results,
  })
}

async function telegramTest(env: Env, raw: Uint8Array, key = 'telegram') {
  const body = parseJson(raw) ?? {}
  const tg = await loadTelegram(env, key)
  const kind = typeof body.kind === 'string' && body.kind in DEFAULT_TEMPLATES ? body.kind : 'gust'
  const vars = { station: 'Estação de teste', city: 'Cidade', minutes: 75, pct: 12, vbat: '3.38', gust: 72, dir: 'SO', rain: '1.2', window: tg.rules.rainStart.windowMin }
  const text = render(tg.templates[kind] ?? DEFAULT_TEMPLATES[kind], vars)
  const r = await sendTelegram(env, tg, `🧪 Teste\n${text}`)
  return json(r, r.ok ? 200 : 502)
}

// ---------------- login com Google ----------------
/** Entrada sem senha só para desenvolvimento: precisa de DEV_LOGIN=1 (que só existe no .dev.vars) E de o pedido vir de localhost. */
const devLoginOn = (req: Request, env: Env) => env.DEV_LOGIN === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.url).hostname)

async function authRoute(req: Request, env: Env, raw: Uint8Array): Promise<Response | null> {
  const p = new URL(req.url).pathname
  if (p === '/api/auth/config' && req.method === 'GET') return json({ clientId: env.GOOGLE_CLIENT_ID ?? null, devLogin: devLoginOn(req, env) })
  if (p === '/api/auth/dev' && req.method === 'POST') {
    if (!devLoginOn(req, env)) return json({ error: 'rota não encontrada' }, 404)
    const role = parseJson(raw)?.role === 'user' ? 'user' : 'admin'
    const email = role === 'admin' ? 'dev-admin@localhost' : 'dev-user@localhost'
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare("INSERT INTO users (email, name, picture, role, created_at, last_login) VALUES (?,?,'',?,?,?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, last_login = excluded.last_login").bind(email, role === 'admin' ? 'Dev (administrador)' : 'Dev (usuário)', role, now, now).run()
    const user: User = { email, name: role === 'admin' ? 'Dev (administrador)' : 'Dev (usuário)', picture: '', role }
    return json({ user }, 200, { 'set-cookie': sessionCookie(req, await newSession(env, email)) })
  }
  if (p === '/api/auth/me' && req.method === 'GET') {
    const u = await getUser(req, env)
    return json({ user: u })
  }
  if (p === '/api/auth/google' && req.method === 'POST') {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: 'origem não permitida' }, 403)
    const body = parseJson(raw)
    if (typeof body?.credential !== 'string') return json({ error: 'credential ausente' }, 422)
    try {
      const user = await upsertUser(env, await verifyGoogleToken(env, body.credential))
      await audit(env, { email: user.email, role: user.role, via: 'session' }, 'login')
      count('login')
      return json({ user }, 200, { 'set-cookie': sessionCookie(req, await newSession(env, user.email)) })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'não foi possível entrar' }, 401)
    }
  }
  if (p === '/api/auth/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) })
  return null
}

// ---------------- roteador ----------------
async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(req.url)
  const p = url.pathname
  const m = req.method

  if (p === '/api/ingest' && m === 'POST') return ingest(req, env, ctx)
  if (p === '/api/ota/firmware.bin' && m === 'GET') return firmwareDownload(req, env)
  if (p === '/api/claim' && m === 'POST') return claim(req, env, await readRaw(req))

  // tempo real: o navegador abre um WebSocket e é avisado quando algo muda
  if (p === '/api/live' && m === 'GET') return env.HUB.get(env.HUB.idFromName('rede')).fetch(req)

  if (p.startsWith('/api/auth/')) return authRoute(req, env, await readRaw(req))

  // leitura pública
  if (m === 'GET') {
    if (p === '/api/layout') return getLayout(env)
    if (p === '/api/stations') return listStations(env, await getUser(req, env))
    const g = p.match(/^\/api\/stations\/([a-z0-9-]+)(?:\/(readings|daily|events|firmware))?$/)
    if (g) {
      const [, id, sub] = g
      if (!sub) return getStation(env, id, await getUser(req, env))
      if (sub === 'readings') return readings(url, env, id)
      if (sub === 'daily') return daily(url, env, id)
      if (sub === 'events') return events(url, env, id)
      if (sub === 'firmware') return firmwareInfo(env, id)
    }
  }

  // o resto exige login (usuário) ou o administrador
  const isApiRoute = p.startsWith('/api/me/') || p === '/api/stations' || p.startsWith('/api/stations/') || p.startsWith('/api/settings/') || p.startsWith('/api/telegram/') || p === '/api/usage' || p.startsWith('/api/admin/')
  if (!isApiRoute) return null
  const raw = await readRaw(req)
  const actor = await getActor(req, env, raw)
  if (!actor) return unauthorized()
  const forbidden = () => json({ error: 'sem permissão' }, 403)
  const adminOnly = actor.role === 'admin'

  // Telegram de cada usuário, para as estações dele (o administrador tem o do servidor em /api/settings/telegram)
  if (p.startsWith('/api/me/telegram')) {
    if (!actor.email) return forbidden() // o token antigo não é uma pessoa
    const key = userKey(actor.email)
    const owned = (await env.DB.prepare('SELECT id FROM stations WHERE owner_email = ?').bind(actor.email).all<{ id: string }>()).results.map((r) => r.id)
    if (p === '/api/me/telegram' && m === 'GET') return json({ ...publicTelegram(await loadTelegram(env, key)), ownedStations: owned })
    if (p === '/api/me/telegram' && m === 'PUT') {
      const body = parseJson(raw)
      if (!body) return json({ error: 'JSON inválido' }, 400)
      await audit(env, actor, 'telegram.usuario')
      return json({ ...publicTelegram(await saveTelegram(env, body, key, owned)), ownedStations: owned })
    }
    if (p === '/api/me/telegram/test' && m === 'POST') return telegramTest(env, raw, key)
    if (p === '/api/me/telegram/detect-chat' && m === 'POST') {
      const body = parseJson(raw) ?? {}
      const token = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : (await loadTelegram(env, key)).token
      if (!token) return json({ error: 'informe o token do bot' }, 422)
      const r = await detectChat(env, token)
      return json(r, r.ok ? 200 : 502)
    }
    return json({ error: 'rota não encontrada' }, 404)
  }

  if (p.startsWith('/api/admin/')) return adminOnly ? ((await adminRoute(req, env, actor, raw)) ?? json({ error: 'rota não encontrada' }, 404)) : forbidden()

  // cadastrar dispositivos é só do administrador (o usuário comum ajusta as estações que são dele)
  if (p === '/api/stations' && m === 'POST') return adminOnly ? createStation(env, actor, raw) : forbidden()
  if (p === '/api/usage' && m === 'GET') return adminOnly ? usage(env) : forbidden()
  if (p === '/api/settings/telegram') {
    if (!adminOnly) return forbidden()
    if (m === 'GET') return json(publicTelegram(await loadTelegram(env)))
    if (m === 'PUT') {
      const body = parseJson(raw)
      return body ? json(publicTelegram(await saveTelegram(env, body))) : json({ error: 'JSON inválido' }, 400)
    }
  }
  if (p === '/api/telegram/test' && m === 'POST') return adminOnly ? telegramTest(env, raw) : forbidden()
  if (p === '/api/telegram/detect-chat' && m === 'POST') {
    if (!adminOnly) return forbidden()
    const body = parseJson(raw) ?? {}
    const tg = await loadTelegram(env)
    const token = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : tg.token
    if (!token) return json({ error: 'informe o token do bot' }, 422)
    const r = await detectChat(env, token)
    return json(r, r.ok ? 200 : 502)
  }

  const a = p.match(/^\/api\/stations\/([a-z0-9-]+)(?:\/(key|claim))?$/)
  if (a) {
    const [, id, sub] = a
    // só o dono (ou o administrador) mexe na estação
    const row = await env.DB.prepare('SELECT owner_email FROM stations WHERE id = ?').bind(id).first<{ owner_email: string | null }>()
    if (!row) return json({ error: 'estação não encontrada' }, 404)
    if (!canManage(actor, row.owner_email)) return forbidden()
    if (!sub && m === 'PUT') return audited(env, actor, 'estacao.alterada', id, await updateStation(env, id, raw))
    // remover, trocar a chave, parear e firmware: só administrador (o dono altera os ajustes, não o dispositivo)
    if (!adminOnly) return forbidden()
    if (!sub && m === 'DELETE') return audited(env, actor, 'estacao.removida', id, await deleteStation(env, id))
    if (sub === 'key' && m === 'POST') return audited(env, actor, 'estacao.chave', id, await rotateKey(env, id))
    if (sub === 'claim' && m === 'POST') return createClaim(env, id)
  }
  return json({ error: 'rota não encontrada' }, 404)
}

/** Registra na auditoria só o que deu certo. */
async function audited(env: Env, actor: Actor, action: string, target: string, res: Response) {
  if (res.ok) await audit(env, actor, action, target)
  return res
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const r = await route(req, env, ctx)
      if (r) {
        const path = new URL(req.url).pathname
        if (path.startsWith('/api/')) { ctx.waitUntil(noteRequest(req, path, r.status).then(() => flushMetrics(env, ctx))) }
        // criar, editar, remover ou trocar a chave de uma estação: os navegadores conectados atualizam na hora
        const changed = req.method !== 'GET' && r.ok && new URL(req.url).pathname.match(/^\/api\/stations(?:\/([a-z0-9-]+))?/)
        if (changed) ctx.waitUntil(notifyLive(env, changed[1] ?? null))
        return r
      }
      if (new URL(req.url).pathname.startsWith('/api/')) return json({ error: 'rota não encontrada' }, 404)
    } catch (e) {
      console.error(e)
      return json({ error: 'erro interno' }, 500)
    }
    return env.ASSETS.fetch(req)
  },

  /** A cada 5 minutos: avisa de estações que pararam de enviar e completa o resumo por hora. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(evaluateOffline(env))
    ctx.waitUntil(backfillHourly(env).catch((e) => console.warn('resumo por hora', e)))
  },
}
