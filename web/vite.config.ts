import { execSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Número de commits + hash curto, para saber qual build está no ar (mostrado no menu da conta). */
function gitVersion(): string {
  try {
    const n = execSync('git rev-list --count HEAD', { cwd: __dirname }).toString().trim()
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
    return `${n}-${hash}`
  } catch {
    return 'dev'
  }
}

/**
 * Só em desenvolvimento: diz ao site qual é o IP deste computador na rede local. A placa não alcança "localhost", então o
 * endereço que o site grava nela tem de ser este. Redes privadas comuns primeiro (192.168.x, 10.x, 172.16-31.x); o resto
 * (VPN, Tailscale) vai para o fim da lista.
 */
function lanIp(): Plugin {
  const rank = (ip: string) => (/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(ip) ? 0 : 1)
  return {
    name: 'lan-ip',
    configureServer(server) {
      server.middlewares.use('/__lan', (_req, res) => {
        const ips = Object.values(networkInterfaces())
          .flat()
          .filter((n) => n && n.family === 'IPv4' && !n.internal)
          .map((n) => n!.address)
          .sort((a, b) => rank(a) - rank(b))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ips }))
      })
    },
  }
}

export default defineConfig({
  // vários servidores de desenvolvimento (portas diferentes) não podem dividir o cache de dependências: um apagava o do outro (erro 504 "Outdated Optimize Dep")
  cacheDir: process.env.SITE_PORT ? `node_modules/.vite-${process.env.SITE_PORT}` : undefined,
  plugins: [react(), tailwindcss(), lanIp()],
  server: {
    // `npm run dev` na pasta worker/ sobe a API em 8787
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8787}`, changeOrigin: false, ws: true } }, // ws: o tempo real (WebSocket em /api/live)
  },
  build: { chunkSizeWarningLimit: 1200 },
  define: { __APP_VERSION__: JSON.stringify(gitVersion()) },
})
