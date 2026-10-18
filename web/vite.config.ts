import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev` na pasta worker/ sobe a API em 8787
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 1200 },
})
