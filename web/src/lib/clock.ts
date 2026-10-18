/**
 * Relógio do servidor. Os horários das estações (último envio, leituras) são do servidor; comparar com a hora do computador
 * de quem olha o site daria idades erradas se o relógio dele estivesse adiantado ou atrasado. A cada resposta da API o
 * cabeçalho `Date` corrige a diferença.
 */
let offsetMs = 0
let synced = false

export function syncServerTime(dateHeader: string | null) {
  const t = dateHeader ? Date.parse(dateHeader) : NaN
  if (!Number.isFinite(t)) return
  const off = t - Date.now()
  // o cabeçalho tem resolução de 1 s e chega depois do pedido: só corrige quando a diferença é maior que isso, para a contagem não oscilar
  if (!synced || Math.abs(off - offsetMs) > 2500) { offsetMs = off; synced = true }
}

/** Agora, em segundos, pelo relógio do servidor. */
export const serverNow = () => (Date.now() + offsetMs) / 1000
