// Teste de fumaça da API. Precisa do worker rodando (npm run dev) e do banco com seed (npm run seed:local).
// O .dev.vars precisa ter ADMIN_TOKEN=admin-troque e TELEGRAM_API=http://127.0.0.1:8799 (este script sobe um Telegram falso nessa porta).
// Uso: node scripts/smoke.mjs [http://127.0.0.1:8787]
import { createHash, createHmac, randomBytes } from 'node:crypto'
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

fake.close()
console.log(failed ? `\n${failed} teste(s) falharam` : '\nTudo certo')
process.exit(failed ? 1 : 0)
