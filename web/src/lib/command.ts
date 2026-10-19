import type { StationCommand } from '../types'
import { ago } from './derive'

/** Em que pé está um comando para a estação: pedido → entregue → confirmado (a estação reiniciou e avisou). */
export function commandStatus(c: StationCommand | null | undefined): { text: string; tone: 'ok' | 'warn' | 'none' } {
  if (!c) return { text: '', tone: 'none' }
  const what = c.name === 'restart' ? 'Reinício' : c.name
  if (c.done) return { text: `${what} confirmado pela estação ${ago(c.done)}.`, tone: 'ok' }
  if (c.sent) return { text: `${what} entregue ${ago(c.sent)}. Falta a estação confirmar (ela volta a ligar e avisa no envio seguinte).`, tone: 'warn' }
  return { text: `${what} pedido ${c.at ? ago(c.at) : ''}. A estação recebe no próximo envio.`, tone: 'warn' }
}
