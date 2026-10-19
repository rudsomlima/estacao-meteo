/**
 * Quem está falando com a API do lado do navegador.
 *
 *  - Login com Google: o navegador manda o ID token do Google (Google Identity Services); aqui ele é conferido (assinatura RS256
 *    com as chaves públicas do Google, `aud` = nosso Client ID, validade, e-mail verificado) e vira um cookie de sessão assinado.
 *  - Papéis: "admin" (e-mails em ADMIN_EMAILS, ou promovidos por outro admin) e "user". Usuário comum só mexe nas estações dele.
 *  - O token de administrador antigo (HMAC) continua valendo para scripts e testes, e conta como administrador.
 *
 * A chave de assinatura da sessão fica no banco (settings.session_secret) e pode ser trocada pelo admin, o que encerra todas as sessões.
 */
import { hmacHex, randomHex, same, sha256Hex } from './crypto'
import type { Env } from './shared'

export interface User { email: string; name: string; picture: string; role: 'admin' | 'user' }
export interface Actor { email: string | null; role: 'admin' | 'user'; via: 'token' | 'session' }

const enc = new TextEncoder()
const dec = new TextDecoder()
const SESSION_DAYS = 30
const COOKIE = 'sess'

// ---------------- base64url ----------------
export const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const unb64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

// ---------------- configurações no banco ----------------
export async function getSetting(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  return r?.value ?? null
}
export const putSetting = (env: Env, key: string, value: string) =>
  env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run()

async function sessionSecret(env: Env) {
  let s = await getSetting(env, 'session_secret')
  if (!s) { s = randomHex(32); await putSetting(env, 'session_secret', s) }
  return s
}

/** Token de administrador em vigor: o trocado pelo painel (guardado no banco) ou, se nunca foi trocado, o segredo do Worker. */
export async function currentAdminToken(env: Env) {
  return (await getSetting(env, 'admin_token')) ?? env.ADMIN_TOKEN ?? ''
}

export const adminEmails = (env: Env) => (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

// ---------------- sessão ----------------
async function signSession(env: Env, email: string) {
  const body = b64u(enc.encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 })))
  return `${body}.${await hmacHex(await sessionSecret(env), body)}`
}

async function readSession(req: Request, env: Env): Promise<string | null> {
  const cookie = req.headers.get('cookie') ?? ''
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  if (!m) return null
  const [body, sig] = m[1].split('.')
  if (!body || !sig || !same(await hmacHex(await sessionSecret(env), body), sig)) return null
  try {
    const p = JSON.parse(dec.decode(unb64u(body))) as { e?: string; x?: number }
    return p.e && typeof p.x === 'number' && p.x > Date.now() / 1000 ? p.e : null
  } catch { return null }
}

export const sessionCookie = (req: Request, value: string, maxAgeS = SESSION_DAYS * 86400) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`

// ---------------- Google ----------------
interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs'

async function googleKeys(env: Env, force = false): Promise<Jwk[]> {
  const url = env.GOOGLE_JWKS_URL ?? GOOGLE_JWKS
  const cache = (caches as unknown as { default: Cache }).default
  const req = new Request(url)
  if (!force) {
    const hit = await cache.match(req)
    if (hit) return ((await hit.json()) as { keys: Jwk[] }).keys
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error('não consegui buscar as chaves do Google')
  const text = await r.text()
  await cache.put(req, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } }))
  return (JSON.parse(text) as { keys: Jwk[] }).keys
}

/** Confere o ID token do Google. Devolve os dados do usuário ou lança um erro com o motivo. */
export async function verifyGoogleToken(env: Env, credential: string): Promise<{ email: string; name: string; picture: string }> {
  if (!env.GOOGLE_CLIENT_ID) throw new Error('login com Google não configurado (GOOGLE_CLIENT_ID)')
  const parts = credential.split('.')
  if (parts.length !== 3) throw new Error('token inválido')
  const header = JSON.parse(dec.decode(unb64u(parts[0]))) as { kid?: string; alg?: string }
  const claims = JSON.parse(dec.decode(unb64u(parts[1]))) as Record<string, unknown>
  if (header.alg !== 'RS256') throw new Error('algoritmo não aceito')

  // chaves em cache; se a chave não aparece ou a assinatura não confere, busca de novo uma vez (o Google gira as chaves)
  let ok = false
  for (const force of [false, true]) {
    const jwk = (await googleKeys(env, force)).find((k) => k.kid === header.kid)
    if (!jwk) continue
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`))
    if (ok) break
  }
  if (!ok) throw new Error('assinatura inválida')

  const now = Date.now() / 1000
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('emissor inválido')
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('o token não é para este site')
  if (typeof claims.exp !== 'number' || claims.exp < now - 30) throw new Error('token vencido')
  if (claims.email_verified !== true || typeof claims.email !== 'string') throw new Error('e-mail do Google não verificado')
  return { email: claims.email.toLowerCase(), name: String(claims.name ?? '').slice(0, 80), picture: String(claims.picture ?? '').slice(0, 300) }
}

/** Cria ou atualiza o usuário no primeiro login e a cada entrada. */
export async function upsertUser(env: Env, g: { email: string; name: string; picture: string }): Promise<User> {
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(g.email).first<{ role: string }>()
  const role: 'admin' | 'user' = adminEmails(env).includes(g.email) || row?.role === 'admin' ? 'admin' : 'user'
  await env.DB
    .prepare(
      `INSERT INTO users (email, name, picture, role, created_at, last_login) VALUES (?,?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, picture = excluded.picture, role = excluded.role, last_login = excluded.last_login`,
    )
    .bind(g.email, g.name, g.picture, role, now, now)
    .run()
  return { email: g.email, name: g.name, picture: g.picture, role }
}

export const newSession = (env: Env, email: string) => signSession(env, email)

// ---------------- quem é quem em cada pedido ----------------
/**
 * Administrador pelo token antigo: X-Ts (ms) e X-Sig = HMAC-SHA256(token, `${ts}|${método}|${caminho+query}|${sha256(corpo)}`).
 * Quem escuta a rede vê só a assinatura, que vale por 2 minutos e para aquele pedido.
 */
async function tokenAdmin(req: Request, env: Env, raw: Uint8Array) {
  const ts = Number(req.headers.get('x-ts'))
  const sig = req.headers.get('x-sig') ?? ''
  if (!sig || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 120_000) return false
  const token = await currentAdminToken(env)
  if (!token) return false
  const url = new URL(req.url)
  return same(await hmacHex(token, `${ts}|${req.method}|${url.pathname}${url.search}|${await sha256Hex(raw)}`), sig)
}

export async function getUser(req: Request, env: Env): Promise<User | null> {
  const email = await readSession(req, env)
  if (!email) return null
  const u = await env.DB.prepare('SELECT email, name, picture, role FROM users WHERE email = ?').bind(email).first<User>()
  return u ?? null
}

/** Administrador (token ou sessão) ou usuário logado; null se ninguém. */
export async function getActor(req: Request, env: Env, raw: Uint8Array): Promise<Actor | null> {
  if (req.headers.get('x-sig') && (await tokenAdmin(req, env, raw))) return { email: null, role: 'admin', via: 'token' }
  const u = await getUser(req, env)
  if (!u) return null
  // pedido que muda algo, vindo do navegador: a origem precisa ser o próprio site (defesa extra além do SameSite do cookie)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== new URL(req.url).host) return null
  }
  return { email: u.email, role: u.role, via: 'session' }
}

export async function audit(env: Env, actor: Actor | null, action: string, target = '', detail = '') {
  try {
    await env.DB.prepare('INSERT INTO audit (ts, actor, action, target, detail) VALUES (?,?,?,?,?)')
      .bind(Math.floor(Date.now() / 1000), actor?.email ?? (actor ? 'token-admin' : 'sistema'), action, target, detail.slice(0, 400)).run()
  } catch (e) { console.warn('auditoria falhou', e) }
}

/** Troca o token de administrador. Devolve o novo (aparece uma vez só). */
export async function rotateAdminToken(env: Env) {
  const token = randomHex(18)
  await putSetting(env, 'admin_token', token)
  return token
}

/** Encerra todas as sessões (troca a chave que as assina). */
export const revokeSessions = (env: Env) => putSetting(env, 'session_secret', randomHex(32))
