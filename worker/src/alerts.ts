/**
 * Alertas no Telegram. Regra de ouro: avisa só quando o NÍVEL muda (por exemplo, de "ok" para "offline"),
 * e grava o novo nível ANTES de enviar. Se o envio falha, o nível volta ao anterior e o próximo ciclo tenta de novo.
 */
import { batteryPct, compass16, type Config, type Env } from './shared'

export interface TgRules {
  offline: { on: boolean; min: number }
  online: { on: boolean }
  lowBattery: { on: boolean; pct: number }
  batteryOk: { on: boolean }
  gust: { on: boolean; kmh: number }
  rainStart: { on: boolean; mm: number; windowMin: number }
  rainStop: { on: boolean }
}

export interface TgSettings {
  token: string
  chatId: string
  enabled: boolean
  /** ids das estações monitoradas; vazio = todas */
  stations: string[]
  rules: TgRules
  templates: Record<string, string>
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  offline: '🔌 <b>{station}</b> sem dados há {minutes} min ({city}).',
  online: '✅ <b>{station}</b> voltou a enviar dados.',
  lowBattery: '🪫 <b>{station}</b>: bateria baixa, {pct}% ({vbat} V).',
  batteryOk: '🔋 <b>{station}</b>: bateria recuperada, {pct}% ({vbat} V).',
  gust: '💨 <b>{station}</b>: rajada de {gust} km/h de {dir}.',
  rainStart: '🌧 <b>{station}</b>: começou a chover ({rain} mm em {window} min).',
  rainStop: '🌤 <b>{station}</b>: parou de chover.',
}

export const DEFAULT_TG: TgSettings = {
  token: '',
  chatId: '',
  enabled: false,
  stations: [],
  rules: {
    offline: { on: true, min: 60 },
    online: { on: true },
    lowBattery: { on: true, pct: 15 },
    batteryOk: { on: true },
    gust: { on: true, kmh: 60 },
    rainStart: { on: false, mm: 0.5, windowMin: 10 },
    rainStop: { on: false },
  },
  templates: {},
}

/** O Telegram do servidor (administrador) é a chave "telegram"; cada usuário tem o seu em "telegram:e-mail", para as estações dele. */
export const userKey = (email: string) => `telegram:${email.toLowerCase()}`

export async function loadTelegram(env: Env, key = 'telegram'): Promise<TgSettings> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  const saved = row ? (JSON.parse(row.value) as Partial<TgSettings>) : {}
  const rules = { ...DEFAULT_TG.rules } as Record<string, unknown>
  for (const [k, v] of Object.entries(saved.rules ?? {})) rules[k] = { ...(DEFAULT_TG.rules as unknown as Record<string, object>)[k], ...(v as object) }
  return { ...DEFAULT_TG, ...saved, rules: rules as unknown as TgRules, templates: saved.templates ?? {} }
}

export async function saveTelegram(env: Env, patch: Record<string, unknown>, key = 'telegram', allowedStations?: string[]) {
  const cur = await loadTelegram(env, key)
  const next: TgSettings = { ...cur }
  if (typeof patch.token === 'string' && patch.token.trim()) next.token = patch.token.trim()
  if (typeof patch.chatId === 'string') next.chatId = patch.chatId.trim().slice(0, 40)
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled
  if (Array.isArray(patch.stations)) next.stations = (patch.stations.filter((s) => typeof s === 'string').slice(0, 200) as string[]).filter((id) => !allowedStations || allowedStations.includes(id))
  if (patch.rules && typeof patch.rules === 'object') {
    const rules = { ...cur.rules } as unknown as Record<string, Record<string, unknown>>
    for (const [k, v] of Object.entries(patch.rules as Record<string, Record<string, unknown>>)) {
      if (!(k in rules) || typeof v !== 'object' || !v) continue
      for (const [f, val] of Object.entries(v)) {
        if (f in rules[k] && typeof val === typeof rules[k][f]) {
          rules[k][f] = typeof val === 'number' ? Math.min(100000, Math.max(0, val)) : val
        }
      }
    }
    next.rules = rules as unknown as TgRules
  }
  if (patch.templates && typeof patch.templates === 'object') {
    const t: Record<string, string> = {}
    for (const [k, v] of Object.entries(patch.templates as Record<string, unknown>)) {
      if (k in DEFAULT_TEMPLATES && typeof v === 'string' && v.trim()) t[k] = v.slice(0, 600)
    }
    next.templates = t
  }
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(next))
    .run()
  return next
}

/** O que o navegador pode ver: tudo, menos o token. */
export const publicTelegram = (tg: TgSettings) => ({
  tokenSet: !!tg.token, chatId: tg.chatId, enabled: tg.enabled, stations: tg.stations, rules: tg.rules,
  templates: { ...DEFAULT_TEMPLATES, ...tg.templates }, defaults: DEFAULT_TEMPLATES,
})

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function render(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? esc(String(vars[k])) : `{${k}}`))
}

export async function sendTelegram(env: Env, tg: TgSettings, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!tg.token || !tg.chatId) return { ok: false, error: 'Informe o token do bot e o chat.' }
  try {
    const res = await fetch(`${env.TELEGRAM_API ?? 'https://api.telegram.org'}/bot${tg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => ({}))) as { description?: string }
    return { ok: false, error: body.description ?? `Telegram respondeu ${res.status}` }
  } catch {
    return { ok: false, error: 'Não foi possível falar com o Telegram.' }
  }
}

/** Descobre o chat para o qual o bot recebeu mensagem por último (o usuário manda "oi" ao bot e clica em detectar). */
export async function detectChat(env: Env, token: string): Promise<{ ok: boolean; chatId?: string; title?: string; error?: string }> {
  try {
    const res = await fetch(`${env.TELEGRAM_API ?? 'https://api.telegram.org'}/bot${token}/getUpdates`)
    const body = (await res.json()) as { ok: boolean; description?: string; result?: Array<{ message?: { chat?: { id: number; title?: string; first_name?: string } } }> }
    if (!body.ok) return { ok: false, error: body.description ?? 'Token recusado.' }
    const chats = (body.result ?? []).map((u) => u.message?.chat).filter(Boolean) as Array<{ id: number; title?: string; first_name?: string }>
    const last = chats[chats.length - 1]
    if (!last) return { ok: false, error: 'Nenhuma conversa encontrada. Mande uma mensagem ao bot (ou adicione-o ao grupo e escreva algo) e tente de novo.' }
    return { ok: true, chatId: String(last.id), title: last.title ?? last.first_name }
  } catch {
    return { ok: false, error: 'Não foi possível falar com o Telegram.' }
  }
}

// ---------------- estado e transições ----------------
async function getLevel(env: Env, stationId: string, kind: string) {
  const r = await env.DB.prepare('SELECT level FROM alert_state WHERE station_id = ? AND kind = ?').bind(stationId, kind).first<{ level: string }>()
  return r?.level ?? null
}

async function setLevel(env: Env, stationId: string, kind: string, level: string) {
  await env.DB
    .prepare('INSERT INTO alert_state (station_id, kind, level, ts) VALUES (?,?,?,?) ON CONFLICT(station_id, kind) DO UPDATE SET level = excluded.level, ts = excluded.ts')
    .bind(stationId, kind, level, Math.floor(Date.now() / 1000))
    .run()
}

async function transition(env: Env, tg: TgSettings, stationId: string, kind: string, level: string, message: (prev: string | null) => string | null) {
  const prev = await getLevel(env, stationId, kind)
  if (prev === level) return
  await setLevel(env, stationId, kind, level) // grava antes de enviar
  const text = message(prev)
  if (!text) return
  const r = await sendTelegram(env, tg, text)
  if (!r.ok && prev) await setLevel(env, stationId, kind, prev) // desfaz: o próximo ciclo tenta de novo
  else if (!r.ok) await env.DB.prepare('DELETE FROM alert_state WHERE station_id = ? AND kind = ?').bind(stationId, kind).run()
}

export interface AlertStation { id: string; name: string; city: string; config: Config; owner_email?: string | null }
export interface AlertReading { ts: number; gust: number; dir: number; vbat: number; rain: number }

/** O dono usa o Telegram dele, se estiver ligado e completo; senão vale o do administrador. */
async function settingsFor(env: Env, owner: string | null | undefined): Promise<TgSettings> {
  if (owner) {
    const mine = await loadTelegram(env, userKey(owner))
    if (mine.enabled && mine.token && mine.chatId) return mine
  }
  return loadTelegram(env)
}

const watched = (tg: TgSettings, id: string) => tg.enabled && !!tg.token && !!tg.chatId && (tg.stations.length === 0 || tg.stations.includes(id))
const tpl = (tg: TgSettings, key: string) => tg.templates[key] ?? DEFAULT_TEMPLATES[key]

/** Chamada depois de cada envio da estação. */
export async function evaluateAfterIngest(env: Env, st: AlertStation, last: AlertReading) {
  const tg = await settingsFor(env, st.owner_email)
  if (!watched(tg, st.id)) return
  const base = { station: st.name, city: st.city || '—' }
  const pct = batteryPct(last.vbat, st.config.battery_chem)
  const vars = { ...base, pct, vbat: last.vbat.toFixed(2), gust: Math.round(last.gust * 3.6), dir: compass16(last.dir) }

  // voltou a enviar
  await transition(env, tg, st.id, 'offline', 'ok', (prev) => (prev === 'offline' && tg.rules.online.on ? render(tpl(tg, 'online'), vars) : null))

  // bateria: histerese de 5 pontos percentuais
  const low = tg.rules.lowBattery
  const lvl = await getLevel(env, st.id, 'battery')
  const noBattery = last.vbat < 1 // placa na USB, sem bateria: não há o que avisar
  const next = noBattery ? 'ok' : pct <= low.pct ? 'low' : pct >= low.pct + 5 || lvl === null ? 'ok' : (lvl ?? 'ok')
  await transition(env, tg, st.id, 'battery', next, (prev) =>
    next === 'low' ? (low.on ? render(tpl(tg, 'lowBattery'), vars) : null) : prev === 'low' && tg.rules.batteryOk.on ? render(tpl(tg, 'batteryOk'), vars) : null)

  // rajada: volta a "calmo" abaixo de 80% do limite
  const g = tg.rules.gust
  const gustKmh = last.gust * 3.6
  const gl = await getLevel(env, st.id, 'gust')
  const gnext = gustKmh >= g.kmh ? 'strong' : gustKmh < g.kmh * 0.8 || gl === null ? 'calm' : (gl ?? 'calm')
  await transition(env, tg, st.id, 'gust', gnext, () => (gnext === 'strong' && g.on ? render(tpl(tg, 'gust'), vars) : null))

  // chuva: soma da janela
  const r = tg.rules.rainStart
  const since = Math.floor(Date.now() / 1000) - r.windowMin * 60
  const sum = (await env.DB.prepare('SELECT COALESCE(SUM(rain),0) s FROM readings WHERE station_id = ? AND ts >= ?').bind(st.id, since).first<{ s: number }>())?.s ?? 0
  const rl = await getLevel(env, st.id, 'rain')
  const rnext = sum >= r.mm ? 'wet' : sum === 0 || rl === null ? 'dry' : (rl ?? 'dry')
  await transition(env, tg, st.id, 'rain', rnext, (prev) =>
    rnext === 'wet' ? (r.on ? render(tpl(tg, 'rainStart'), { ...vars, rain: sum.toFixed(1), window: r.windowMin }) : null)
    : prev === 'wet' && tg.rules.rainStop.on ? render(tpl(tg, 'rainStop'), vars) : null)
}

/** Chamada pelo cron: estações que pararam de enviar. */
export async function evaluateOffline(env: Env) {
  const { results } = await env.DB.prepare('SELECT id, name, city, config, last_seen, owner_email FROM stations').all<{ id: string; name: string; city: string; config: string; last_seen: number | null; owner_email: string | null }>()
  const now = Math.floor(Date.now() / 1000)
  const cache = new Map<string, TgSettings>()
  for (const s of results) {
    const key = s.owner_email ?? ''
    let tg = cache.get(key)
    if (!tg) { tg = await settingsFor(env, s.owner_email); cache.set(key, tg) }
    if (!tg.enabled || !tg.token || !tg.chatId) continue
    if (!watched(tg, s.id) || !s.last_seen) continue
    const cfg = JSON.parse(s.config) as Config
    // envia em lote: o tempo esperado entre contatos é intervalo × lote
    const expected = cfg.interval_min * Math.max(1, cfg.send_every) * 60
    const limit = Math.max(tg.rules.offline.min * 60, expected * 2.5)
    if (now - s.last_seen < limit) continue
    const minutes = Math.round((now - s.last_seen) / 60)
    await transition(env, tg, s.id, 'offline', 'offline', () =>
      tg.rules.offline.on ? render(tpl(tg, 'offline'), { station: s.name, city: s.city || '—', minutes }) : null)
  }
}
