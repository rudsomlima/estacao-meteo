import { BatteryCharging, CircleCheck, CircleDashed, Wifi } from 'lucide-react'
import { useMemo, useState } from 'react'
import { batteryPct, CHEMS } from '../lib/battery'
import { dayStats } from '../lib/derive'
import { cycle } from '../lib/energy'
import type { SaveResult } from '../hooks/useNetwork'
import type { Reading, Source, Station } from '../types'
import Chart from './Chart'
import ConfigPanel from './ConfigPanel'
import Reveal, { SectionHead } from './Reveal'

const SENSORS = (r: Reading) => [
  { name: 'BME280 · temperatura, umidade, pressão', ok: r.temp > -40 && r.temp < 85 && r.hum > 0 && r.pres > 300, pin: 'I²C 0x76' },
  { name: 'QMC5883L · direção da biruta', ok: Number.isFinite(r.dir), pin: 'I²C 0x0D' },
  { name: 'A3144 · giro do anemômetro', ok: r.wind >= 0, pin: 'GPIO4' },
  { name: 'Hall · tanque de chuva', ok: r.rain >= 0, pin: 'GPIO3 (acorda)' },
  { name: 'Divisor da bateria', ok: r.vbat > 2.5 && r.vbat < 4.5, pin: 'GPIO0 (ADC)' },
]

const PORTAL = [
  ['1', 'Ligue a estação', 'Sem rede salva ela abre o ponto de acesso EstacaoMeteo-XXXX.'],
  ['2', 'Conecte pelo celular', 'A página de configuração abre sozinha (ou acesse 192.168.4.1).'],
  ['3', 'Escolha a rede e a senha', 'Informe também o endereço do site e a chave do dispositivo.'],
  ['4', 'Salvar', 'A estação reinicia, envia a primeira leitura e vai dormir.'],
]

interface Props {
  /** true quando está na página de Configurações (sem borda e fundo de seção, com menos respiro no topo) */
  standalone?: boolean
  readings: Reading[]
  station: Station
  source: Source
  onSave: (s: Station, token: string) => Promise<SaveResult>
  onNewKey: (id: string, token: string) => Promise<SaveResult>
}

export default function Energy({ standalone = false, readings, station, source, onSave, onNewKey }: Props) {
  const [draft, setDraft] = useState(station)
  const [synced, setSynced] = useState(station)
  if (station !== synced) { setSynced(station); setDraft(station) } // chegou dado novo do servidor
  const config = station.config
  const chem = CHEMS[draft.config.battery_chem]

  const now = readings[readings.length - 1]
  const est = useMemo(() => cycle(draft.config), [draft.config])
  const stats = dayStats(readings)
  const last7 = readings.map((r) => ({ t: r.ts, v: r.vbat }))
  const rssi = readings.slice(-144).map((r) => ({ t: r.ts, v: r.rssi }))
  const strip = (s: Station) => JSON.stringify({ ...s, latest: null, day: null, config: { ...s.config, version: 0 } })
  const dirty = strip(draft) !== strip(station)
  const sensors = SENSORS(now)
  const awake = est.total - est.phases.filter((p) => p.key === 'sleep' || p.key === 'lsleep').reduce((s, p) => s + p.seconds, 0)

  return (
    <section className={standalone ? '' : 'border-t border-line bg-[#090d0f]'}>
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${standalone ? 'pb-24 pt-6' : 'py-24'}`}>
        <SectionHead id="energia" kicker="Energia e telemetria" title="Quanto a bateria aguenta">
          A estação dorme quase o tempo todo. Mude os valores à direita e veja a estimativa se ajustar antes de salvar.
        </SectionHead>

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <Reveal className="rounded-2xl border border-line bg-card p-5 lg:col-span-12">
            <h3 className="font-display text-lg font-semibold">Um ciclo de {draft.config.interval_min} min</h3>
            <div className="mt-4 flex h-9 overflow-hidden rounded-lg border border-line" role="img" aria-label="Divisão do tempo entre dormir e medir">
              {est.phases.map((p) => (
                <div key={p.key} title={`${p.label}: ${p.seconds.toFixed(1)} s a ${p.mA} mA`} style={{ flex: `${Math.max(p.seconds / est.total, p.key === 'sleep' ? 0 : 0.012)} 0 0`, background: p.color }} />
              ))}
            </div>
            <ul className="num mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-2">
              {est.phases.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                  {p.label} {p.seconds < 10 ? p.seconds.toFixed(1) : p.seconds.toFixed(0)} s · {p.mA} mA
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-3">
              {est.continuous
                ? `Light sleep o ciclo todo, contando cada pulso do anemômetro. A CPU só fica ativa na leitura (${awake.toFixed(1)} s por ciclo, em média) e no envio, que ocorre a cada ${draft.config.send_every} leituras.`
                : `Acordada ${awake.toFixed(1)} s de ${est.total} s (${((awake / est.total) * 100).toFixed(1)}%), com envio a cada ${draft.config.send_every} leituras.`}
            </p>
          </Reveal>

          <div className="grid content-start gap-4 lg:col-span-5">
            <Reveal className="rounded-2xl border border-line bg-card p-5">
              <p className="num text-xs uppercase tracking-[0.14em] text-ink-3">Autonomia estimada, sem sol</p>
              <p className="mt-1 font-display text-6xl font-extrabold tracking-tight text-ok">{Math.round(est.days)}<span className="ml-2 text-xl font-medium text-ink-2">dias</span></p>
              <dl className="num mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-ink-3">Corrente média</dt><dd className="text-right">{est.avg.toFixed(3)} mA</dd>
                <dt className="text-ink-3">Bateria</dt><dd className="text-right">{chem.label} · {draft.config.battery_mah} mAh</dd>
                <dt className="text-ink-3">Tensão agora</dt><dd className="text-right">{now.vbat.toFixed(2)} V · {batteryPct(now.vbat, draft.config.battery_chem)}%</dd>
                <dt className="text-ink-3">Último sinal</dt><dd className="flex items-center justify-end gap-1.5"><Wifi className="h-3.5 w-3.5" aria-hidden />{now.rssi} dBm</dd>
              </dl>
              <p className="mt-4 text-xs text-ink-3">Estimativa por folha de dados. Meça a corrente de sono com um multímetro de µA e ajuste os valores em <span className="num">lib/energy.ts</span>.</p>
            </Reveal>

            <Reveal className="rounded-2xl border border-line bg-card p-5">
              <h3 className="font-display text-lg font-semibold">Sensores</h3>
              <ul className="mt-3 grid gap-2.5">
                {sensors.map((s) => (
                  <li key={s.name} className="flex items-start gap-2.5 text-sm">
                    {s.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="ok" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="sem resposta" />}
                    <span className="min-w-0 flex-1">{s.name}</span>
                    <span className="num text-xs text-ink-3">{s.pin}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <div className="grid content-start gap-4 lg:col-span-7">
            <Reveal className="rounded-2xl border border-line bg-card p-5">
              <div className="mb-3 flex items-baseline justify-between"><h3 className="font-display text-lg font-semibold">Tensão da bateria · 7 dias</h3><span className="num text-xs text-ink-3">sobe com o sol, cai à noite</span></div>
              <Chart unit="V" decimals={2} series={[{ label: 'bateria', color: '#4ade80', points: last7, fill: true }]} />
            </Reveal>
            <Reveal className="rounded-2xl border border-line bg-card p-5">
              <div className="mb-3 flex items-baseline justify-between"><h3 className="font-display text-lg font-semibold">Sinal do Wi-Fi · 24 h</h3><span className="num text-xs text-ink-3">dBm</span></div>
              <Chart unit="dBm" decimals={0} height={150} series={[{ label: 'RSSI', color: '#60a5fa', points: rssi }]} />
            </Reveal>
            <Reveal className="rounded-2xl border border-line bg-card p-5">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><BatteryCharging className="h-5 w-5 text-cyan" aria-hidden /> Primeiro acesso</h3>
              <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                {PORTAL.map(([n, t, d]) => (
                  <li key={n} className="flex gap-3">
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-hover text-xs text-cyan">{n}</span>
                    <span><b className="block text-sm">{t}</b><span className="text-xs text-ink-2">{d}</span></span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>

        <div className="mt-20">
          <SectionHead id="config" kicker="Configuração remota" title="A estação baixa isto a cada ciclo">
            Salvar aumenta o número da versão. O ESP32 compara a versão que tem com a do servidor e só aplica quando mudou.
            {source === 'demo' && ' Você está na demonstração: as alterações ficam só neste navegador.'}
          </SectionHead>
          <div className="mt-6 max-w-3xl">
            <ConfigPanel station={draft} source={source} onChange={setDraft} onSave={onSave} onNewKey={onNewKey} dirty={dirty} />
          </div>
          <p className="num mt-6 text-xs text-ink-3">Hoje: mín {stats.tMin.toFixed(1)}° · máx {stats.tMax.toFixed(1)}° · {stats.rainDay.toFixed(1)} mm · versão da configuração {config.version}</p>
        </div>
      </div>
    </section>
  )
}
