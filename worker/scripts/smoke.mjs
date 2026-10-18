// Teste de fumaça da API. Precisa do worker rodando (npm run dev) e do banco com seed (npm run seed:local).
// Uso: node scripts/smoke.mjs [http://127.0.0.1:8787]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const ADMIN = { authorization: 'Bearer admin-troque', 'content-type': 'application/json' }
const DEV = { 'x-device-key': 'dev-key-serra', 'content-type': 'application/json' }

let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`)
  if (!ok) failed++
}
const call = async (path, init) => {
  const r = await fetch(BASE + path, init)
  let body = null
  try { body = await r.json() } catch { /* sem corpo */ }
  return { status: r.status, body }
}

for (let i = 0; i < 40; i++) {
  try { await fetch(BASE + '/api/stations'); break } catch { await new Promise((r) => setTimeout(r, 1000)) }
}

const reading = { temp: 20.5, hum: 62, pres: 835.1, wind: 3.2, gust: 5.5, dir: 210, rain: 0.2, vbat: 3.9, rssi: -60 }

let r = await call('/api/stations')
check('lista as estações', r.status === 200 && Array.isArray(r.body) && r.body.length >= 1, JSON.stringify(r.body)?.slice(0, 100))
check('não expõe a chave', !JSON.stringify(r.body).includes('key_hash'))

r = await call('/api/ingest', { method: 'POST', headers: DEV, body: JSON.stringify({ ...reading, cfg: 0 }) })
check('aceita leitura solta e devolve a configuração', r.status === 200 && r.body.config?.send_every >= 1, JSON.stringify(r.body))

const batch = { cfg: 999, batch: [0, 1, 2].map((i) => ({ ...reading, age: 1800 - i * 600, wind: 3 + i })) }
r = await call('/api/ingest', { method: 'POST', headers: DEV, body: JSON.stringify(batch) })
check('aceita lote com idade por leitura', r.status === 200 && r.body.stored === 3, JSON.stringify(r.body))

r = await call('/api/stations/serra/readings?hours=1')
const old = r.body.filter((x) => Date.now() / 1000 - x.ts > 1500 && x.wind === 3)
check('a leitura antiga ficou com o horário certo', r.status === 200 && old.length >= 1)

r = await call('/api/ingest', { method: 'POST', headers: DEV, body: JSON.stringify({ batch: [{ ...reading, hum: 140 }] }) })
check('rejeita valor fora da faixa', r.status === 422)

r = await call('/api/ingest', { method: 'POST', headers: DEV, body: JSON.stringify({ batch: Array(25).fill(reading) }) })
check('rejeita lote grande demais', r.status === 422)

r = await call('/api/ingest', { method: 'POST', headers: { 'x-device-key': 'errada' }, body: '{}' })
check('rejeita chave errada', r.status === 401)

r = await call('/api/stations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
check('criar estação exige o token', r.status === 401)

const id = 'smoke-' + Math.random().toString(36).slice(2, 7)
r = await call('/api/stations', { method: 'POST', headers: ADMIN, body: JSON.stringify({ id, name: 'Teste', lat: -23, lon: -46, battery_chem: 'aa', continuous_wind: 1, send_every: 99 }) })
check('cria estação e devolve a chave uma vez', r.status === 201 && typeof r.body.key === 'string' && r.body.config.continuous_wind === 1 && r.body.config.send_every === 12, JSON.stringify(r.body))

r = await call(`/api/stations/${id}`, { method: 'PUT', headers: ADMIN, body: JSON.stringify({ name: 'Teste 2', config: { interval_min: 15, urgent_gust_kmh: 60 } }) })
check('atualiza e sobe a versão da configuração', r.status === 200 && r.body.config.version === 2 && r.body.config.urgent_gust_kmh === 60, JSON.stringify(r.body))

r = await call(`/api/stations/${id}`, { method: 'DELETE', headers: ADMIN })
check('apaga a estação', r.status === 200)

console.log(failed ? `\n${failed} teste(s) falharam` : '\nTudo certo')
process.exit(failed ? 1 : 0)
