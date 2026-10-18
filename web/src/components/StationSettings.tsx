import { BatteryCharging, CircleCheck, CircleDashed, Wifi } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEvents, useFirmware, type SaveResult } from '../hooks/useNetwork'
import { batteryPct, CHEMS } from '../lib/battery'
import { cycle } from '../lib/energy'
import type { Reading, Source, Station } from '../types'
import Chart from './Chart'
import ConfigPanel from './ConfigPanel'
import ConfigStatus from './ConfigStatus'
import DiagnosticsPanel from './DiagnosticsPanel'
import FirmwarePanel from './FirmwarePanel'
import Panel from './Panel'
import { SectionHead } from './Reveal'

const SENSORS = (r: Reading) => [
  { name: 'BME280 · temperatura, umidade, pressão', ok: r.temp > -40 && r.temp < 85 && r.hum > 0 && r.pres > 300, pin: 'I²C 0x76' },
  { name: 'QMC5883L · direção da biruta', ok: Number.isFinite(r.dir), pin: 'I²C 0x0D' },
  { name: 'Hall · giro do anemômetro', ok: r.wind >= 0, pin: 'GPIO4' },
  { name: 'Hall · tanque de chuva', ok: r.rain >= 0, pin: 'GPIO3 (acorda)' },
  { name: 'Divisor da bateria', ok: r.vbat > 2.5 && r.vbat < 4.5, pin: 'GPIO0 (ADC)' },
]

const PORTAL = [
  ['1', 'Ligue a estação', 'Sem rede salva ela abre o ponto de acesso EstacaoMeteo-XXXX.'],
  ['2', 'Conecte pelo celular', 'A página de configuração abre sozinha (ou acesse 192.168.4.1).'],
  ['3', 'Escolha a rede e a senha', 'Informe o endereço do site, o ID da estação, a chave do dispositivo e os minutos do modo bancada.'],
  ['4', 'Modo bancada', 'Depois de conectar, a estação abre por alguns minutos uma página local para ver as leituras e calibrar a biruta.'],
]

interface Props {
  readings: Reading[]
  station: Station
  source: Source
  onSave: (s: Station, token: string) => Promise<SaveResult>
  onNewKey: (id: string, token: string) => Promise<SaveResult>
}

/** Parte técnica de uma estação: energia, telemetria, diagnóstico, firmware e configuração remota. */
export default function StationSettings({ readings, station, source, onSave, onNewKey }: Props) {
  const [draft, setDraft] = useState(station)
  const [synced, setSynced] = useState(station)
  if (station !== synced) { setSynced(station); setDraft(station) } // chegou dado novo do servidor
  const chem = CHEMS[draft.config.battery_chem]
  const events = useEvents(station.id, source)
  const { info, reload } = useFirmware(station.id, source)

  const now = readings[readings.length - 1]
  const est = useMemo(() => cycle(draft.config), [draft.config])
  const real = readings.filter((r) => Number.isFinite(r.temp))  // sem leitura de sensor não há o que desenhar
  const last7 = real.map((r) => ({ t: r.ts, v: r.vbat }))
  const rssi = real.slice(-144).map((r) => ({ t: r.ts, v: r.rssi }))
  const strip = (s: Station) => JSON.stringify({ ...s, latest: null, day: null, config: { ...s.config, version: 0 }, cfg_applied: 0, last_seen: null })
  const dirty = strip(draft) !== strip(station)
  const sensors = SENSORS(now)
  const awake = est.total - est.phases.filter((p) => p.key === 'sleep' || p.key === 'lsleep').reduce((s, p) => s + p.seconds, 0)

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <SectionHead id="energia" kicker="Energia e telemetria" title="Quanto a bateria aguenta">
        A estação dorme quase o tempo todo. Mude os valores na configuração e veja a estimativa se ajustar antes de salvar.
      </SectionHead>

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <Panel id="ciclo" title={`Um ciclo de ${draft.config.interval_min} min`} className="lg:col-span-12">
          <div className="flex h-9 overflow-hidden rounded-lg border border-line" role="img" aria-label="Divisão do tempo entre dormir e medir">
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
        </Panel>

        <div className="grid content-start gap-4 lg:col-span-5">
          <Panel id="autonomia" title="Autonomia estimada, sem sol">
            <p className="font-display text-6xl font-extrabold tracking-tight text-ok">{Math.round(est.days)}<span className="ml-2 text-xl font-medium text-ink-2">dias</span></p>
            <dl className="num mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-ink-3">Corrente média</dt><dd className="text-right">{est.avg.toFixed(3)} mA</dd>
              <dt className="text-ink-3">Bateria</dt><dd className="text-right">{chem.label} · {draft.config.battery_mah} mAh</dd>
              <dt className="text-ink-3">Tensão agora</dt><dd className="text-right">{now.vbat > 1 ? `${now.vbat.toFixed(2)} V · ${batteryPct(now.vbat, draft.config.battery_chem)}%` : '—'}</dd>
              <dt className="text-ink-3">Último sinal</dt><dd className="flex items-center justify-end gap-1.5"><Wifi className="h-3.5 w-3.5" aria-hidden />{now.rssi < 0 ? `${now.rssi} dBm` : '—'}</dd>
            </dl>
            <p className="mt-4 text-xs text-ink-3">Estimativa por folha de dados. Meça a corrente de sono com um multímetro de µA e ajuste os valores em <span className="num">lib/energy.ts</span>.</p>
          </Panel>

          <Panel id="sensores" title="Sensores">
            <ul className="grid gap-2.5">
              {sensors.map((s) => (
                <li key={s.name} className="flex items-start gap-2.5 text-sm">
                  {s.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="ok" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="sem resposta" />}
                  <span className="min-w-0 flex-1">{s.name}</span>
                  <span className="num text-xs text-ink-3">{s.pin}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid content-start gap-4 lg:col-span-7">
          <Panel id="bateria" title="Tensão da bateria · 7 dias" hint="sobe com o sol, cai à noite">
            <Chart unit="V" decimals={2} series={[{ label: 'bateria', color: '#4ade80', points: last7, fill: true }]} />
          </Panel>
          <Panel id="wifi" title="Sinal do Wi-Fi · 24 h" hint="dBm">
            <Chart unit="dBm" decimals={0} height={150} series={[{ label: 'RSSI', color: '#60a5fa', points: rssi }]} />
          </Panel>
          <Panel id="primeiro-acesso" title={<span className="flex items-center gap-2"><BatteryCharging className="h-5 w-5 text-cyan" aria-hidden /> Primeiro acesso</span>} defaultOpen={false}>
            <ol className="grid gap-3 sm:grid-cols-2">
              {PORTAL.map(([n, t, d]) => (
                <li key={n} className="flex gap-3">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-hover text-xs text-cyan">{n}</span>
                  <span><b className="block text-sm">{t}</b><span className="text-xs text-ink-2">{d}</span></span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      <div className="mt-20">
        <SectionHead id="diagnostico" kicker="Diagnóstico" title="O que a estação conta sobre si mesma">
          Reinícios fora do sono de rotina, atualizações e o modo bancada. Quedas de tensão repetidas costumam apontar para a bateria ou o regulador.
        </SectionHead>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel id="eventos" title="Reinícios e eventos" hint={`${events.length} registros`}>
            <DiagnosticsPanel station={station} readings={readings} events={events} />
          </Panel>
          <Panel id="firmware" title="Firmware pelo ar" hint={station.fw_version ? `instalado ${station.fw_version}` : undefined}>
            <FirmwarePanel station={station} info={info} source={source} onChanged={reload} />
          </Panel>
        </div>
      </div>

      <div className="mt-20">
        <SectionHead id="config" kicker="Configuração remota" title="A estação baixa isto a cada envio">
          Salvar aumenta o número da versão. A estação manda a versão que tem a cada envio e só aplica quando a do servidor é diferente.
          {source === 'demo' && ' Você está na demonstração: as alterações ficam só neste navegador.'}
        </SectionHead>
        <div className="mt-6 grid max-w-3xl gap-4">
          <ConfigStatus station={station} />
          <Panel id="configuracao" title="Parâmetros" hint={`versão ${station.config.version}`}>
            <ConfigPanel station={draft} source={source} onChange={setDraft} onSave={onSave} onNewKey={onNewKey} dirty={dirty} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
