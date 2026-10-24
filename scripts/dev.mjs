// Ambiente de desenvolvimento completo com um comando só:  npm run dev   (na raiz do projeto)
//
//   1. prepara o banco local (esquema e migrações), copia do servidor publicado as estações reais que faltam e tira as de exemplo;
//   2. sobe a API/Worker em 0.0.0.0:8787 (a placa na mesma rede alcança) e o site com recarga automática na porta do site (:5173 por padrão, veja --site-port);
//   3. mantém o site de :8787 atualizado (vite build --watch), para quem abre por lá;
//   4. com --demo, cria e simula as estações de exemplo: elas enviam a cada 20 s, pegam a configuração nova e reiniciam quando o administrador pede.
//
// Opções:  --demo     usa estações de exemplo simuladas em vez de só as reais
//          --db-only  só prepara o banco local e sai (sem subir nada)
//          --reseed   (com --demo) apaga e refaz só as estações de exemplo e os dados delas (a sua estação real não é tocada)
//          --no-sim   (com --demo) não simula as estações de exemplo
//          --site-port=N  porta do site com recarga automática (padrão 5173; também vale SITE_PORT=N). Se a porta estiver ocupada, o dev para em vez de trocar sozinho.
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKER = join(ROOT, 'worker')
const WEB = join(ROOT, 'web')
const API = 'http://127.0.0.1:8787'
const args = new Set(process.argv.slice(2))
const SITE_PORT = Number([...args].find((a) => a.startsWith('--site-port='))?.split('=')[1] ?? process.env.SITE_PORT ?? 5173)
const DEMO = ['serra', 'costao', 'praia', 'capital', 'planalto'] // mantiqueira fica offline de propósito
const ALL_DEMO = [...DEMO, 'mantiqueira']
const log = (...a) => console.log('[dev]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- banco
function wrangler(extra, cwd = WORKER) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'estacao-meteo', '--local', ...extra], { cwd, shell: true, encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
function query(sql) {
  const r = wrangler(['--json', '--command', `"${sql.replace(/"/g, '\\"')}"`])
  try {
    return JSON.parse(r.out.slice(r.out.indexOf('[')))[0].results ?? []
  } catch { return [] }
}

function prepareDb() {
  if (!existsSync(join(WORKER, '.dev.vars'))) {
    copyFileSync(join(WORKER, '.dev.vars.example'), join(WORKER, '.dev.vars'))
    log('criei worker/.dev.vars a partir do exemplo (login sem senha ligado, só em localhost)')
  }
  log('banco local: esquema e migrações…')
  wrangler(['--file=schema.sql'])
  const cols = new Set(query("SELECT name FROM pragma_table_info('stations')").map((c) => c.name))
  for (const [col, file] of [['owner_email', '0002_usuarios_e_firmware.sql'], ['cmd', '0003_comandos_e_confirmacoes.sql'], ['cfg_sent', '0004_entrega_da_configuracao.sql'], ['latest', '0005_resumo_por_hora.sql']]) {
    if (cols.size && !cols.has(col)) {
      log(`aplicando migração ${file}`)
      wrangler([`--file=migrations/${file}`])
    }
  }

  if (args.has('--demo')) {
    // estações de exemplo (simuladas): refaz se faltam, se pediram, ou se os dados estão velhos (o gráfico não pode ter um buraco de dias)
    const newest = query("SELECT MAX(ts) AS t FROM readings WHERE station_id = 'serra'")[0]?.t ?? 0
    const have = query("SELECT COUNT(*) AS n FROM stations WHERE id IN ('serra','costao','praia','capital','planalto','mantiqueira')")[0]?.n ?? 0
    const stale = Date.now() / 1000 - newest > 3 * 3600
    if (args.has('--reseed') || have < ALL_DEMO.length || stale) {
      log(stale && have ? 'dados de exemplo velhos: refazendo só as estações de exemplo…' : 'criando as estações de exemplo…')
      const g = spawnSync('node', ['scripts/seed.mjs'], { cwd: WORKER, encoding: 'utf8' })
      if (g.status !== 0) log('seed falhou:', g.stderr)
      else if (!wrangler(['--file=seed.sql']).ok) log('não consegui aplicar o seed (as estações de exemplo podem faltar)')
    }
  } else {
    removeDemo()
  }
}

/** Apaga do banco local as estações de exemplo (as de chave "dev-key-<id>") e os dados delas. Estações reais não são tocadas. */
function removeDemo() {
  const ids = ALL_DEMO.filter((id) => {
    const h = createHash('sha256').update(`dev-key-${id}`).digest('hex')
    return (query(`SELECT COUNT(*) AS n FROM stations WHERE id = '${id}' AND key_hash = '${h}'`)[0]?.n ?? 0) > 0
  })
  if (!ids.length) return
  const list = ids.map((i) => `'${i}'`).join(',')
  const sql = [...['readings', 'readings_hourly', 'events', 'alert_state', 'firmware_chunks', 'firmware', 'fw_assign'].map((tb) => `DELETE FROM ${tb} WHERE station_id IN (${list});`), `DELETE FROM stations WHERE id IN (${list});`].join(' ')
  const f = join(tmpdir(), 'estacao-dev-remove-demo.sql')
  writeFileSync(f, sql)
  log(`removendo as estações de exemplo do banco local: ${ids.join(', ')} (use --demo para tê-las de volta)`)
  if (!wrangler([`--file=${f}`]).ok) log('não consegui remover as estações de exemplo')
}

/** Copia do servidor publicado as estações reais que faltam no banco local (só o cadastro: id, nome, local e configuração, sem chave nem leituras). */
async function syncReal() {
  const remote = (process.env.REMOTE_API ?? 'https://estacao-meteo.rudsomlima.workers.dev').replace(/\/$/, '')
  let list
  try {
    const r = await fetch(`${remote}/api/stations`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(String(r.status))
    list = await r.json()
  } catch (e) { log(`não consegui ler as estações de ${remote} (${e.message}); sigo com as que já estão no banco local`); return }
  const have = new Set(query('SELECT id FROM stations').map((s) => s.id))
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const rows = list.filter((s) => !have.has(s.id))
  if (!rows.length) return
  const now = Math.floor(Date.now() / 1000)
  // sem a chave do servidor: o hash é de um valor aleatório. Ao configurar a placa pelo assistente, a chave é gerada de novo.
  const sql = rows.map((s) => `INSERT INTO stations (id,name,city,lat,lon,alt,key_hash,config,created_at) VALUES (${q(s.id)},${q(s.name)},${q(s.city ?? '')},${s.lat},${s.lon},${s.alt ?? 0},${q(randomBytes(32).toString('hex'))},${q(JSON.stringify(s.config ?? {}))},${now});`).join(' ')
  const f = join(tmpdir(), 'estacao-dev-sync-real.sql')
  writeFileSync(f, sql)
  log(`copiando do servidor as estações reais que faltam: ${rows.map((s) => s.id).join(', ')}`)
  if (!wrangler([`--file=${f}`]).ok) log('não consegui copiar as estações reais')
}

// ---------------------------------------------------------------- processos
const kids = []
function run(name, cmd, cmdArgs, cwd, env = {}) {
  const p = spawn(cmd, cmdArgs, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0', ...env } })
  const pipe = (s) => String(s).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`))
  p.stdout.on('data', pipe)
  p.stderr.on('data', pipe)
  p.on('exit', (c) => { if (!stopping) log(`${name} terminou (código ${c})`) })
  kids.push(p)
  return p
}
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  for (const p of kids) { try { spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* já saiu */ } }
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function lanIps() {
  const rank = (ip) => (/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(ip) ? 0 : 1)
  return Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address).sort((a, b) => rank(a) - rank(b))
}

// ---------------------------------------------------------------- estações simuladas
const sim = new Map()
const wave = (t, p) => Math.sin((t / p) * Math.PI * 2)
async function tick(id, i) {
  const st = sim.get(id) ?? { cfg: 1, boot: false, n: 0, rain: 0 }
  sim.set(id, st)
  const t = Date.now() / 1000
  const hod = new Date().getHours() + new Date().getMinutes() / 60
  const sun = Math.max(0, Math.sin(((hod - 6) / 12) * Math.PI))
  const base = [15, 26, 25, 21, 23][i] ?? 20
  const wind0 = [14, 9, 11, 7, 10][i] ?? 8
  const wind = Math.max(0, wind0 * 0.4 + wind0 * 0.5 * sun + 1.5 * (wave(t + i * 99, 700) + 1))
  const body = {
    cfg: st.cfg, fw: '0.1.0', vbat: +(3.7 + 0.2 * sun).toFixed(2), rssi: -55 - i * 4,
    batch: [{
      age: 0, temp: +(base + 4 * sun + wave(t + i, 3000)).toFixed(1), hum: Math.round(62 - 14 * sun + 6 * wave(t, 5000)),
      pres: +(1013 - i * 12 + 2 * wave(t, 20000)).toFixed(1), wind: +wind.toFixed(1), gust: +(wind * 1.4).toFixed(1),
      dir: Math.round(((200 + 40 * wave(t, 9000) + i * 30) % 360 + 360) % 360), rain: Math.random() < 0.01 ? 0.2 : 0,
      vbat: +(3.7 + 0.2 * sun).toFixed(2), rssi: -55 - i * 4,
    }],
  }
  if (st.boot) { body.events = [{ kind: 'boot', age: 0, reason: 1, count: ++st.n, wake: 'power-on' }]; st.boot = false }
  try {
    const r = await fetch(`${API}/api/ingest`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-key': `dev-key-${id}` }, body: JSON.stringify(body) })
    if (!r.ok) return
    const j = await r.json()
    if (j.config?.version) st.cfg = j.config.version // "aplica" a configuração: o próximo envio confirma
    if (j.cmd === 'restart') st.boot = true // reinicia: o envio seguinte traz o evento de boot, que confirma o comando
  } catch { /* servidor reiniciando */ }
}

async function waitApi() {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${API}/api/stations`)).ok) return true } catch { /* ainda subindo */ }
    await sleep(1000)
  }
  return false
}

// ---------------------------------------------------------------- main
prepareDb()
await syncReal()
if (args.has('--db-only')) process.exit(0) // só prepara o banco local (estações reais, sem exemplos) e sai
const ips = lanIps()
mkdirSync(join(WEB, 'public'), { recursive: true })
writeFileSync(join(WEB, 'public', '__lan'), JSON.stringify({ ips })) // o site (em :8787 ou na porta do site) diz à placa que endereço usar

log(`subindo a API (8787), o site (${SITE_PORT}) e o build contínuo do site…`)
run('api', 'npx', ['wrangler', 'dev', '--port', '8787', '--ip', '0.0.0.0', '--test-scheduled'], WORKER)
run('site', 'npm', ['run', 'dev', '--', '--host', '--port', String(SITE_PORT), '--strictPort'], WEB, { SITE_PORT: String(SITE_PORT) })
run('build', 'npx', ['vite', 'build', '--watch', '--logLevel', 'warn'], WEB)

if (!(await waitApi())) { log('a API não subiu em 90 s'); stop() }
// o resumo por hora é feito pelo cron a cada 5 min; aqui roda já, algumas vezes, para o calendário e a semana aparecerem
for (let i = 0; i < 4; i++) { try { await fetch(`${API}/__scheduled?cron=*/5+*+*+*+*`) } catch { /* segue */ } }
const lan = ips[0]
console.log(`
  ┌──────────────────────────────────────────────────────────────┐
  │  Site (recarrega ao editar):  ${`http://localhost:${SITE_PORT}`.padEnd(31)}│
  │  API + site compilado:        http://localhost:8787          │${lan ? `
  │  Para a placa (mesma rede):   http://${lan}:8787${' '.repeat(Math.max(0, 22 - lan.length))}│` : ''}
  │  Entrar: "Entrar sem senha" (administrador ou usuário)       │
  │  Só as estações reais do servidor (--demo: exemplos simuladas)│
  │  Ctrl+C encerra tudo                                         │
  └──────────────────────────────────────────────────────────────┘
`)
if (args.has('--demo') && !args.has('--no-sim')) {
  const loop = async () => { await Promise.all(DEMO.map((id, i) => tick(id, i))) }
  await loop()
  setInterval(loop, 20_000)
}
