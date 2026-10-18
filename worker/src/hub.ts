/**
 * Ponto de encontro do tempo real. Os navegadores abrem um WebSocket em /api/live; quando algo muda (a estação enviou, uma
 * estação foi criada, alterada ou removida), o Worker avisa este objeto, que repassa a todos os navegadores conectados.
 *
 * A mensagem é só um aviso curto ({"t":"update","id":"usina","ts":1792355899000}): o navegador então busca o dado novo pelas rotas normais.
 * Assim a lógica de leitura fica num lugar só.
 *
 * Usa a API de hibernação: com as conexões paradas o objeto sai da memória e não cobra tempo de execução, e o "ping" do
 * navegador é respondido pela plataforma sem acordá-lo.
 */
import type { Env } from './shared'

/** Acima disso novas conexões são recusadas (o plano gratuito tem limite diário de requisições). */
const MAX_SOCKETS = 200

export class Hub implements DurableObject {
  constructor(private readonly state: DurableObjectState, _env: Env) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // aviso interno, vindo do Worker
    if (url.pathname === '/notify' && req.method === 'POST') {
      const text = await req.text()
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(text) } catch { /* conexão já caiu; a plataforma a remove */ }
      }
      return new Response(null, { status: 204 })
    }

    if (req.headers.get('upgrade') !== 'websocket') return new Response('esperava um WebSocket', { status: 426 })
    if (this.state.getWebSockets().length >= MAX_SOCKETS) return new Response('conexões demais', { status: 503 })
    const pair = new WebSocketPair()
    this.state.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  // o navegador só manda "ping" (respondido automaticamente); qualquer outra coisa é ignorada
  webSocketMessage(): void {}
  webSocketClose(ws: WebSocket, code: number): void { try { ws.close(code === 1005 ? 1000 : code) } catch { /* já fechou */ } }
  webSocketError(ws: WebSocket): void { try { ws.close(1011) } catch { /* já fechou */ } }
}

/** Avisa os navegadores conectados. Nunca falha o pedido de quem chamou: tempo real é um acréscimo. */
export async function notifyLive(env: Env, id: string | null): Promise<void> {
  try {
    const stub = env.HUB.get(env.HUB.idFromName('rede'))
    await stub.fetch('https://hub/notify', { method: 'POST', body: JSON.stringify({ t: 'update', id, ts: Date.now() }) })
  } catch (e) {
    console.warn('aviso em tempo real falhou', e)
  }
}
