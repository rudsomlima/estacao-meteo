import { dewPoint, trend, type DayStats } from './derive'
import type { Reading, StationConfig } from '../types'

/**
 * Descrição da condição atual, correlacionando só os sensores que a estação realmente tem instalados — uma estação
 * sem anemômetro ou pluviômetro não deve "inventar" comentário de vento ou chuva (veja has_wind/has_rain em ConfigPanel).
 */
export function currentCondition(
  now: Reading,
  readings: Reading[],
  day: DayStats,
  config: Pick<StationConfig, 'has_wind' | 'has_rain' | 'env_sensor'>,
): string {
  const hasWind = (config.has_wind ?? 1) === 1
  const hasRain = (config.has_rain ?? 1) === 1
  const hasPres = Number.isFinite(now.pres)
  const hasHum = Number.isFinite(now.hum)
  const parts: string[] = []

  if (hasPres) {
    const dPres = trend(readings, (r) => r.pres, 3)
    parts.push(
      dPres < -1.5 ? 'Pressão caindo rápido: chuva ou piora do tempo provável nas próximas horas.'
      : dPres < -0.6 ? 'Pressão em queda leve: o tempo tende a mudar.'
      : dPres > 1 ? 'Pressão subindo: o tempo tende a firmar.'
      : 'Pressão estável.',
    )
  }

  if (hasHum) {
    const gap = now.temp - dewPoint(now.temp, now.hum)
    if (now.hum >= 85 && gap < 2.5) parts.push('Ar muito úmido, perto do ponto de orvalho: sensação de abafamento, possível neblina.')
    else if (now.hum <= 30) parts.push('Ar seco.')
  }

  if (hasWind) {
    const gustiness = now.gust - now.wind
    if (now.wind >= 10.8) parts.push('Vento forte e sustentado.')
    else if (gustiness >= 4) parts.push('Vento fraco de base, mas com rajadas bem mais fortes: atenção a objetos soltos.')
  }

  if (hasRain) {
    if (day.rainHour > 0) parts.push('Chuva registrada na última hora.')
    else if (day.rainDay > 0) parts.push('Choveu mais cedo hoje; sem chuva na última hora.')
  }

  if (!parts.length) parts.push('Estação com poucos sensores instalados: dados limitados para descrever a condição.')
  return parts.join(' ')
}
