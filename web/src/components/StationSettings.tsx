import { BatteryCharging, CircleCheck, CircleDashed, Wifi } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEvents, useFirmware, type SaveResult } from '../hooks/useNetwork'
import { batteryPct, CHEMS } from '../lib/battery'
import { cycle } from '../lib/energy'
import { hasBattery } from '../lib/battery'
import { ENV_SENSORS, pinValue, type PinKey } from '../lib/pins'
import type { Reading, Source, Station, StationConfig } from '../types'
import Chart from './Chart'
import ConfigPanel from './ConfigPanel'
import ConfigStatus from './ConfigStatus'
import DiagnosticsPanel from './DiagnosticsPanel'
import FirmwarePanel from './FirmwarePanel'
import Panel from './Panel'
import { SectionHead } from './Reveal'

/** O que a placa tem ligado, segundo a configuração (sensor e pinos), e se a última leitura mostra que funciona. */
function sensorsOf(c: StationConfig, r: Reading) {
  const pin = (k: PinKey) => `GPIO${pinValue(c, k)}`
  const env = c.env_sensor ?? 1
  const i2c = `I²C ${pin('pin_sda')}/${pin('pin_scl')}`
  const envRow = env === 0
    ? { name: 'Sensor de ambiente: nenhum', state: 'off' as const, pin: '—' }
    : {
        name: ENV_SENSORS.find((x) => x.id === env)?.label ?? 'Sensor de ambiente',
        state: (Number.isFinite(r.temp) && Number.isFinite(r.pres) && (env === 2 || Number.isFinite(r.hum)) ? 'ok' : 'bad') as 'ok' | 'bad',
        pin: `${i2c} · ${env === 2 ? '0x77' : env === 3 ? '0x76 + 0x77' : '0x76'}`,
      }
  return [
    envRow,
    { name: 'QMC5883L · direção da biruta', state: (Number.isFinite(r.dir) ? 'ok' : 'bad') as 'ok' | 'bad', pin: `${i2c} · 0x0D` },
    { name: 'Hall · giro do anemômetro', state: (Number.isFinite(r.wind) ? 'ok' : 'bad') as 'ok' | 'bad', pin: pin('pin_wind') },
    { name: 'Hall · tanque de chuva', state: (Number.isFinite(r.rain) ? 'ok' : 'bad') as 'ok' | 'bad', pin: `${pin('pin_rain')} (acorda)` },
    { name: 'Divisor da bateria', state: (hasBattery(r.vbat) && r.vbat < 4.5 ? 'ok' : 'off') as 'ok' | 'off', pin: `${pin('pin_vbat')} (ADC)` },
  ]
}

const PORTAL = [
  ['1', 'Ligue a estação', 'Sem rede salva ela abre sozinha o ponto de acesso EstacaoMeteo-XXXX.'],
  ['2', 'Já tem rede salva?', 'Ligue a placa e, nos primeiros 6 segundos, aperte o botão BOOT por meio segundo. Não segure o BOOT ao ligar: a placa entraria em modo de gravação.'],
  ['3', 'Conecte pelo celular', 'A página de configuração abre sozinha (ou acesse 192.168.4.1). Escolha a rede, a senha e preencha o código de pareamento.'],
  ['4', 'Com a placa no computador', 'Mais fácil: no painel do administrador, em Site e placas, grave e configure a placa pela USB, sem portal.'],
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
  const { info } = useFirmware(station.id, source)

  const now = readings[readings.length - 1]
  const est = useMemo(() => cycle(draft.config), [draft.config])
  const dayAgo = (now?.ts ?? 0) - 86400
  const last7 = readings.filter((r) => hasBattery(r.vbat)).map((r) => ({ t: r.ts, v: r.vbat }))
  const rssi = readings.filter((r) => r.ts >= dayAgo && r.rssi < 0).map((r) => ({ t: r.ts, v: r.rssi }))
  const strip = (s: Station) => JSON.stringify({ ...s, latest: null, day: null, config: { ...s.config, version: 0 }, cfg_applied: 0, last_seen: null })
  const dirty = strip(draft) !== strip(station)
  const sensors = sensorsOf(draft.config, now)
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
              <dt className="text-ink-3">Tensão agora</dt><dd className="text-right">{hasBattery(now.vbat) ? `${now.vbat.toFixed(2)} V · ${batteryPct(now.vbat, draft.config.battery_chem)}%` : 'sem bateria'}</dd>
              <dt className="text-ink-3">Último sinal</dt><dd className="flex items-center justify-end gap-1.5"><Wifi className="h-3.5 w-3.5" aria-hidden />{now.rssi < 0 ? `${now.rssi} dBm` : '—'}</dd>
            </dl>
            <p className="mt-4 text-xs text-ink-3">Estimativa pelas folhas de dados dos componentes. O consumo real depende da placa (LED e regulador gastam em sono) e só se confirma medindo com um multímetro de µA.</p>
          </Panel>

          <Panel id="sensores" title="Sensores">
            <ul className="grid gap-2.5">
              {sensors.map((s) => (
                <li key={s.name} className="flex items-start gap-2.5 text-sm">
                  {s.state === 'ok' ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="ok" />
                    : s.state === 'off' ? <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-label="não usado" />
                    : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="sem resposta" />}
                  <span className="min-w-0 flex-1">{s.name}</span>
                  <span className="num text-xs text-ink-3">{s.pin}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid content-start gap-4 lg:col-span-7">
          <Panel id="bateria" title="Tensão da bateria · 7 dias" hint={last7.length ? 'sobe com o sol, cai à noite' : 'sem bateria ligada'}>
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
            <FirmwarePanel station={station} info={info} />
          </Panel>
        </div>
      </div>

      <div className="mt-20">
        <SectionHead id="config" kicker="Configuração remota" title="A estação baixa isto a cada envio">
          Salvar aumenta o número da versão. A estação manda a versão que tem a cada envio e só aplica quando a do servidor é diferente.
          {source === 'demo' && ' Você está na demonstração: as alterações ficam só neste navegador.'}
        </SectionHead>
        <div className="mt-6 grid max-w-3xl gap-4">
          <nav aria-label="Ir para" className="flex flex-wrap gap-2 text-sm">
            <span className="self-center text-ink-3">Ir para:</span>
            {([['sensores', 'Placa, sensores e pinos'], ['bateria', 'Bateria'], ['envio', 'Envio, vento e economia'], ['estacao', 'Nome e local']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-full border border-line px-3 py-1 hover:bg-card-hover">{label}</button>
            ))}
          </nav>
          <ConfigStatus station={station} />
          <Panel id="configuracao" title="Parâmetros" hint={`versão ${station.config.version}`}>
            <ConfigPanel station={draft} source={source} onChange={setDraft} onSave={onSave} onNewKey={onNewKey} dirty={dirty} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
