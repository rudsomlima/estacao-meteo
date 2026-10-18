/**
 * API da rede de estações.
 *
 *   POST   /api/ingest                  ESP32 -> lote de leituras. Header X-Device-Key identifica a estação.
 *                                       Corpo: { cfg, batch: [{ age, temp, ... }] } (ou uma leitura solta).
 *                                       `age` é a idade da leitura em segundos. A resposta traz a configuração
 *                                       nova quando a versão mudou.
 *   GET    /api/stations                lista com a última leitura e o resumo de 24 h (público)
 *   GET    /api/stations/:id            uma estação (público)
 *   GET    /api/stations/:id/readings   ?hours=24 (público)
 *   POST   /api/stations                cria estação, devolve a chave UMA vez (Bearer ADMIN_TOKEN)
 *   PUT    /api/stations/:id            nome, local e configuração (Bearer ADMIN_TOKEN)
 *   POST   /api/stations/:id/key        gera uma chave nova (Bearer ADMIN_TOKEN)
 *   DELETE /api/stations/:id            apaga estação e leituras (Bearer ADMIN_TOKEN)
 */
interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ADMIN_TOKEN: string
}

type Num = number
interface Config {
  interval_min: Num; wind_window_s: Num; gust_window_s: Num; samples: Num; wifi_timeout_s: Num
  mm_per_tip: Num; k_wind: Num; dir_offset: Num
  slow_below_v: Num; slow_factor: Num; critical_v: Num
  send_every: Num; continuous_wind: Num; urgent_gust_kmh: Num
  battery_chem: 'li' | 'lfp' | 'lipo' | 'aa'; battery_mah: Num
  version: Num
}

const DEFAULT_CONFIG: Config = {
  interval_min: 10, wind_window_s: 8, gust_window_s: 3, samples: 8, wifi_timeout_s: 10,
  mm_per_tip: 0.2, k_wind: 0.42, dir_offset: 0,
  slow_below_v: 3.55, slow_factor: 3, critical_v: 3.2,
  send_every: 3, continuous_wind: 0, urgent_gust_kmh: 0,
  battery_chem: 'li', battery_mah: 3000, version: 1,
}

const CHEMS = ['li', 'lfp', 'lipo', 'aa']
const MAX_BATCH = 24
const MAX_AGE_S = 7 * 86400 // leitura mais velha que isso é descartada pela estação, então não aceitamos

// limites aceitos para cada campo numérico da configuração
const LIMITS: Record<string, [Num, Num]> = {
  interval_min: [1, 60], wind_window_s: [2, 30], gust_window_s: [1, 10], samples: [1, 32], wifi_timeout_s: [4, 30],
  mm_per_tip: [0.01, 5], k_wind: [0.05, 3], dir_offset: [0, 359.99],
  slow_below_v: [1.8, 4.2], slow_factor: [1, 12], critical_v: [1.5, 4.0], battery_mah: [100, 100000],
  send_every: [1, 12], continuous_wind: [0, 1], urgent_gust_kmh: [0, 200],
}

const READING_RANGES: Record<string, [Num, Num]> = {
  temp: [-60, 90], hum: [0, 100], pres: [300, 1100], wind: [0, 120], gust: [0, 150],
  dir: [0, 360], rain: [0, 200], vbat: [1, 5], rssi: [-120, 0],
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

const isAdmin = (req: Request, env: Env) =>
  same((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''), env.ADMIN_TOKEN)

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function cleanConfig(input: Record<string, unknown>, base: Config): Config {
  const out: Config = { ...base }
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = input[k]
    if (typeof v === 'number' && Number.isFinite(v)) {
      const clamped = Math.min(hi, Math.max(lo, v))
      ;(out as unknown as Record<string, number>)[k] = ['send_every', 'continuous_wind', 'urgent_gust_kmh'].includes(k) ? Math.round(clamped) : clamped
    }
  }
  if (typeof input.battery_chem === 'string' && CHEMS.includes(input.battery_chem)) out.battery_chem = input.battery_chem as Config['battery_chem']
  return out
}

interface StationRow {
  id: string; name: string; city: string; lat: number; lon: number; alt: number; config: string; created_at: number
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

const publicStation = (s: StationRow) => ({ id: s.id, name: s.name, city: s.city, lat: s.lat, lon: s.lon, alt: s.alt, config: JSON.parse(s.config) as Config })

// ---------------- rotas ----------------
async function ingest(req: Request, env: Env) {
  const key = req.headers.get('x-device-key') ?? ''
  const st = key ? await env.DB.prepare('SELECT id, config FROM stations WHERE key_hash = ?').bind(await sha256(key)).first<{ id: string; config: string }>() : null
  if (!st) return json({ error: 'chave inválida' }, 401)

  const body = await readBody(req)
  if (!body) return json({ error: 'JSON inválido' }, 400)

  // aceita um lote ({ batch: [...] }) ou uma leitura solta, como antes
  const items: unknown[] = Array.isArray(body.batch) ? body.batch : [body]
  if (items.length < 1 || items.length > MAX_BATCH) return json({ error: `o lote precisa ter de 1 a ${MAX_BATCH} leituras` }, 422)

  const nowTs = Math.floor(Date.now() / 1000)
  const stmt = env.DB.prepare('INSERT OR REPLACE INTO readings (station_id,ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  const writes = []
  for (const raw of items) {
    const item = (raw ?? {}) as Record<string, unknown>
    const v: Record<string, number> = {}
    for (const [k, [lo, hi]] of Object.entries(READING_RANGES)) {
      const n = item[k]
      if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) return json({ error: `campo ${k} ausente ou fora da faixa` }, 422)
      v[k] = n
    }
    const age = typeof item.age === 'number' && Number.isFinite(item.age) ? Math.min(MAX_AGE_S, Math.max(0, Math.round(item.age))) : 0
    writes.push(stmt.bind(st.id, nowTs - age, v.temp, v.hum, v.pres, v.wind, v.gust, v.dir, v.rain, v.vbat, v.rssi))
  }
  await env.DB.batch(writes)
  if (Math.random() < 0.01) await env.DB.prepare('DELETE FROM readings WHERE ts < ?').bind(nowTs - 400 * 86400).run()

  const cfg = JSON.parse(st.config) as Config
  const known = Number(body.cfg)
  return json({ ts: nowTs, stored: writes.length, config: known !== cfg.version ? cfg : null })
}

async function listStations(env: Env) {
  const now = Math.floor(Date.now() / 1000)
  const [stations, latest, day] = await Promise.all([
    env.DB.prepare('SELECT id,name,city,lat,lon,alt,config,created_at FROM stations ORDER BY name').all<StationRow>(),
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
  const s = await env.DB.prepare('SELECT id,name,city,lat,lon,alt,config,created_at FROM stations WHERE id = ?').bind(id).first<StationRow>()
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

async function createStation(req: Request, env: Env) {
  if (!isAdmin(req, env)) return json({ error: 'não autorizado' }, 401)
  const body = await readBody(req)
  if (!body) return json({ error: 'JSON inválido' }, 400)
  const id = String(body.id ?? '').toLowerCase()
  if (!/^[a-z0-9-]{2,32}$/.test(id)) return json({ error: 'id precisa ter 2 a 32 letras minúsculas, números ou hífen' }, 422)
  const m = meta(body)
  if (!m.name || !Number.isFinite(m.lat) || !Number.isFinite(m.lon)) return json({ error: 'informe nome, latitude e longitude' }, 422)
  if (await env.DB.prepare('SELECT 1 FROM stations WHERE id = ?').bind(id).first()) return json({ error: 'já existe uma estação com esse id' }, 409)

  const key = newKey()
  const cfg = cleanConfig(body, DEFAULT_CONFIG)
  await env.DB
    .prepare('INSERT INTO stations (id,name,city,lat,lon,alt,key_hash,config,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, m.name, m.city, m.lat, m.lon, m.alt, await sha256(key), JSON.stringify(cfg), Math.floor(Date.now() / 1000))
    .run()
  return json({ id, ...m, config: cfg, key }, 201)
}

async function updateStation(req: Request, env: Env, id: string) {
  if (!isAdmin(req, env)) return json({ error: 'não autorizado' }, 401)
  const body = await readBody(req)
  if (!body) return json({ error: 'JSON inválido' }, 400)
  const cur = await env.DB.prepare('SELECT id,name,city,lat,lon,alt,config,created_at FROM stations WHERE id = ?').bind(id).first<StationRow>()
  if (!cur) return json({ error: 'estação não encontrada' }, 404)
  const m = meta(body, cur)
  const old = JSON.parse(cur.config) as Config
  const cfg = { ...cleanConfig((body.config as Record<string, unknown>) ?? body, old), version: old.version + 1 }
  await env.DB
    .prepare('UPDATE stations SET name=?, city=?, lat=?, lon=?, alt=?, config=? WHERE id=?')
    .bind(m.name, m.city, m.lat, m.lon, m.alt, JSON.stringify(cfg), id)
    .run()
  return json({ id, ...m, config: cfg })
}

async function rotateKey(req: Request, env: Env, id: string) {
  if (!isAdmin(req, env)) return json({ error: 'não autorizado' }, 401)
  const key = newKey()
  const r = await env.DB.prepare('UPDATE stations SET key_hash = ? WHERE id = ?').bind(await sha256(key), id).run()
  return r.meta.changes ? json({ id, key }) : json({ error: 'estação não encontrada' }, 404)
}

async function deleteStation(req: Request, env: Env, id: string) {
  if (!isAdmin(req, env)) return json({ error: 'não autorizado' }, 401)
  await env.DB.batch([env.DB.prepare('DELETE FROM readings WHERE station_id = ?').bind(id), env.DB.prepare('DELETE FROM stations WHERE id = ?').bind(id)])
  return json({ ok: true })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const p = url.pathname
    try {
      if (p === '/api/ingest' && req.method === 'POST') return await ingest(req, env)
      if (p === '/api/stations') {
        if (req.method === 'GET') return await listStations(env)
        if (req.method === 'POST') return await createStation(req, env)
      }
      const m = p.match(/^\/api\/stations\/([a-z0-9-]+)(\/readings|\/key)?$/)
      if (m) {
        const [, id, sub] = m
        if (!sub && req.method === 'GET') return await getStation(env, id)
        if (!sub && req.method === 'PUT') return await updateStation(req, env, id)
        if (!sub && req.method === 'DELETE') return await deleteStation(req, env, id)
        if (sub === '/readings' && req.method === 'GET') return await readings(url, env, id)
        if (sub === '/key' && req.method === 'POST') return await rotateKey(req, env, id)
      }
      if (p.startsWith('/api/')) return json({ error: 'rota não encontrada' }, 404)
    } catch (e) {
      console.error(e)
      return json({ error: 'erro interno' }, 500)
    }
    return env.ASSETS.fetch(req)
  },
}
