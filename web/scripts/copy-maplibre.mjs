// O MapLibre 6 carrega o worker de um arquivo próprio (e ele importa o "shared"). O bundler não copia os dois,
// então copiamos para public/maplibre antes de `dev` e `build`.
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('public/maplibre', { recursive: true })
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`)
