/**
 * Resumo por hora das leituras (tabela readings_hourly). Serve para não varrer as leituras brutas:
 *  - o resumo das últimas 24 h de cada estação (lista de estações e mapa);
 *  - o calendário e o resumo por dia (Análises);
 *  - o histórico longo (mais de 48 h), que vai resumido por hora em vez de leitura a leitura.
 *
 * Cada hora é recalculada a partir das leituras brutas daquela hora: reenviar o mesmo lote (resposta perdida) não conta em
 * dobro. O envio recalcula as horas que tocou; o cron completa o que faltar (bancos antigos, leituras inseridas à mão).
 */
import type { Env } from './shared'

export interface HourRow {
  hour: number // unix / 3600
  n: number
  temp_avg: number | null; temp_min: number | null; temp_max: number | null
  hum_avg: number | null; hum_n: number
  pres_avg: number | null; pres_min: number | null; pres_max: number | null
  wind_avg: number | null; gust_max: number | null; dir: number | null
  rain: number; vbat_avg: number | null; rssi_avg: number | null
}

interface Raw { ts: number; temp: number | null; hum: number | null; pres: number | null; wind: number | null; gust: number | null; dir: number | null; rain: number | null; vbat: number | null; rssi: number | null }

const r2 = (x: number) => Math.round(x * 100) / 100

function summarize(hour: number, rows: Raw[]): HourRow {
  const vals = (k: keyof Raw) => rows.map((r) => r[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const avg = (a: number[]) => (a.length ? r2(a.reduce((s, v) => s + v, 0) / a.length) : null)
  const temp = vals('temp'), hum = vals('hum'), pres = vals('pres'), wind = vals('wind'), gust = vals('gust')
  // direção: média dos vetores, pesada pelo vento (vento parado quase não muda a direção da hora)
  let x = 0, y = 0
  for (const r of rows) {
    if (typeof r.dir !== 'number' || !Number.isFinite(r.dir)) continue
    const w = typeof r.wind === 'number' && r.wind > 0 ? r.wind : 0.01
    x += Math.cos((r.dir * Math.PI) / 180) * w
    y += Math.sin((r.dir * Math.PI) / 180) * w
  }
  const dir = x || y ? Math.round((((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360) : null
  return {
    hour, n: rows.length,
    temp_avg: avg(temp), temp_min: temp.length ? Math.min(...temp) : null, temp_max: temp.length ? Math.max(...temp) : null,
    hum_avg: avg(hum), hum_n: hum.length,
    pres_avg: avg(pres), pres_min: pres.length ? Math.min(...pres) : null, pres_max: pres.length ? Math.max(...pres) : null,
    wind_avg: avg(wind), gust_max: gust.length ? Math.max(...gust) : null, dir,
    rain: r2(vals('rain').reduce((s, v) => s + v, 0)), vbat_avg: avg(vals('vbat')), rssi_avg: avg(vals('rssi')),
  }
}

/** Recalcula as horas de `fromHour` a `toHour` (inclusive) de uma estação a partir das leituras brutas. */
export async function rebuildHours(env: Env, id: string, fromHour: number, toHour: number) {
  const { results } = await env.DB.prepare('SELECT ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi FROM readings WHERE station_id = ? AND ts >= ? AND ts < ? ORDER BY ts')
    .bind(id, fromHour * 3600, (toHour + 1) * 3600).all<Raw>()
  const byHour = new Map<number, Raw[]>()
  for (const r of results) {
    const h = Math.floor(r.ts / 3600)
    const list = byHour.get(h)
    if (list) list.push(r)
    else byHour.set(h, [r])
  }
  const ins = env.DB.prepare(
    `INSERT OR REPLACE INTO readings_hourly (station_id,hour,n,temp_avg,temp_min,temp_max,hum_avg,hum_n,pres_avg,pres_min,pres_max,wind_avg,gust_max,dir,rain,vbat_avg,rssi_avg)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const stmts: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM readings_hourly WHERE station_id = ? AND hour >= ? AND hour <= ?').bind(id, fromHour, toHour)]
  for (const [h, rows] of byHour) {
    const s = summarize(h, rows)
    stmts.push(ins.bind(id, h, s.n, s.temp_avg, s.temp_min, s.temp_max, s.hum_avg, s.hum_n, s.pres_avg, s.pres_min, s.pres_max, s.wind_avg, s.gust_max, s.dir, s.rain, s.vbat_avg, s.rssi_avg))
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50))
  return byHour.size
}

/** Recalcula as horas tocadas por um lote: agrupa em trechos contínuos para não reler leituras de dias inteiros sem necessidade. */
export async function rebuildTouched(env: Env, id: string, timestamps: number[]) {
  const hours = [...new Set(timestamps.map((t) => Math.floor(t / 3600)))].sort((a, b) => a - b)
  let start = hours[0], prev = hours[0]
  for (let i = 1; i <= hours.length; i++) {
    const h = hours[i]
    if (h === prev + 1) { prev = h; continue }
    if (start !== undefined) await rebuildHours(env, id, start, prev)
    start = h; prev = h
  }
}

/** Resumo das últimas 24 h (chuva, mínima, máxima, rajada) de uma ou de todas as estações, pelas horas. */
export async function daySummaries(env: Env, id?: string) {
  const since = Math.floor(Date.now() / 1000 / 3600) - 23 // a hora atual e as 23 anteriores
  const sql = `SELECT station_id, SUM(rain) rain, MIN(temp_min) tmin, MAX(temp_max) tmax, MAX(gust_max) gust
               FROM readings_hourly WHERE hour >= ?${id ? ' AND station_id = ?' : ''} GROUP BY station_id`
  const q = env.DB.prepare(sql)
  const { results } = await (id ? q.bind(since, id) : q.bind(since)).all<{ station_id: string; rain: number; tmin: number | null; tmax: number | null; gust: number | null }>()
  return new Map(results.map((r) => [r.station_id, { rain: r2(r.rain ?? 0), tmin: r.tmin, tmax: r.tmax, gust: r.gust }]))
}

/** Uma hora resumida no formato de leitura, para o histórico longo (o ponto fica no meio da hora). */
export const hourAsReading = (h: HourRow) => ({
  ts: h.hour * 3600 + 1800, temp: h.temp_avg, hum: h.hum_avg, pres: h.pres_avg, wind: h.wind_avg, gust: h.gust_max,
  dir: h.dir, rain: h.rain, vbat: h.vbat_avg, rssi: h.rssi_avg, agg: 'h' as const,
})

/**
 * Completa o resumo por hora de bancos que já tinham leituras (roda no cron). Anda da leitura mais antiga para a frente, até
 * 4 dias por estação por rodada; quando alcança o presente, a estação fica marcada como pronta.
 */
export async function backfillHourly(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'hourly_backfill'").first<{ value: string }>()
  const done = row ? (JSON.parse(row.value) as Record<string, number>) : {}
  const nowHour = Math.floor(Date.now() / 1000 / 3600)
  const { results } = await env.DB.prepare('SELECT id FROM stations').all<{ id: string }>()
  let changed = false
  for (const { id } of results) {
    let from = done[id]
    if (from === undefined) {
      const first = await env.DB.prepare('SELECT MIN(ts) t FROM readings WHERE station_id = ?').bind(id).first<{ t: number | null }>()
      from = first?.t ? Math.floor(first.t / 3600) : nowHour + 1
    }
    if (from > nowHour) { if (done[id] !== from) { done[id] = from; changed = true } continue }
    const to = Math.min(from + 95, nowHour)
    await rebuildHours(env, id, from, to)
    done[id] = to + 1
    changed = true
  }
  if (changed) {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('hourly_backfill', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(done)).run()
  }
}
