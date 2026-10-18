import { networkInterfaces } from 'node:os'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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
  plugins: [react(), tailwindcss(), lanIp()],
  server: {
    // `npm run dev` na pasta worker/ sobe a API em 8787
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, ws: true } }, // ws: o tempo real (WebSocket em /api/live)
  },
  build: { chunkSizeWarningLimit: 1200 },
})
