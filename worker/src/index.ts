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
 * Administrador (assinatura HMAC com o ADMIN_TOKEN, o token nunca viaja):
 *   POST /api/stations, PUT|DELETE /api/stations/:id, POST /:id/key, POST /:id/claim, POST|DELETE /:id/firmware
 *   GET|PUT /api/settings/telegram, POST /api/telegram/test, POST /api/telegram/detect-chat, GET /api/usage
 */
import {
  detectChat, DEFAULT_TEMPLATES, evaluateAfterIngest, evaluateOffline, loadTelegram, publicTelegram, render, saveTelegram, sendTelegram,
} from './alerts'
import { notifyLive } from './hub'
import { fromBase64, hmacHex, newKey, randomHex, same, sha256Hex, toBase64 } from './crypto'
import {
  type Config, DEFAULT_CONFIG, type Env, EVENT_KINDS, INTEGER_FIELDS, json, LIMITS, MAX_AGE_S, MAX_BATCH, CHEMS, READING_RANGES,
} from './shared'

export { Hub } from './hub'

const MAX_FIRMWARE = 1_600_000

interface StationRow {
  id: string; name: string; city: string; lat: number; lon: number; alt: number; config: string; created_at: number
  key_hash: string; nonce: string; cfg_applied: number; last_seen: number | null; fw_version: string | null
  vbat: number | null; rssi: number | null
}
const COLS = 'id,name,city,lat,lon,alt,config,created_at,key_hash,nonce,cfg_applied,last_seen,fw_version,vbat,rssi'
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

/**
 * Administrador: X-Ts (ms) e X-Sig = HMAC-SHA256(ADMIN_TOKEN, `${ts}|${método}|${caminho+query}|${sha256(corpo)}`).
 * Quem escuta a rede vê só a assinatura, que vale por 2 minutos e para aquele pedido.
 */
async function isAdmin(req: Request, env: Env, raw: Uint8Array) {
  const ts = Number(req.headers.get('x-ts'))
  const sig = req.headers.get('x-sig') ?? ''
  if (!env.ADMIN_TOKEN || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 120_000) return false
  const url = new URL(req.url)
  const msg = `${ts}|${req.method}|${url.pathname}${url.search}|${await sha256Hex(raw)}`
  return same(await hmacHex(env.ADMIN_TOKEN, msg), sig)
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
function cleanConfig(input: Record<string, unknown>, base: Config): Config {
  const out: Config = { ...DEFAULT_CONFIG, ...base } // estações antigas não têm os campos novos
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = input[k]
    if (typeof v === 'number' && Number.isFinite(v)) {
      const clamped = Math.min(hi, Math.max(lo, v))
      ;(out as unknown as Record<string, number>)[k] = INTEGER_FIELDS.includes(k) ? Math.round(clamped) : clamped
    }
  }
  if (typeof input.battery_chem === 'string' && CHEMS.includes(input.battery_chem)) out.battery_chem = input.battery_chem as Config['battery_chem']
  return out
}

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

const publicStation = (s: StationRow) => ({
  id: s.id, name: s.name, city: s.city, lat: s.lat, lon: s.lon, alt: s.alt, config: JSON.parse(s.config) as Config,
  cfg_applied: s.cfg_applied, last_seen: s.last_seen, fw_version: s.fw_version, vbat: s.vbat, rssi: s.rssi,
})

const unauthorized = () => json({ error: 'não autorizado' }, 401)

// ---------------- estação: envio ----------------
async function ingest(req: Request, env: Env, ctx: ExecutionContext) {
  const raw = await readRaw(req)
  const auth = await authDevice(req, env, raw)
  if (auth instanceof Response) return auth
  const { st } = auth

  const body = parseJson(raw)
  if (!body) return json({ error: 'JSON inválido' }, 400)

  // aceita um lote ({ batch: [...] }) ou uma leitura solta
  const items: unknown[] = Array.isArray(body.batch) ? body.batch : [body]
  // lote vazio é permitido: a placa está conectada mas sem leitura de sensor (BME280 ausente). Conta como "visto" e troca a configuração
  const heartbeat = Array.isArray(body.batch) && body.batch.length === 0
  if (heartbeat) console.warn(`ingest sem leituras (${st.id}): a placa conectou mas não mediu nada (BME280 ausente?)`)
  if ((items.length < 1 && !heartbeat) || items.length > MAX_BATCH) return json({ error: `o lote precisa ter de 1 a ${MAX_BATCH} leituras` }, 422)

  const nowTs = Math.floor(Date.now() / 1000)
  const ins = env.DB.prepare('INSERT OR REPLACE INTO readings (station_id,ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  const writes: D1PreparedStatement[] = []
  let latest: { ts: number; gust: number; dir: number; vbat: number; rain: number; rssi: number } | null = null
  for (const rawItem of items) {
    const item = (rawItem ?? {}) as Record<string, unknown>
    const v: Record<string, number> = {}
    for (const [k, [lo, hi]] of Object.entries(READING_RANGES)) {
      const n = item[k]
      if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) {
        console.warn(`ingest recusado (${st.id}): campo ${k} = ${JSON.stringify(n)} fora de ${lo}..${hi}`) // aparece no log do wrangler
        return json({ error: `campo ${k} ausente ou fora da faixa` }, 422)
      }
      v[k] = n
    }
    const age = typeof item.age === 'number' && Number.isFinite(item.age) ? Math.min(MAX_AGE_S, Math.max(0, Math.round(item.age))) : 0
    const ts = nowTs - age
    writes.push(ins.bind(st.id, ts, v.temp, v.hum, v.pres, v.wind, v.gust, v.dir, v.rain, v.vbat, v.rssi))
    if (!latest || ts >= latest.ts) latest = { ts, gust: v.gust, dir: v.dir, vbat: v.vbat, rain: v.rain, rssi: v.rssi }
  }

  // eventos do firmware (reinício, falha de atualização...)
  const evIns = env.DB.prepare('INSERT INTO events (station_id, ts, kind, data) VALUES (?,?,?,?)')
  for (const e of Array.isArray(body.events) ? body.events.slice(0, 16) : []) {
    const ev = (e ?? {}) as Record<string, unknown>
    if (typeof ev.kind !== 'string' || !EVENT_KINDS.includes(ev.kind)) continue
    const age = typeof ev.age === 'number' && Number.isFinite(ev.age) ? Math.min(MAX_AGE_S, Math.max(0, Math.round(ev.age))) : 0
    const { kind: _k, age: _a, ...data } = ev
    const text = JSON.stringify(data)
    if (text.length > 400) continue
    writes.push(evIns.bind(st.id, nowTs - age, ev.kind, text))
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
    env.DB.prepare('UPDATE stations SET cfg_applied = ?, last_seen = ?, fw_version = COALESCE(?, fw_version), nonce = ?, vbat = COALESCE(?, vbat), rssi = COALESCE(?, rssi) WHERE id = ?')
      .bind(Number.isFinite(reported) ? reported : st.cfg_applied, nowTs, fw, nonce, stV, stR, st.id),
  )
  await env.DB.batch(writes)
  if (Math.random() < 0.01) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM readings WHERE ts < ?').bind(nowTs - 400 * 86400),
      env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(nowTs - 120 * 86400),
    ])
  }

  const fwMeta = await env.DB.prepare('SELECT version, size, sha256 FROM firmware WHERE station_id = ?').bind(st.id).first<{ version: string; size: number; sha256: string }>()
  ctx.waitUntil(notifyLive(env, st.id))
  if (latest) ctx.waitUntil(evaluateAfterIngest(env, { id: st.id, name: st.name, city: st.city, config: cfg }, latest).catch(() => undefined))

  return signedJson(auth, {
    ts: nowTs,
    stored: items.length,
    config: reported !== cfg.version ? cfg : null,
    // só oferece atualização quando a versão publicada é DIFERENTE da instalada (não "mais nova")
    ota: fwMeta && fw !== fwMeta.version ? fwMeta : null,
    ...(auth.signed ? { nonce } : {}),
  })
}

async function firmwareDownload(req: Request, env: Env) {
  const auth = await authDevice(req, env, new Uint8Array())
  if (auth instanceof Response) return auth
  const meta = await env.DB.prepare('SELECT version, size, sha256, chunks FROM firmware WHERE station_id = ?').bind(auth.st.id).first<{ version: string; size: number; sha256: string; chunks: number }>()
  if (!meta) return json({ error: 'nenhum firmware publicado' }, 404)
  const { results } = await env.DB.prepare('SELECT data FROM firmware_chunks WHERE station_id = ? ORDER BY idx').bind(auth.st.id).all<{ data: string }>()
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
async function listStations(env: Env) {
  const now = Math.floor(Date.now() / 1000)
  const [stations, latest, day] = await Promise.all([
    env.DB.prepare(`SELECT ${COLS} FROM stations ORDER BY name`).all<StationRow>(),
    env.DB.prepare(
      `SELECT r.* FROM readings r JOIN (SELECT station_id, MAX(ts) m FROM readings GROUP BY station_id) x
       ON x.station_id = r.station_id AND x.m = r.ts`,
    ).all<Record<string, number | string>>(),
    env.DB.prepare(
      `SELECT station_id, SUM(rain) rain24, MIN(temp) tmin, MAX(temp) tmax, MAX(gust) gustmax
       FROM readings WHERE ts >= ? GROUP BY station_id`,
    ).bind(now - 86400).all<Record<string, number | string>>(),
  ])
  const last = new Map(latest.results.map((r) => [r.station_id as string, r]))
  const sum = new Map(day.results.map((r) => [r.station_id as string, r]))
  return json(
    stations.results.map((s) => {
      const l = last.get(s.id)
      const d = sum.get(s.id)
      const reading = l ? { ts: l.ts, temp: l.temp, hum: l.hum, pres: l.pres, wind: l.wind, gust: l.gust, dir: l.dir, rain: l.rain, vbat: l.vbat, rssi: l.rssi } : null
      return { ...publicStation(s), latest: reading, day: d ? { rain: d.rain24, tmin: d.tmin, tmax: d.tmax, gust: d.gustmax } : null }
    }),
  )
}

async function getStation(env: Env, id: string) {
  const s = await env.DB.prepare(`SELECT ${COLS} FROM stations WHERE id = ?`).bind(id).first<StationRow>()
  return s ? json(publicStation(s)) : json({ error: 'estação não encontrada' }, 404)
}

async function readings(url: URL, env: Env, id: string) {
  const hours = Math.min(24 * 30, Math.max(1, Number(url.searchParams.get('hours')) || 24))
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const { results } = await env.DB
    .prepare('SELECT ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi FROM readings WHERE station_id = ? AND ts >= ? ORDER BY ts ASC')
    .bind(id, since)
    .all()
  return json(results)
}

/** Um resumo por dia local (tz em minutos a leste de UTC; o Brasil é -180). Alimenta o calendário e o resumo do mês. */
async function daily(url: URL, env: Env, id: string) {
  const days = Math.min(730, Math.max(1, Number(url.searchParams.get('days')) || 90))
  const tz = Math.min(840, Math.max(-720, Math.round(Number(url.searchParams.get('tz')) || 0)))
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const { results } = await env.DB
    .prepare(
      `SELECT date(ts + ? * 60, 'unixepoch') AS day, MIN(temp) tmin, MAX(temp) tmax, AVG(temp) tavg, SUM(rain) rain,
              MAX(gust) gust, AVG(wind) wind, MIN(pres) pmin, MAX(pres) pmax, COUNT(*) n
       FROM readings WHERE station_id = ? AND ts >= ? GROUP BY day ORDER BY day`,
    )
    .bind(tz, id, since)
    .all()
  return json(results)
}

async function events(url: URL, env: Env, id: string) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const { results } = await env.DB.prepare('SELECT ts, kind, data FROM events WHERE station_id = ? ORDER BY ts DESC LIMIT ?').bind(id, limit).all<{ ts: number; kind: string; data: string }>()
  return json(results.map((r) => ({ ts: r.ts, kind: r.kind, ...(JSON.parse(r.data) as object) })))
}

async function firmwareInfo(env: Env, id: string) {
  const f = await env.DB.prepare('SELECT version, size, sha256, uploaded_at FROM firmware WHERE station_id = ?').bind(id).first()
  const s = await env.DB.prepare('SELECT fw_version FROM stations WHERE id = ?').bind(id).first<{ fw_version: string | null }>()
  if (!s) return json({ error: 'estação não encontrada' }, 404)
  return json({ published: f ?? null, installed: s.fw_version })
}

// ---------------- administrador ----------------
async function createStation(req: Request, env: Env, raw: Uint8Array) {
  const body = parseJson(raw)
  if (!body) return json({ error: 'JSON inválido' }, 400)
  const id = String(body.id ?? '').toLowerCase()
  if (!/^[a-z0-9-]{2,32}$/.test(id)) return json({ error: 'id precisa ter 2 a 32 letras minúsculas, números ou hífen' }, 422)
  const m = meta(body)
  if (!m.name || !Number.isFinite(m.lat) || !Number.isFinite(m.lon)) return json({ error: 'informe nome, latitude e longitude' }, 422)
  if (await env.DB.prepare('SELECT 1 FROM stations WHERE id = ?').bind(id).first()) return json({ error: 'já existe uma estação com esse id' }, 409)

  const key = newKey()
  const cfg = cleanConfig(body, DEFAULT_CONFIG)
  await env.DB
    .prepare('INSERT INTO stations (id,name,city,lat,lon,alt,key_hash,config,created_at,nonce) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, m.name, m.city, m.lat, m.lon, m.alt, await sha256Hex(key), JSON.stringify(cfg), Math.floor(Date.now() / 1000), randomHex(8))
    .run()
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
    env.DB.prepare('DELETE FROM events WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM alert_state WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM firmware_chunks WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM firmware WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM claims WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM stations WHERE id = ?').bind(id),
  ])
  return json({ ok: true })
}

async function publishFirmware(url: URL, env: Env, id: string, raw: Uint8Array) {
  const version = (url.searchParams.get('version') ?? '').trim()
  if (!/^[\w.+-]{1,40}$/.test(version)) return json({ error: 'informe a versão (letras, números, ponto, hífen)' }, 422)
  if (raw.length < 100_000 || raw.length > MAX_FIRMWARE) return json({ error: `o firmware deve ter entre 100 KB e ${Math.round(MAX_FIRMWARE / 1000)} KB` }, 422)
  if (!(await env.DB.prepare('SELECT 1 FROM stations WHERE id = ?').bind(id).first())) return json({ error: 'estação não encontrada' }, 404)

  const CH = 192 * 1024
  const n = Math.ceil(raw.length / CH)
  const stmts: D1PreparedStatement[] = [
    // apaga o meta ANTES dos pedaços: é o meta que faz a estação tentar baixar
    env.DB.prepare('DELETE FROM firmware WHERE station_id = ?').bind(id),
    env.DB.prepare('DELETE FROM firmware_chunks WHERE station_id = ?').bind(id),
  ]
  for (let i = 0; i < n; i++) stmts.push(env.DB.prepare('INSERT INTO firmware_chunks (station_id, idx, data) VALUES (?,?,?)').bind(id, i, toBase64(raw.subarray(i * CH, (i + 1) * CH))))
  const sha = await sha256Hex(raw)
  stmts.push(env.DB.prepare('INSERT INTO firmware (station_id, version, size, sha256, chunks, uploaded_at) VALUES (?,?,?,?,?,?)').bind(id, version, raw.length, sha, n, Math.floor(Date.now() / 1000)))
  await env.DB.batch(stmts)
  return json({ version, size: raw.length, sha256: sha }, 201)
}

async function unpublishFirmware(env: Env, id: string) {
  await env.DB.batch([env.DB.prepare('DELETE FROM firmware WHERE station_id = ?').bind(id), env.DB.prepare('DELETE FROM firmware_chunks WHERE station_id = ?').bind(id)])
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

async function telegramTest(env: Env, raw: Uint8Array) {
  const body = parseJson(raw) ?? {}
  const tg = await loadTelegram(env)
  const kind = typeof body.kind === 'string' && body.kind in DEFAULT_TEMPLATES ? body.kind : 'gust'
  const vars = { station: 'Estação de teste', city: 'Cidade', minutes: 75, pct: 12, vbat: '3.38', gust: 72, dir: 'SO', rain: '1.2', window: tg.rules.rainStart.windowMin }
  const text = render(tg.templates[kind] ?? DEFAULT_TEMPLATES[kind], vars)
  const r = await sendTelegram(env, tg, `🧪 Teste\n${text}`)
  return json(r, r.ok ? 200 : 502)
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

  // leitura pública
  if (m === 'GET') {
    if (p === '/api/stations') return listStations(env)
    const g = p.match(/^\/api\/stations\/([a-z0-9-]+)(?:\/(readings|daily|events|firmware))?$/)
    if (g) {
      const [, id, sub] = g
      if (!sub) return getStation(env, id)
      if (sub === 'readings') return readings(url, env, id)
      if (sub === 'daily') return daily(url, env, id)
      if (sub === 'events') return events(url, env, id)
      if (sub === 'firmware') return firmwareInfo(env, id)
    }
  }

  // o resto exige o administrador
  const isApiAdminRoute = p === '/api/stations' || p.startsWith('/api/stations/') || p.startsWith('/api/settings/') || p.startsWith('/api/telegram/') || p === '/api/usage'
  if (!isApiAdminRoute) return null
  const raw = await readRaw(req)
  if (!(await isAdmin(req, env, raw))) return unauthorized()

  if (p === '/api/stations' && m === 'POST') return createStation(req, env, raw)
  if (p === '/api/usage' && m === 'GET') return usage(env)
  if (p === '/api/settings/telegram') {
    if (m === 'GET') return json(publicTelegram(await loadTelegram(env)))
    if (m === 'PUT') {
      const body = parseJson(raw)
      return body ? json(publicTelegram(await saveTelegram(env, body))) : json({ error: 'JSON inválido' }, 400)
    }
  }
  if (p === '/api/telegram/test' && m === 'POST') return telegramTest(env, raw)
  if (p === '/api/telegram/detect-chat' && m === 'POST') {
    const body = parseJson(raw) ?? {}
    const tg = await loadTelegram(env)
    const token = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : tg.token
    if (!token) return json({ error: 'informe o token do bot' }, 422)
    const r = await detectChat(env, token)
    return json(r, r.ok ? 200 : 502)
  }

  const a = p.match(/^\/api\/stations\/([a-z0-9-]+)(?:\/(key|claim|firmware))?$/)
  if (a) {
    const [, id, sub] = a
    if (!sub && m === 'PUT') return updateStation(env, id, raw)
    if (!sub && m === 'DELETE') return deleteStation(env, id)
    if (sub === 'key' && m === 'POST') return rotateKey(env, id)
    if (sub === 'claim' && m === 'POST') return createClaim(env, id)
    if (sub === 'firmware' && m === 'POST') return publishFirmware(url, env, id, raw)
    if (sub === 'firmware' && m === 'DELETE') return unpublishFirmware(env, id)
  }
  return json({ error: 'rota não encontrada' }, 404)
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const r = await route(req, env, ctx)
      if (r) {
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

  /** A cada 5 minutos: avisa de estações que pararam de enviar. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(evaluateOffline(env))
  },
}
