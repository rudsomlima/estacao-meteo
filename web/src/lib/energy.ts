import type { StationConfig } from '../types'

/**
 * Modelo de consumo por ciclo. Os números são estimativas de folha de dados e
 * precisam ser trocados pelo que você medir com um multímetro de µA.
 */
export const HW = {
  sleep_mA: 0.012, // ESP32-C3 em deep sleep + regulador + divisor da bateria
  light_mA: 0.15, // ESP32-C3 em light sleep
  pulse_mA: 0.1, // média extra das acordadas a cada pulso do anemômetro (~6 pulsos/s)
  qmc_mA: 0.075, // QMC5883L em modo contínuo, 10 Hz
  boot_s: 0.4, boot_mA: 35,
  sample_s: 0.04, sample_mA: 6, // BME280 por amostra
  wifi_s: 2.6, wifi_mA: 110, // conectar com BSSID/canal salvos + POST
  rain_wake_s: 0.06, rain_wake_mA: 30, rain_tips_per_day: 20,
  derate: 0.8, // só 80 % da capacidade nominal é aproveitável
}

export interface Phase { key: string; label: string; seconds: number; mA: number; color: string }

type CycleCfg = Pick<StationConfig, 'interval_min' | 'wind_window_s' | 'samples' | 'battery_mah' | 'send_every' | 'continuous_wind'>

export function cycle(cfg: CycleCfg) {
  const total = cfg.interval_min * 60
  const windMA = HW.light_mA + HW.pulse_mA + HW.qmc_mA
  const continuous = cfg.continuous_wind === 1
  const send = Math.max(1, cfg.send_every)
  const phases: Phase[] = []

  if (!continuous) phases.push({ key: 'boot', label: 'boot', seconds: HW.boot_s, mA: HW.boot_mA, color: '#fbbf24' })
  phases.push({ key: 'sample', label: 'sensores', seconds: HW.sample_s * cfg.samples, mA: HW.sample_mA, color: '#4ade80' })
  // o Wi-Fi só liga a cada `send` ciclos: o tempo médio por ciclo é a fração
  phases.push({ key: 'wifi', label: send > 1 ? `Wi-Fi (1 a cada ${send})` : 'Wi-Fi', seconds: HW.wifi_s / send, mA: HW.wifi_mA, color: '#fb923c' })

  const fixed = phases.reduce((s, p) => s + p.seconds, 0)
  if (continuous) {
    phases.push({ key: 'lsleep', label: 'light sleep contando vento', seconds: Math.max(0, total - fixed), mA: windMA, color: '#38bdf8' })
  } else {
    phases.push({ key: 'wind', label: 'janela de vento (light sleep)', seconds: cfg.wind_window_s, mA: windMA, color: '#38bdf8' })
    const active = fixed + cfg.wind_window_s
    phases.push({ key: 'sleep', label: 'deep sleep', seconds: Math.max(0, total - active), mA: HW.sleep_mA, color: '#2b353a' })
  }

  const mAs = phases.reduce((s, p) => s + p.seconds * p.mA, 0) / total
  const rainMA = continuous ? 0 : (HW.rain_tips_per_day * HW.rain_wake_s * HW.rain_wake_mA) / 86400
  const avg = mAs + rainMA
  const days = (cfg.battery_mah * HW.derate) / avg / 24
  return { phases, total, avg, days, continuous }
}
