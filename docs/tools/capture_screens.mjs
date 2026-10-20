#!/usr/bin/env node
// Refaz as telas de docs/img (captura-*.png e guia/*.png) a partir do site rodando em desenvolvimento.
//
//   1. npm run dev                          (na raiz; sobe o banco com as estações de exemplo, a API e o site em :5173)
//   2. npm i --no-save playwright-core      (na raiz, uma vez; usa o Chrome que já está instalado)
//   3. node docs/tools/capture_screens.mjs
//
// Variáveis: BASE (padrão http://localhost:5173) e CHROME (caminho do chrome.exe/chrome).
// Não gera guia/02, 03 e 06 a 10: o aviso da placa USB precisa de uma placa (ou de uma placa simulada).
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const IMG = join(dirname(fileURLToPath(import.meta.url)), '..', 'img')
const BASE = process.env.BASE ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
if (!CHROME) throw new Error('Chrome não encontrado: defina CHROME')
mkdirSync(join(IMG, 'guia'), { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function session(opts, fn) {
  const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'pt-BR', ...opts })
  const p = await ctx.newPage()
  const open = async (hash, wait = 4500) => { await p.goto(`${BASE}/#/${hash}`); await p.waitForTimeout(wait) }
  // rola até o texto e deixa-o logo abaixo da barra do topo
  const top = async (text) => {
    await p.getByText(text, { exact: true }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }))
    await p.evaluate(() => window.scrollBy(0, -90))
  }
  const shot = async (file) => { await p.waitForTimeout(800); await p.screenshot({ path: join(IMG, file) }); console.log('ok', file) }
  await fn({ p, open, top, shot })
  await ctx.close()
}

// ---- como visitante, 1440x1000 (as capturas do README)
const D = { viewport: { width: 1440, height: 1000 } }
await session(D, async ({ open, shot }) => { await open(''); await shot('captura-mapa.png') })
await session({ ...D, timezoneId: 'Asia/Tokyo' }, async ({ open, shot }) => { await open('s/serra'); await shot('captura-estacao.png') }) // fuso que cai de dia
await session({ ...D, timezoneId: 'America/Sao_Paulo' }, async ({ open, shot }) => { await open('s/serra'); await shot('captura-estacao-noite.png') }) // ajuste se a hora local não for de noite
await session(D, async ({ open, top, shot }) => { await open('s/serra/config'); await top('Quanto a bateria aguenta'); await shot('captura-energia.png') })
await session({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Asia/Tokyo' }, async ({ open, shot }) => { await open('s/serra'); await shot('captura-celular.png') })

// ---- como administrador de desenvolvimento ("Entrar sem senha"), 1280x800 (os guias)
await session({ viewport: { width: 1280, height: 800 } }, async ({ p, open, top, shot }) => {
  await open('', 1500)
  await p.evaluate(() => fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) }))
  await p.reload(); await p.waitForTimeout(3500)

  await shot('guia/01-mapa.png')
  await p.getByRole('button', { name: 'Camadas do mapa' }).click(); await shot('guia/13-camadas-do-mapa.png')
  await p.keyboard.press('Escape'); await p.getByRole('button', { name: 'Camadas do mapa' }).click().catch(() => {})
  for (const n of ['Temperatura', 'Pressão', 'Chuva 24 h', 'Bateria', 'Sinal Wi-Fi', 'Última vez visto']) await p.getByRole('button', { name: n, exact: true }).click().catch(() => {})
  await shot('guia/20-camadas-todas.png')

  await open('admin', 2500)
  await p.getByText('Visão geral', { exact: true }).first().click(); await p.waitForTimeout(1500); await shot('guia/14-painel-do-administrador.png')
  await p.getByText('Site e placas', { exact: true }).first().click(); await p.waitForTimeout(800)
  await top('Placa USB: gravar firmware e deixar a placa pronta'); await shot('guia/04-ajustes-placa-usb.png')

  await open('config', 2500); await shot('guia/15-ajustes-do-site.png')
  await open('s/serra', 4000); await shot('guia/11-pagina-da-estacao.png')
  await open('s/serra/config', 4000); await shot('guia/12-configuracoes-da-estacao.png')
  await top('Placa, sensores e pinos'); await shot('guia/16-sensores-e-pinos.png')
  await top('Parâmetros'); await shot('captura-configuracao.png')
})

await browser.close()
