// Gera seed.sql com estações de exemplo e 7 dias de leituras, só para desenvolvimento local.
// As chaves dos dispositivos de teste são "dev-key-<id>".
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const STATIONS = [
  { id: 'serra', name: 'Serra', city: 'Campos do Jordão', lat: -22.74, lon: -45.59, alt: 1628, t0: 15, w0: 14, d0: 225, chem: 'li', mah: 3000 },
  { id: 'costao', name: 'Costão', city: 'Paraty', lat: -23.22, lon: -44.74, alt: 6, t0: 26, w0: 9, d0: 150, chem: 'lfp', mah: 6000 },
  { id: 'praia', name: 'Praia', city: 'Ubatuba', lat: -23.4, lon: -45.12, alt: 3, t0: 25, w0: 11, d0: 120, chem: 'li', mah: 3400 },
  { id: 'capital', name: 'Capital', city: 'São Paulo', lat: -23.55, lon: -46.63, alt: 760, t0: 21, w0: 7, d0: 160, chem: 'lipo', mah: 2000 },
  { id: 'planalto', name: 'Planalto', city: 'Campinas', lat: -22.91, lon: -47.06, alt: 680, t0: 23, w0: 10, d0: 200, chem: 'aa', mah: 2500 },
  { id: 'mantiqueira', name: 'Mantiqueira', city: 'Itatiaia', lat: -22.45, lon: -44.62, alt: 800, t0: 12, w0: 6, d0: 300, chem: 'li', mah: 3000, offlineHours: 5 },
]
const CHEM = { li: [3.0, 4.2], lfp: [2.8, 3.6], lipo: [3.3, 4.2], aa: [2.0, 3.2] }
const CRIT = { li: 3.2, lfp: 2.9, lipo: 3.35, aa: 2.1 }
const SLOW = { li: 3.55, lfp: 3.1, lipo: 3.6, aa: 2.3 }

const wave = (t, periods) => periods.reduce((s, p, i) => s + Math.sin((t / p) * Math.PI * 2 + i * 1.7), 0) / periods.length
const sha = (s) => createHash('sha256').update(s).digest('hex')
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const r = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d

const now = Math.floor(Date.now() / 1000)
const step = 600
// apaga só as estações de exemplo (e os dados delas): estações reais cadastradas no banco local não são tocadas
const ids = STATIONS.map((s) => q(s.id)).join(',')
const out = ['readings', 'events', 'alert_state', 'firmware_chunks', 'firmware', 'fw_assign'].map((t) => `DELETE FROM ${t} WHERE station_id IN (${ids});`)
out.push(`DELETE FROM readings_hourly WHERE station_id IN (${ids});`, "DELETE FROM settings WHERE key = 'hourly_backfill';") // o cron refaz o resumo por hora
out.push(`DELETE FROM stations WHERE id IN (${ids});`)

STATIONS.forEach((s, si) => {
  const cfg = {
    interval_min: 10, wind_window_s: 8, gust_window_s: 3, samples: 8, wifi_timeout_s: 10, mm_per_tip: 0.2, k_wind: 0.42, dir_offset: 0,
    slow_below_v: SLOW[s.chem], slow_factor: 3, critical_v: CRIT[s.chem], charge_above_v: 0, charge_interval_min: 5,
    send_every: 3, continuous_wind: 0, urgent_gust_kmh: 0, bench_min: 2, idle_every: 1, env_sensor: 1, battery_chem: s.chem, battery_mah: s.mah, version: 1,
  }
  out.push(
    `INSERT INTO stations (id,name,city,lat,lon,alt,key_hash,config,created_at,cfg_applied,last_seen,fw_version) VALUES (${q(s.id)},${q(s.name)},${q(s.city)},${s.lat},${s.lon},${s.alt},${q(sha('dev-key-' + s.id))},${q(JSON.stringify(cfg))},${now},1,${now - (s.offlineHours ?? 0) * 3600},'0.1.0');`,
  )
  const end = now - (s.offlineHours ?? 0) * 3600
  const rows = []
  for (let ts = Math.floor((now - 7 * 86400) / step) * step; ts <= end; ts += step) {
    const h = new Date(ts * 1000)
    const hod = h.getHours() + h.getMinutes() / 60
    const sun = Math.max(0, Math.sin(((hod - 6) / 12) * Math.PI))
    const day = Math.sin(((hod - 9) / 24) * Math.PI * 2)
    const t = ts + si * 7919
    const front = wave(t, [172800, 91000])
    const temp = s.t0 + 5 * day + 2 * front
    const hum = Math.min(99, Math.max(28, 66 - 18 * day + 8 * front))
    const pres = 1013 - s.alt / 9 + 4 * wave(t, [259200, 140000])
    const wind = Math.max(0, s.w0 * 0.35 + s.w0 * 0.6 * sun + 3 * (wave(t, [7200, 21000, 3000]) + 1) / 2)
    const gust = wind * (1.3 + 0.4 * (wave(t, [3600, 5400]) + 1) / 2)
    const dir = (((s.d0 + 60 * wave(t, [30000, 11000, 52000])) % 360) + 360) % 360
    const wet = wave(t, [86400 * 1.3 + si * 5000, 40000, 17000])
    const rain = wet > 0.45 ? Math.round(((wet - 0.45) * 2.4) / 0.2) * 0.2 : 0
    const [lo, hi] = CHEM[s.chem]
    const pct = Math.min(1, Math.max(0.1, 0.55 + 0.35 * sun - 0.1 * (rain > 0 ? 1 : 0)))
    const vbat = lo + (hi - lo) * pct
    rows.push(`(${q(s.id)},${ts},${r(temp)},${r(hum, 0)},${r(pres)},${r(wind)},${r(gust)},${r(dir, 0)},${r(rain)},${r(vbat, 2)},${-55 - ((si * 11) % 25)})`)
  }
  for (let i = 0; i < rows.length; i += 200)
    out.push(`INSERT INTO readings (station_id,ts,temp,hum,pres,wind,gust,dir,rain,vbat,rssi) VALUES ${rows.slice(i, i + 200).join(',')};`)
})

out.push(`UPDATE stations SET latest = (SELECT json_object('ts', ts, 'temp', temp, 'hum', hum, 'pres', pres, 'wind', wind, 'gust', gust, 'dir', dir, 'rain', rain, 'vbat', vbat, 'rssi', rssi) FROM readings r WHERE r.station_id = stations.id ORDER BY ts DESC LIMIT 1) WHERE id IN (${ids});`)
writeFileSync(new URL('../seed.sql', import.meta.url), out.join('\n') + '\n')
console.log(`seed.sql: ${STATIONS.length} estações. Chaves de teste: dev-key-<id>`)
