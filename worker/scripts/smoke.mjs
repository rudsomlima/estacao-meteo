// Teste de fumaça da API. Precisa do worker rodando (npm run dev) e do banco com seed (npm run seed:local).
// O .dev.vars precisa ter ADMIN_TOKEN=admin-troque e TELEGRAM_API=http://127.0.0.1:8799 (este script sobe um Telegram falso nessa porta).
// Uso: node scripts/smoke.mjs [http://127.0.0.1:8787]
import { createHash, createHmac, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const ADMIN = 'admin-troque'
const KEY = 'dev-key-serra'
const SECRET = createHash('sha256').update(KEY).digest('hex')
const sha = (d) => createHash('sha256').update(d).digest('hex')
const hmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex')

let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- Telegram falso
const sent = []
const fake = createServer((req, res) => {
  let b = ''
  req.on('data', (c) => (b += c))
  req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    if (req.url.endsWith('/sendMessage')) { sent.push(JSON.parse(b)); res.end('{"ok":true}') }
    else if (req.url.endsWith('/getUpdates')) res.end(JSON.stringify({ ok: true, result: [{ message: { chat: { id: 4242, first_name: 'Teste' } } }] }))
    else res.end('{"ok":false}')
  })
})
await new Promise((r) => fake.listen(8799, '127.0.0.1', r))

// ---- chamadas
async function call(method, path, { body, headers = {}, raw } = {}) {
  const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body))
  const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: payload })
  const buf = Buffer.from(await r.arrayBuffer())
  let json = null
  try { json = JSON.parse(buf.toString()) } catch { /* binário */ }
  return { status: r.status, json, buf, headers: r.headers, text: buf.toString() }
}

/** Pedido de administrador assinado. */
function admin(method, path, { body, raw } = {}) {
  const payload = raw ?? (body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)))
  const ts = Date.now()
  const sig = hmac(ADMIN, `${ts}|${method}|${path}|${sha(payload)}`)
  return call(method, path, { raw: payload.length ? payload : undefined, headers: { 'x-ts': String(ts), 'x-sig': sig, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) } })
}

const reading = { temp: 20.5, hum: 62, pres: 835.1, wind: 3.2, gust: 5.5, dir: 210, rain: 0.2, vbat: 3.9, rssi: -60 }
const dev = { 'x-device-key': KEY }

for (let i = 0; i < 40; i++) {
  try { await fetch(BASE + '/api/stations'); break } catch { await sleep(1000) }
}

// ================= leitura pública
let r = await call('GET', '/api/stations')
check('lista as estações', r.status === 200 && Array.isArray(r.json) && r.json.length >= 1)
check('não expõe a chave nem o nonce', !r.text.includes('key_hash') && !r.text.includes('"nonce"'))

// ================= envio com a chave (HTTPS)
r = await call('POST', '/api/ingest', { body: { ...reading, cfg: 0 }, headers: dev })
check('aceita leitura solta e devolve a configuração', r.status === 200 && r.json.config?.send_every >= 1, r.text)

// ---- tempo real (WebSocket em /api/live): a estação envia e o navegador é avisado, sem perguntar
{
  const msgs = []
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/api/live')
  ws.onmessage = (e) => msgs.push(String(e.data))
  await new Promise((res) => { ws.onopen = res; ws.onerror = res; setTimeout(res, 3000) })
  check('abre o WebSocket em /api/live', ws.readyState === 1)
  ws.send('ping')
  await sleep(300)
  check('responde ao ping sem acordar o servidor', msgs.includes('pong'), JSON.stringify(msgs))
  msgs.length = 0
  await call('POST', '/api/ingest', { body: reading, headers: dev })
  await sleep(500)
  check('avisa os navegadores quando a estação envia', msgs.some((m) => m.includes('"update"') && m.includes('serra')), JSON.stringify(msgs))
  ws.close()
}
check('a resposta vem assinada', r.headers.get('x-sig') === hmac(SECRET, `|${r.text}`))

r = await call('POST', '/api/ingest', { body: { cfg: 999, fw: '0.1.0', batch: [0, 1, 2].map((i) => ({ ...reading, age: 1800 - i * 600, wind: 3 + i })) }, headers: dev })
check('aceita lote com idade por leitura', r.status === 200 && r.json.stored === 3, r.text)
r = await call('GET', '/api/stations/serra/readings?hours=1')
check('a leitura antiga ficou com o horário certo', r.json.filter((x) => Date.now() / 1000 - x.ts > 1500 && x.wind === 3).length >= 1)

r = await call('GET', '/api/stations/serra')
check('guarda a versão da configuração que a estação disse ter', r.json.cfg_applied === 999 && r.json.fw_version === '0.1.0' && r.json.last_seen > Date.now() / 1000 - 60, r.text)

r = await call('POST', '/api/ingest', { body: { batch: [{ ...reading, hum: 140 }] }, headers: dev })
check('rejeita valor fora da faixa', r.status === 422)
r = await call('POST', '/api/ingest', { body: { batch: Array(25).fill(reading) }, headers: dev })
check('rejeita lote grande demais', r.status === 422)
r = await call('POST', '/api/ingest', { body: {}, headers: { 'x-device-key': 'errada' } })
check('rejeita chave errada', r.status === 401)

// ================= envio assinado (HTTP): sem a chave no fio e com nonce
const signedPost = (body, nonce) => {
  const text = JSON.stringify(body)
  return call('POST', '/api/ingest', { raw: Buffer.from(text), headers: { 'content-type': 'application/json', 'x-station': 'serra', 'x-nonce': nonce, 'x-sig': hmac(SECRET, `serra|${nonce}|${text}`) } })
}
const body1 = { cfg: 999, batch: [{ ...reading }] }
let start = ''
r = await signedPost(body1, start)
if (r.status === 401 && r.json?.nonce) { start = r.json.nonce; r = await signedPost(body1, start) } // banco já usado: pega o nonce atual
check('envio assinado é aceito e devolve o nonce novo', r.status === 200 && !!r.json.nonce, r.text)
check('a resposta assinada confere (HTTP)', r.headers.get('x-sig') === hmac(SECRET, `${start}|${r.text}`))
const n1 = r.json.nonce
const replay = await signedPost(body1, start)
check('repetir um pedido capturado é recusado', replay.status === 401 && replay.json?.nonce === n1, replay.text)
r = await signedPost(body1, n1)
check('o nonce novo funciona e muda de novo', r.status === 200 && r.json.nonce !== n1 && r.headers.get('x-sig') === hmac(SECRET, `${n1}|${r.text}`), r.text)
r = await call('POST', '/api/ingest', { body: body1, headers: { 'x-station': 'serra', 'x-nonce': r.json.nonce, 'x-sig': 'zzzz' } })
check('assinatura errada é recusada', r.status === 401)

// ================= eventos do firmware
r = await call('POST', '/api/ingest', { body: { cfg: 999, batch: [{ ...reading }], events: [{ kind: 'boot', reason: 3, wake: 'power-on', count: 7, age: 20 }, { kind: 'nao_existe' }] }, headers: dev })
check('aceita eventos', r.status === 200)
r = await call('GET', '/api/stations/serra/events?limit=5')
check('lista os eventos (ignora os desconhecidos)', r.json.length >= 1 && r.json[0].kind === 'boot' && r.json[0].count === 7, r.text)

// ================= administrador: assinatura, não token
r = await call('POST', '/api/stations', { body: {}, headers: { authorization: `Bearer ${ADMIN}` } })
check('o token puro não vale mais', r.status === 401)
r = await call('POST', '/api/stations', { body: {} })
check('criar estação exige assinatura', r.status === 401)
const old = Date.now() - 600_000
r = await call('POST', '/api/stations', { raw: Buffer.from('{}'), headers: { 'x-ts': String(old), 'x-sig': hmac(ADMIN, `${old}|POST|/api/stations|${sha('{}')}`) } })
check('assinatura antiga (10 min) é recusada', r.status === 401)

const id = 'smoke-' + Math.random().toString(36).slice(2, 7)
r = await admin('POST', '/api/stations', { body: { id, name: 'Teste', lat: -23, lon: -46, battery_chem: 'aa', continuous_wind: 1, send_every: 99, bench_min: 99, charge_above_v: 4.1 } })
check('cria estação e devolve a chave uma vez', r.status === 201 && typeof r.json.key === 'string' && r.json.config.continuous_wind === 1 && r.json.config.send_every === 12 && r.json.config.bench_min === 30 && r.json.config.charge_above_v === 4.1, r.text)
r = await admin('PUT', `/api/stations/${id}`, { body: { name: 'Teste 2', config: { interval_min: 15, urgent_gust_kmh: 60, wifi_tx_save: 1 } } })
check('atualiza e sobe a versão da configuração', r.status === 200 && r.json.config.version === 2 && r.json.config.urgent_gust_kmh === 60 && r.json.config.wifi_tx_save === 1, r.text)

// ================= OTA
const fw = randomBytes(150_000)
r = await admin('POST', `/api/stations/serra/firmware?version=9.9.9`, { raw: fw })
check('publica firmware', r.status === 201 && r.json.sha256 === sha(fw), r.text)
r = await call('GET', '/api/stations/serra/firmware')
check('informa publicado x instalado', r.json.published?.version === '9.9.9' && r.json.installed === '0.1.0', r.text)
r = await call('POST', '/api/ingest', { body: { cfg: 999, fw: '0.1.0', batch: [{ ...reading }] }, headers: dev })
check('oferece a atualização quando a versão é diferente', r.json.ota?.version === '9.9.9' && r.json.ota.sha256 === sha(fw), r.text)
r = await call('POST', '/api/ingest', { body: { cfg: 999, fw: '9.9.9', batch: [{ ...reading }] }, headers: dev })
check('não oferece quando a versão é a mesma', r.json.ota === null, r.text)
r = await call('GET', '/api/ota/firmware.bin', { headers: dev })
check('a estação baixa o binário inteiro', r.status === 200 && r.buf.equals(fw) && r.headers.get('x-sha256') === sha(fw))
r = await call('GET', '/api/ota/firmware.bin')
check('o download exige credencial', r.status === 401)
r = await admin('POST', `/api/stations/serra/firmware?version=1`, { raw: Buffer.alloc(10) })
check('rejeita firmware pequeno demais', r.status === 422)
r = await admin('DELETE', '/api/stations/serra/firmware')
r = await call('GET', '/api/stations/serra/firmware')
check('despublicar apaga o firmware', r.json.published === null)

// ================= resumo diário e uso
r = await call('GET', '/api/stations/serra/daily?days=10&tz=-180')
check('resumo por dia', r.status === 200 && r.json.length >= 5 && 'tmax' in r.json[0] && 'rain' in r.json[0], r.text.slice(0, 120))
r = await call('GET', '/api/usage')
check('uso do banco exige assinatura', r.status === 401)
r = await admin('GET', '/api/usage')
check('uso do banco', r.status === 200 && r.json.readings > 100 && r.json.stations >= 6, r.text.slice(0, 120))

// ================= Telegram
r = await call('GET', '/api/settings/telegram')
check('configuração do Telegram exige assinatura', r.status === 401)
r = await admin('PUT', '/api/settings/telegram', { body: { token: 'SEGREDO', chatId: '1', enabled: true, rules: { gust: { on: true, kmh: 50 }, lowBattery: { on: true, pct: 20 } } } })
check('salva as regras sem devolver o token', r.status === 200 && r.json.tokenSet === true && !r.text.includes('SEGREDO') && r.json.rules.gust.kmh === 50, r.text)
r = await admin('GET', '/api/settings/telegram')
check('ler de novo também não mostra o token', r.status === 200 && !r.text.includes('SEGREDO') && r.json.chatId === '1')
r = await admin('POST', '/api/telegram/test', { body: { kind: 'gust' } })
check('mensagem de teste chega', r.status === 200 && sent.at(-1)?.text.includes('Teste') && sent.at(-1).text.includes('72 km/h'), JSON.stringify(sent.at(-1)))
r = await admin('POST', '/api/telegram/detect-chat', { body: {} })
check('detecta o chat', r.status === 200 && r.json.chatId === '4242', r.text)

sent.length = 0
const strong = { ...reading, gust: 20 } // 72 km/h
await call('POST', '/api/ingest', { body: { cfg: 999, batch: [strong] }, headers: dev })
await sleep(600)
check('avisa a rajada forte', sent.length === 1 && sent[0].text.includes('rajada de 72 km/h'), JSON.stringify(sent))
await call('POST', '/api/ingest', { body: { cfg: 999, batch: [strong] }, headers: dev })
await sleep(600)
check('não repete enquanto o nível não muda', sent.length === 1, JSON.stringify(sent.length))
await call('POST', '/api/ingest', { body: { cfg: 999, batch: [{ ...reading, gust: 4 }] }, headers: dev })
await call('POST', '/api/ingest', { body: { cfg: 999, batch: [strong] }, headers: dev })
await sleep(600)
check('avisa de novo depois de voltar ao calmo', sent.length === 2, JSON.stringify(sent.length))

await call('POST', '/api/ingest', { body: { cfg: 999, batch: [{ ...reading, vbat: 3.3 }] }, headers: dev })
await sleep(600)
check('avisa bateria baixa', sent.some((m) => m.text.includes('bateria baixa')), JSON.stringify(sent.map((m) => m.text)))

sent.length = 0
await call('GET', '/__scheduled?cron=*/5+*+*+*+*')
await sleep(1500)
check('o cron avisa de estação offline', sent.some((m) => m.text.includes('Mantiqueira')), JSON.stringify(sent.map((m) => m.text)))
const n = sent.length
await call('GET', '/__scheduled?cron=*/5+*+*+*+*')
await sleep(1500)
check('o cron não repete o aviso offline', sent.length === n, `${sent.length} vs ${n}`)

// ================= pareamento por código
r = await call('POST', `/api/stations/${id}/claim`, { body: {} })
check('gerar código exige assinatura', r.status === 401)
r = await admin('POST', `/api/stations/${id}/claim`, { body: {} })
const code = r.json?.code
check('gera o código de pareamento', r.status === 201 && /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code ?? ''), r.text)
r = await call('POST', '/api/claim', { body: { code: 'ZZZ-ZZZ' } })
check('código errado é recusado', r.status === 403)
r = await call('POST', '/api/claim', { body: { code: String(code).toLowerCase().replace('-', ' ') } })
check('troca o código pela chave (aceita minúsculas e espaço)', r.status === 200 && r.json?.id === id && typeof r.json?.key === 'string' && r.json.key.length > 20, r.text)
const claimedKey = r.json?.key
r = await call('POST', '/api/ingest', { body: { batch: [{ ...reading, age: 0 }] }, headers: { 'x-device-key': claimedKey } })
check('a chave recebida funciona no envio', r.status === 200, r.text)
r = await call('POST', '/api/claim', { body: { code } })
check('o código só vale uma vez', r.status === 403)
let limited = false
for (let i = 0; i < 25 && !limited; i++) limited = (await call('POST', '/api/claim', { body: { code: 'AAAAAA' } })).status === 429
check('limita tentativas erradas (429)', limited)

await admin('PUT', '/api/settings/telegram', { body: { enabled: false } })
r = await admin('DELETE', `/api/stations/${id}`)
check('apaga a estação de teste', r.status === 200)


// ================= login com Google, papéis e donos
// Servidor de chaves do Google falso (o Worker de teste aponta para ele por GOOGLE_JWKS_URL) e assinatura de ID tokens.
const CLIENT_ID = '727995599749-mk2q8n0556ni60vqsienpapsasuqto45.apps.googleusercontent.com'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'teste-1', alg: 'RS256', use: 'sig' }
const jwks = createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })) })
await new Promise((r) => jwks.listen(8798, '127.0.0.1', r))
const b64u = (b) => Buffer.from(b).toString('base64url')
function idToken(email, over = {}) {
  const head = b64u(JSON.stringify({ alg: 'RS256', kid: 'teste-1', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, email, email_verified: true, name: email.split('@')[0], exp: Math.floor(Date.now() / 1000) + 3600, ...over }))
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey)
  return `${head}.${body}.${b64u(sig)}`
}
async function login(email, over) {
  const r = await call('POST', '/api/auth/google', { body: { credential: idToken(email, over) } })
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]
  return { r, cookie }
}
const as = (cookie) => ({ headers: { cookie } })
const asBody = (cookie, body) => ({ body, headers: { cookie } })

let r2 = await call('GET', '/api/auth/config')
check('informa o Client ID do Google', r2.json?.clientId === CLIENT_ID, r2.text)
// entrada sem senha (só dev: DEV_LOGIN=1 no .dev.vars e pedido de localhost)
r2 = await call('POST', '/api/auth/dev', { body: { role: 'user' } })
check('entrada sem senha como usuário (dev)', r2.status === 200 && r2.json?.user?.role === 'user' && /sess=/.test(r2.headers.get('set-cookie') ?? ''), r2.text)
r2 = await call('POST', '/api/auth/dev', { body: { role: 'admin' } })
check('entrada sem senha como administrador (dev)', r2.status === 200 && r2.json?.user?.role === 'admin', r2.text)
r2 = await call('GET', '/api/auth/me')
check('sem login, /me devolve user nulo', r2.status === 200 && r2.json?.user === null)
r2 = (await login('rudsomlima@gmail.com')).r
check('o e-mail de ADMIN_EMAILS entra como administrador', r2.status === 200 && r2.json?.user?.role === 'admin', r2.text)
const adm = (await login('rudsomlima@gmail.com')).cookie
const ana = (await login('ana@exemplo.com')).cookie
const beto = (await login('beto@exemplo.com')).cookie
r2 = await call('GET', '/api/auth/me', as(ana))
check('usuário comum entra como "user"', r2.json?.user?.role === 'user' && r2.json.user.email === 'ana@exemplo.com', r2.text)
check('token de outro cliente é recusado', (await login('x@exemplo.com', { aud: 'outro.apps.googleusercontent.com' })).r.status === 401)
check('token vencido é recusado', (await login('x@exemplo.com', { exp: Math.floor(Date.now() / 1000) - 600 })).r.status === 401)
check('e-mail não verificado é recusado', (await login('x@exemplo.com', { email_verified: false })).r.status === 401)
check('assinatura adulterada é recusada', (await call('POST', '/api/auth/google', { body: { credential: idToken('a@b.com').slice(0, -6) + 'AAAAAA' } })).status === 401)
r2 = await call('POST', '/api/auth/google', { body: { credential: idToken('ana@exemplo.com') }, headers: { origin: 'https://site-malicioso.example' } })
check('login vindo de outra origem é recusado', r2.status === 403)

// donos e permissões
const station = (sid) => ({ id: sid, name: 'Da ' + sid, lat: -22.9, lon: -43.2, city: 'Teste' })
r2 = await call('POST', '/api/stations', { body: station('ana-sitio') })
check('criar estação exige login', r2.status === 401)
r2 = await call('POST', '/api/stations', asBody(ana, station('ana-sitio')))
check('usuário comum não cadastra dispositivo', r2.status === 403, r2.text)
r2 = await call('POST', '/api/stations', asBody(adm, { ...station('ana-sitio'), owner_email: 'ANA@exemplo.com' }))
check('o administrador cadastra a estação e indica o dono', r2.status === 201 && typeof r2.json?.key === 'string', r2.text)
r2 = await call('GET', '/api/stations', as(ana))
const mine = r2.json?.find((x) => x.id === 'ana-sitio')
check('a lista marca can_edit só nas estações dela', mine?.can_edit === true && r2.json.filter((x) => x.can_edit).length === 1 && !r2.text.includes('owner_email'), r2.text.slice(0, 200))
r2 = await call('GET', '/api/stations', as(adm))
check('o administrador vê o dono e edita todas', r2.json.every((x) => x.can_edit === true) && r2.json.find((x) => x.id === 'ana-sitio')?.owner_email === 'ana@exemplo.com')
r2 = await call('PUT', '/api/stations/ana-sitio', asBody(ana, { name: 'Sítio da Ana', config: { interval_min: 20, send_every: 2 } }))
check('o dono altera todos os ajustes da estação', r2.status === 200 && r2.json?.config?.interval_min === 20, r2.text)
r2 = await call('PUT', '/api/stations/ana-sitio', asBody(beto, { name: 'invasão' }))
check('outro usuário não altera a estação', r2.status === 403, r2.text)
for (const [nome, m, path, body] of [['troca a chave', 'POST', '/api/stations/ana-sitio/key', {}], ['gera código de pareamento', 'POST', '/api/stations/ana-sitio/claim', {}], ['remove a estação', 'DELETE', '/api/stations/ana-sitio', undefined]]) {
  check(`o dono não ${nome} (só administrador)`, (await call(m, path, body === undefined ? as(ana) : asBody(ana, body))).status === 403)
  check(`outro usuário não ${nome}`, (await call(m, path, body === undefined ? as(beto) : asBody(beto, body))).status === 403)
}
r2 = await call('POST', '/api/stations/ana-sitio/firmware?version=1.0.0', { raw: Buffer.alloc(150_000, 1), headers: { cookie: ana } })
check('o dono não publica firmware', r2.status === 403)
r2 = await call('PUT', '/api/stations/serra', asBody(ana, { name: 'x' }))
check('usuário não mexe em estação sem dono (só administrador)', r2.status === 403)
// ---- sensores e pinos
r2 = await call('PUT', '/api/stations/serra', asBody(adm, { config: { pin_rain: 7 } }))
check('recusa pino de chuva que não acorda do deep sleep', r2.status === 422 && /chuva/.test(r2.text), r2.text)
r2 = await call('PUT', '/api/stations/serra', asBody(adm, { config: { pin_sda: 4 } }))
check('recusa pino repetido', r2.status === 422 && /GPIO4/.test(r2.text), r2.text)
r2 = await call('PUT', '/api/stations/serra', asBody(adm, { config: { pin_scl: 9 } }))
check('recusa pino de boot', r2.status === 422, r2.text)
r2 = await call('PUT', '/api/stations/serra', asBody(adm, { config: { env_sensor: 2, pin_sda: 5, pin_scl: 10 } }))
check('aceita MS5611 e pinos novos válidos', r2.status === 200 && r2.json.config.env_sensor === 2 && r2.json.config.pin_sda === 5 && r2.json.config.pin_scl === 10, r2.text)
r2 = await call('POST', '/api/ingest', { body: { batch: [{ temp: 18, pres: 900, wind: 1, gust: 2, dir: 90, rain: 0, vbat: 3.9, rssi: -60 }] }, headers: dev })
check('aceita leitura sem umidade (MS5611) e a estação recebe sensor e pinos', r2.status === 200 && r2.json.config?.env_sensor === 2 && r2.json.config?.pin_sda === 5, r2.text)
r2 = await call('GET', '/api/stations/serra/readings?hours=1')
check('a leitura sem umidade fica nula', r2.json.some((x) => x.hum === null && x.pres === 900), r2.text)
r2 = await call('GET', '/api/stations/serra')
check('guarda a entrega da configuração (versão e hora)', typeof r2.json.cfg_sent === 'number' && r2.json.cfg_sent_at > 0 && r2.json.cfg_sent !== r2.json.cfg_applied, r2.text)
r2 = await call('PUT', '/api/stations/serra', asBody(adm, { config: { env_sensor: 1, pin_sda: 6, pin_scl: 7 } }))
check('volta ao BME280 e aos pinos padrão', r2.status === 200 && r2.json.config.env_sensor === 1, r2.text)

r2 = await call('GET', '/api/admin/overview', as(ana))
check('usuário comum não acessa /api/admin', r2.status === 403)
r2 = await call('GET', '/api/usage', as(ana))
check('usuário comum não vê o uso do banco', r2.status === 403)
r2 = await call('GET', '/api/admin/overview', as(adm))
check('administrador acessa a visão geral', r2.status === 200 && Array.isArray(r2.json?.stations), r2.text.slice(0, 200))
r2 = await call('PUT', '/api/stations/ana-sitio', asBody(adm, { name: 'Sítio da Ana (admin)' }))
check('o administrador altera a estação de qualquer um', r2.status === 200)

// padrão e configuração em massa
r2 = await call('PUT', '/api/admin/defaults', asBody(adm, { config: { send_every: 1, wifi_tx_save: 1 } }))
check('padrão para estações novas é salvo', r2.json?.config?.send_every === 1 && r2.json.config.wifi_tx_save === 1, r2.text)
r2 = await call('POST', '/api/stations', asBody(adm, { ...station('beto-casa'), owner_email: 'beto@exemplo.com' }))
check('estação nova nasce com o padrão do administrador e com o dono', r2.status === 201 && r2.json.config.send_every === 1 && r2.json.config.wifi_tx_save === 1, r2.text)
await call('PUT', '/api/admin/defaults', asBody(adm, { config: { send_every: 3, wifi_tx_save: 0 } }))
r2 = await call('POST', '/api/admin/config', asBody(adm, { ids: ['ana-sitio', 'beto-casa'], config: { bench_min: 7, interval_min: 99 } }))
check('configuração em massa em estações selecionadas', r2.status === 200 && r2.json?.updated === 2, r2.text)
r2 = await call('GET', '/api/stations', as(adm))
const ab = r2.json.filter((x) => ['ana-sitio', 'beto-casa'].includes(x.id))
check('só os campos enviados mudam e a versão sobe', ab.every((x) => x.config.bench_min === 7 && x.config.interval_min === 60 && x.config.version >= 2) && ab.find((x) => x.id === 'ana-sitio').config.send_every === 2, JSON.stringify(ab.map((x) => x.config)))
r2 = await call('POST', '/api/admin/config', asBody(ana, { ids: 'all', config: { bench_min: 0 } }))
check('usuário comum não aplica configuração em massa', r2.status === 403)

// firmware: uma versão para várias estações, com o resultado de cada uma
const bin = Buffer.alloc(150_000, 7); bin[0] = 0xe9
const rel = await call('POST', '/api/admin/releases?version=9.9.9&notes=teste', { raw: bin, headers: { cookie: adm, 'content-type': 'application/octet-stream' } })
check('admin cria uma versão de firmware', rel.status === 201 && rel.json?.version === '9.9.9', rel.text)
const relId = rel.json?.id
r2 = await call('POST', '/api/admin/releases?version=1.0.0', { raw: Buffer.alloc(150_000, 1), headers: { cookie: adm } })
check('firmware que não começa com 0xE9 é recusado', r2.status === 422)
r2 = await call('POST', '/api/admin/releases?version=9.9.9', { raw: bin, headers: { cookie: ana } })
check('usuário comum não cria versão de firmware', r2.status === 403)
r2 = await call('POST', `/api/admin/releases/${relId}/assign`, asBody(adm, { ids: ['ana-sitio', 'beto-casa'] }))
check('atribui a versão a estações selecionadas', r2.status === 200 && r2.json?.assigned === 2, r2.text)
const keyBeto = (await call('POST', '/api/stations/beto-casa/key', asBody(adm, {}))).json?.key
const keyAna = (await call('POST', '/api/stations/ana-sitio/key', asBody(adm, {}))).json?.key
r2 = await call('POST', '/api/ingest', { body: { ...reading, fw: '0.3.0', cfg: 0 }, headers: { 'x-device-key': keyBeto } })
check('a estação recebe a oferta da versão atribuída', r2.status === 200 && r2.json?.ota?.version === '9.9.9', r2.text)
r2 = await call('GET', '/api/ota/firmware.bin', { headers: { 'x-device-key': keyBeto } })
check('baixa o binário da versão atribuída', r2.status === 200 && r2.buf.length === 150_000 && r2.headers.get('x-sha256') === sha(bin), String(r2.buf.length))
r2 = await call('GET', '/api/admin/rollout', as(adm))
check('acompanhamento: ainda aguardando', r2.json?.summary?.aguardando === 2 && r2.json.summary.ok === 0, r2.text.slice(0, 300))
await call('POST', '/api/ingest', { body: { ...reading, fw: '9.9.9', cfg: 0 }, headers: { 'x-device-key': keyBeto } })
await call('POST', '/api/ingest', { body: { ...reading, fw: '0.3.0', cfg: 0, events: [{ kind: 'ota_fail', age: 0, stage: 'sha256', http: 0 }] }, headers: { 'x-device-key': keyAna } })
r2 = await call('GET', '/api/admin/rollout', as(adm))
const rb = r2.json?.stations?.find((x) => x.id === 'beto-casa'), ra = r2.json?.stations?.find((x) => x.id === 'ana-sitio')
check('acompanhamento: sucesso e falha por estação', rb?.status === 'ok' && ra?.status === 'falhou' && ra.fail?.stage === 'sha256' && r2.json.summary.ok === 1 && r2.json.summary.falhou === 1, r2.text.slice(0, 400))
r2 = await call('DELETE', `/api/admin/releases/${relId}`, as(adm))
check('não apaga versão que está atribuída', r2.status === 409)
r2 = await call('POST', '/api/admin/releases/unassign', asBody(adm, { ids: 'all' }))
check('retira a atribuição', r2.status === 200 && r2.json?.unassigned >= 2)
r2 = await call('DELETE', `/api/admin/releases/${relId}`, as(adm))
check('apaga a versão depois de retirar', r2.status === 200)

// usuários, dono, auditoria e segurança
r2 = await call('GET', '/api/admin/users', as(adm))
check('lista usuários com a contagem de estações', r2.status === 200 && r2.json.find((u) => u.email === 'ana@exemplo.com')?.stations === 1, r2.text.slice(0, 300))
r2 = await call('POST', '/api/admin/users', asBody(ana, { email: 'novo@exemplo.com' }))
check('usuário comum não adiciona administradores', r2.status === 403)
r2 = await call('POST', '/api/admin/users', asBody(adm, { email: 'Novo@Exemplo.com' }))
check('o administrador adiciona outro administrador por e-mail', r2.status === 201 && r2.json?.email === 'novo@exemplo.com' && r2.json.role === 'admin', r2.text)
r2 = await call('POST', '/api/admin/users', asBody(adm, { email: 'invalido' }))
check('e-mail inválido é recusado', r2.status === 422)
const novo = (await login('novo@exemplo.com'))
check('quem foi adicionado entra já como administrador', novo.r.json?.user?.role === 'admin', novo.r.text)
r2 = await call('GET', '/api/admin/overview', as(novo.cookie))
check('e já acessa a administração', r2.status === 200)
r2 = await call('PUT', '/api/admin/users/ana%40exemplo.com', asBody(adm, { role: 'admin' }))
check('promove um usuário a administrador', r2.status === 200)
r2 = await call('GET', '/api/admin/overview', as(ana))
check('o novo administrador já acessa /api/admin', r2.status === 200)
await call('PUT', '/api/admin/users/ana%40exemplo.com', asBody(adm, { role: 'user' }))
r2 = await call('PUT', '/api/admin/users/rudsomlima%40gmail.com', asBody(adm, { role: 'user' }))
check('o administrador não tira o próprio papel', r2.status === 409)
r2 = await call('PUT', '/api/admin/stations/beto-casa/owner', asBody(adm, { email: 'ana@exemplo.com' }))
check('transfere a estação para outro dono', r2.status === 200)
r2 = await call('PUT', '/api/stations/beto-casa', asBody(beto, { name: 'x' }))
check('o dono antigo perde o acesso', r2.status === 403)
r2 = await call('GET', '/api/admin/audit?limit=300', as(adm))
check('auditoria registra as ações', r2.status === 200 && ['login', 'config.massa', 'firmware.atribuida', 'estacao.criada'].every((a) => r2.json.some((e) => e.action === a)), r2.text.slice(0, 200))
r2 = await call('POST', '/api/admin/token/rotate', asBody(adm, {}))
const newToken = r2.json?.token
check('troca o token de administrador', r2.status === 200 && typeof newToken === 'string' && newToken.length >= 24, r2.text)
const oldAdmin = await admin('GET', '/api/usage')
check('o token antigo deixa de valer', oldAdmin.status === 401, String(oldAdmin.status))
{
  const ts = Date.now(), p = '/api/usage'
  const sig = hmac(newToken, `${ts}|GET|${p}|${sha(Buffer.alloc(0))}`)
  const okNew = await call('GET', p, { headers: { 'x-ts': String(ts), 'x-sig': sig } })
  check('o token novo vale', okNew.status === 200, okNew.text)
}
r2 = await call('DELETE', '/api/admin/token', as(adm))
check('volta ao token do servidor', r2.status === 200 && (await admin('GET', '/api/usage')).status === 200)

// ================= Telegram por usuário, comandos para a estação e confirmações
r2 = await call('GET', '/api/me/telegram', as(ana))
check('usuário lê o próprio Telegram', r2.status === 200 && r2.json?.tokenSet === false && r2.json.ownedStations.includes('ana-sitio'), r2.text.slice(0, 200))
r2 = await call('PUT', '/api/me/telegram', asBody(ana, { token: '123:abc', chatId: '777', enabled: true, stations: ['ana-sitio', 'serra'] }))
check('usuário configura o Telegram das suas estações (as dos outros são ignoradas)', r2.status === 200 && r2.json?.enabled === true && JSON.stringify(r2.json.stations) === '["ana-sitio"]', r2.text.slice(0, 200))
r2 = await call('GET', '/api/me/telegram', as(beto))
check('o Telegram de um usuário não aparece para outro', r2.json?.tokenSet === false && r2.json.chatId === '')
sent.length = 0
r2 = await call('POST', '/api/me/telegram/test', asBody(ana, { kind: 'gust' }))
check('a mensagem de teste vai para o chat do usuário', r2.status === 200 && sent.some((m) => String(m.chat_id) === '777'), r2.text)
r2 = await call('GET', '/api/settings/telegram', as(ana))
check('o Telegram do servidor continua só do administrador', r2.status === 403)
r2 = await admin('GET', '/api/me/telegram')
check('o token antigo não tem Telegram de usuário', r2.status === 403)

// confirmação da configuração aplicada
let cfgNow = (await call('GET', '/api/stations', as(adm))).json.find((x) => x.id === 'ana-sitio')
r2 = await call('POST', '/api/ingest', { body: { ...reading, fw: '0.3.1', cfg: cfgNow.config.version }, headers: { 'x-device-key': keyAna } })
cfgNow = (await call('GET', '/api/stations', as(adm))).json.find((x) => x.id === 'ana-sitio')
check('o servidor registra quando a estação confirmou a configuração', cfgNow.cfg_applied === cfgNow.config.version && cfgNow.cfg_applied_at > 0, JSON.stringify([cfgNow.cfg_applied, cfgNow.cfg_applied_at]))

// reiniciar e limpar eventos
r2 = await call('POST', '/api/admin/stations/ana-sitio/restart', asBody(ana, {}))
check('usuário comum não manda a estação reiniciar', r2.status === 403)
r2 = await call('POST', '/api/admin/stations/ana-sitio/restart', asBody(adm, {}))
check('o administrador pede o reinício da estação', r2.status === 200 && r2.json?.ok === true, r2.text)
r2 = await call('POST', '/api/ingest', { body: { ...reading, fw: '0.3.1', cfg: cfgNow.config.version }, headers: { 'x-device-key': keyAna } })
check('a estação recebe o comando no próximo envio', r2.json?.cmd === 'restart', r2.text.slice(0, 200))
let ov = (await call('GET', '/api/admin/overview', as(adm))).json.stations.find((x) => x.id === 'ana-sitio')
check('o painel mostra o comando entregue, ainda sem confirmação', ov.command?.name === 'restart' && ov.command.sent > 0 && !ov.command.done, JSON.stringify(ov.command))
r2 = await call('POST', '/api/ingest', { body: { ...reading, fw: '0.3.1', cfg: cfgNow.config.version }, headers: { 'x-device-key': keyAna } })
check('sem confirmação, o comando é entregue de novo', r2.json?.cmd === 'restart')
r2 = await call('POST', '/api/ingest', { body: { ...reading, fw: '0.3.1', cfg: cfgNow.config.version, events: [{ kind: 'boot', age: 0, reason: 3, count: 1, wake: 'power-on' }] }, headers: { 'x-device-key': keyAna } })
check('depois do reinício o comando não é mais entregue', !r2.json?.cmd, r2.text.slice(0, 200))
ov = (await call('GET', '/api/admin/overview', as(adm))).json.stations.find((x) => x.id === 'ana-sitio')
check('o painel mostra o reinício confirmado pela estação', ov.command?.done > 0, JSON.stringify(ov.command))
r2 = await call('GET', '/api/stations/ana-sitio/events?limit=50')
check('há eventos registrados', Array.isArray(r2.json) && r2.json.length > 0)
r2 = await call('DELETE', '/api/admin/stations/ana-sitio/events', as(ana))
check('usuário comum não limpa os eventos', r2.status === 403)
r2 = await call('DELETE', '/api/admin/stations/ana-sitio/events', as(adm))
check('o administrador limpa os eventos', r2.status === 200 && r2.json?.removed > 0, r2.text)
r2 = await call('GET', '/api/stations/ana-sitio/events?limit=50')
check('a lista de eventos fica vazia', r2.json?.length === 0)

for (const sid of ['ana-sitio', 'beto-casa']) await admin('DELETE', `/api/stations/${sid}`)
await call('POST', '/api/admin/sessions/revoke', asBody(adm, {}))
r2 = await call('GET', '/api/auth/me', as(adm))
check('encerrar sessões derruba todos os logins', r2.json?.user === null)
r2 = await call('POST', '/api/auth/logout', as(ana))
check('sair apaga o cookie', /Max-Age=0/.test(r2.headers.get('set-cookie') ?? ''))
jwks.close()

fake.close()
console.log(failed ? `\n${failed} teste(s) falharam` : '\nTudo certo')
process.exit(failed ? 1 : 0)
