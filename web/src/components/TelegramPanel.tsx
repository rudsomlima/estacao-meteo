import { Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToken } from '../hooks/useToken'
import { ApiError, detectTelegramChat, getTelegram, saveTelegram, testTelegram, type TelegramSettings, type TgScope } from '../lib/api'
import type { Source, Station } from '../types'

const input = 'num w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'
const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover disabled:opacity-50'

const RULES: { key: keyof TelegramSettings['rules']; label: string; fields?: { f: string; label: string; step?: number }[] }[] = [
  { key: 'offline', label: 'Estação sem dados', fields: [{ f: 'min', label: 'minutos sem dados' }] },
  { key: 'online', label: 'Voltou a enviar' },
  { key: 'lowBattery', label: 'Bateria baixa', fields: [{ f: 'pct', label: '% abaixo de' }] },
  { key: 'batteryOk', label: 'Bateria recuperada' },
  { key: 'gust', label: 'Rajada forte', fields: [{ f: 'kmh', label: 'km/h acima de' }] },
  { key: 'rainStart', label: 'Começou a chover', fields: [{ f: 'mm', label: 'mm', step: 0.1 }, { f: 'windowMin', label: 'em quantos min' }] },
  { key: 'rainStop', label: 'Parou de chover' },
]

const VARS: Record<string, string> = {
  offline: '{station} {city} {minutes}',
  online: '{station}',
  lowBattery: '{station} {pct} {vbat}',
  batteryOk: '{station} {pct} {vbat}',
  gust: '{station} {gust} {dir}',
  rainStart: '{station} {rain} {window}',
  rainStop: '{station}',
}

/** Alertas no Telegram: o aviso sai uma vez quando o nível muda (ok → offline), não a cada ciclo. */
export default function TelegramPanel({ stations, source, scope = 'global' }: { stations: Station[]; source: Source; scope?: TgScope }) {
  const [token, setToken] = useToken()
  const [tg, setTg] = useState<TelegramSettings | null>(null)
  const [bot, setBot] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const fail = (err: unknown, fb: string) =>
    setMsg({ ok: false, text: err instanceof ApiError ? (err.status === 401 ? 'Token de administrador incorreto.' : err.message) : fb })

  const load = useCallback(async () => {
    if (source !== 'api' || !token) return
    try { setTg(await getTelegram(token, scope)); setMsg(null) } catch (e) { fail(e, 'Não foi possível carregar.') }
  }, [source, token, scope])
  useEffect(() => { void load() }, [load])

  if (source === 'demo') {
    return <p className="text-sm text-ink-2">Os alertas dependem do servidor. Na demonstração não há onde guardá-los. Publique o site com a API para configurar.</p>
  }

  const patch = async (body: Record<string, unknown>, ok = 'Salvo.') => {
    setBusy(true)
    try { setTg(await saveTelegram(body, token, scope)); setMsg({ ok: true, text: ok }) } catch (e) { fail(e, 'Não foi possível salvar.') }
    setBusy(false)
  }
  const detect = async () => {
    setBusy(true)
    try {
      const r = await detectTelegramChat(bot, token, scope)
      if (r.ok && r.chatId) await patch({ ...(bot ? { token: bot } : {}), chatId: r.chatId }, `Conversa encontrada: ${r.title ?? r.chatId}.`)
      else setMsg({ ok: false, text: r.error ?? 'Mande uma mensagem ao bot e tente de novo.' })
    } catch (e) { fail(e, 'Não foi possível buscar.') }
    setBusy(false)
  }
  const test = async (kind: string) => {
    setBusy(true)
    try {
      const r = await testTelegram(kind, token, scope)
      setMsg(r.ok ? { ok: true, text: 'Mensagem de teste enviada.' } : { ok: false, text: r.error ?? 'Falhou.' })
    } catch (e) { fail(e, 'Não foi possível enviar.') }
    setBusy(false)
  }

  return (
    <div className="grid gap-5">
      <label className="grid gap-1 text-sm">
        <span className="text-ink-2">Token de administrador (guardado só neste navegador, nunca enviado)</span>
        <input type="password" className={input} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </label>

      {!tg ? (
        <div><button className={btn} onClick={() => void load()} disabled={!token}>Carregar configuração</button></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-ink-2">Token do bot (@BotFather) {tg.tokenSet && <b className="text-ok">· já salvo</b>}</span>
              <input type="password" className={input} value={bot} onChange={(e) => setBot(e.target.value)} placeholder={tg.tokenSet ? 'deixe vazio para manter' : '123456:ABC…'} autoComplete="off" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-ink-2">ID da conversa</span>
              <span className="flex gap-2">
                <input className={input} value={tg.chatId} onChange={(e) => setTg({ ...tg, chatId: e.target.value })} placeholder="-1001234…" />
                <button className={btn} onClick={detect} disabled={busy} title="Mande qualquer mensagem ao bot antes">Detectar</button>
              </span>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tg.enabled} onChange={(e) => setTg({ ...tg, enabled: e.target.checked })} /> Alertas ligados
          </label>

          <fieldset className="grid gap-1">
            <legend className="text-sm text-ink-2">Estações monitoradas {tg.stations.length === 0 && <span className="text-ink-3">(nenhuma marcada = todas)</span>}</legend>
            <div className="flex flex-wrap gap-2">
              {stations.map((s) => {
                const on = tg.stations.includes(s.id)
                return (
                  <label key={s.id} className={`num cursor-pointer rounded-lg border px-3 py-1.5 text-xs ${on ? 'border-cyan text-cyan' : 'border-line text-ink-2'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setTg({ ...tg, stations: on ? tg.stations.filter((x) => x !== s.id) : [...tg.stations, s.id] })} />
                    {s.name}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="grid gap-3">
            {RULES.map((r) => {
              const rule = tg.rules[r.key] as unknown as Record<string, number | boolean>
              return (
                <div key={r.key} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={!!rule.on} onChange={(e) => setTg({ ...tg, rules: { ...tg.rules, [r.key]: { ...rule, on: e.target.checked } } as TelegramSettings['rules'] })} /> {r.label}
                    </label>
                    <span className="flex flex-wrap items-center gap-2">
                      {r.fields?.map((fd) => (
                        <label key={fd.f} className="num flex items-center gap-1.5 text-xs text-ink-3">
                          {fd.label}
                          <input
                            type="number" step={fd.step ?? 1} min={0} className="num w-20 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-ink"
                            value={Number(rule[fd.f])}
                            onChange={(e) => setTg({ ...tg, rules: { ...tg.rules, [r.key]: { ...rule, [fd.f]: Number(e.target.value) } } as TelegramSettings['rules'] })}
                          />
                        </label>
                      ))}
                      <button className={btn} onClick={() => test(r.key)} disabled={busy || !tg.tokenSet}>Testar</button>
                    </span>
                  </div>
                  <label className="mt-2 grid gap-1 text-xs text-ink-3">
                    Mensagem · variáveis: <span className="num">{VARS[r.key]}</span>
                    <input
                      className={input} value={tg.templates[r.key] ?? tg.defaults[r.key]}
                      onChange={(e) => setTg({ ...tg, templates: { ...tg.templates, [r.key]: e.target.value } })}
                    />
                  </label>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}
              onClick={() => patch({ ...(bot ? { token: bot } : {}), chatId: tg.chatId, enabled: tg.enabled, stations: tg.stations, rules: tg.rules, templates: tg.templates })}
            >
              <Send className="h-4 w-4" aria-hidden /> Salvar alertas
            </button>
            <button className={btn} onClick={() => setTg({ ...tg, templates: {} })}>Restaurar mensagens</button>
            <p className="text-xs text-ink-3">O servidor confere a cada 5 minutos e avisa só quando o estado muda.</p>
          </div>
        </>
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
    </div>
  )
}
