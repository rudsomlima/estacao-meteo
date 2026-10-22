import { BatteryCharging, CircleCheck, CircleDashed, Wifi } from 'lucide-react'
import { go } from '../hooks/useRoute'
import { useMemo, useState } from 'react'
import { useEvents, useFirmware, type SaveResult } from '../hooks/useNetwork'
import { batteryPct, CHEMS } from '../lib/battery'
import { cycle } from '../lib/energy'
import { hasBattery } from '../lib/battery'
import { ENV_SENSORS, pinValue, type PinKey } from '../lib/pins'
import type { Reading, Source, Station, StationConfig } from '../types'
import Chart from './Chart'
import { ConfigSection, KeyTools, SaveBar } from './ConfigPanel'
import ConfigStatus from './ConfigStatus'
import DiagnosticsPanel from './DiagnosticsPanel'
import FirmwarePanel from './FirmwarePanel'
import Panel from './Panel'

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
  const hasWind = (c.has_wind ?? 1) === 1
  const hasVane = (c.has_vane ?? 1) === 1
  const hasRain = (c.has_rain ?? 1) === 1
  return [
    envRow,
    hasVane
      ? { name: 'QMC5883L · direção da biruta', state: (Number.isFinite(r.dir) ? 'ok' : 'bad') as 'ok' | 'bad', pin: `${i2c} · 0x0D` }
      : { name: 'QMC5883L · direção da biruta: não instalada', state: 'off' as const, pin: '—' },
    hasWind
      ? { name: 'Hall · giro do anemômetro', state: (Number.isFinite(r.wind) ? 'ok' : 'bad') as 'ok' | 'bad', pin: pin('pin_wind') }
      : { name: 'Hall · giro do anemômetro: não instalado', state: 'off' as const, pin: '—' },
    hasRain
      ? { name: 'Hall · tanque de chuva', state: (Number.isFinite(r.rain) ? 'ok' : 'bad') as 'ok' | 'bad', pin: `${pin('pin_rain')} (acorda)` }
      : { name: 'Hall · tanque de chuva: não instalado', state: 'off' as const, pin: '—' },
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
  tab?: string
  onSave: (s: Station, token: string) => Promise<SaveResult>
  onNewKey: (id: string, token: string) => Promise<SaveResult>
}

export const SETTINGS_TABS = [
  ['geral', 'Visão geral'],
  ['sensores', 'Placa e sensores'],
  ['envio', 'Medição, envio e energia'],
  ['diagnostico', 'Diagnóstico e firmware'],
  ['instalacao', 'Instalação'],
] as const
type Tab = (typeof SETTINGS_TABS)[number][0]

/** Só o que a pessoa edita: nome, local e configuração (a versão e o que a estação informa não contam como alteração). */
const editable = (s: Station) => JSON.stringify({ n: s.name, c: s.city, la: s.lat, lo: s.lon, al: s.alt, cfg: { ...s.config, version: 0 } })

/** Parte técnica de uma estação, em abas: visão geral, placa e sensores, envio e energia, diagnóstico e firmware, instalação. */
export default function StationSettings({ readings, station, source, tab: tabProp, onSave, onNewKey }: Props) {
  const tab: Tab = SETTINGS_TABS.some(([k]) => k === tabProp) ? (tabProp as Tab) : 'geral'
  const [draft, setDraft] = useState(station)
  const [synced, setSynced] = useState(station)
  const dirty = editable(draft) !== editable(station)
  // chegou dado novo do servidor (a cada envio): sem alterações pendentes, o rascunho acompanha; com alterações, elas ficam
  if (station !== synced) {
    setSynced(station)
    setDraft(dirty ? { ...station, name: draft.name, city: draft.city, lat: draft.lat, lon: draft.lon, alt: draft.alt, config: { ...draft.config, version: station.config.version } } : station)
  }
  const chem = CHEMS[draft.config.battery_chem]
  const events = useEvents(station.id, source)
  const { info } = useFirmware(station.id, source)

  const now = readings[readings.length - 1]
  const est = useMemo(() => cycle(draft.config), [draft.config])
  const dayAgo = (now?.ts ?? 0) - 86400
  const last7 = readings.filter((r) => hasBattery(r.vbat)).map((r) => ({ t: r.ts, v: r.vbat }))
  const rssi = readings.filter((r) => r.ts >= dayAgo && r.rssi < 0).map((r) => ({ t: r.ts, v: r.rssi }))
  const sensors = sensorsOf(draft.config, now)
  const awake = est.total - est.phases.filter((p) => p.key === 'sleep' || p.key === 'lsleep').reduce((s, p) => s + p.seconds, 0)

  const energy = (
    <div className="grid gap-4">
      <Panel id="ciclo" title={`Uma leitura a cada ${draft.config.interval_min} min`}>
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
        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-2 border-t border-line pt-4">
          <p className="font-display text-5xl font-extrabold tracking-tight text-ok">{Math.round(est.days)}<span className="ml-2 text-lg font-medium text-ink-2">dias sem sol</span></p>
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-ink-3">Corrente média</dt><dd className="text-right">{est.avg.toFixed(3)} mA</dd>
            <dt className="text-ink-3">Bateria</dt><dd className="text-right">{chem.label} · {draft.config.battery_mah} mAh</dd>
          </dl>
        </div>
        <p className="mt-3 text-xs text-ink-3">Estimativa pelas folhas de dados dos componentes, recalculada enquanto você muda os valores abaixo. O consumo real depende da placa (LED e regulador gastam em sono) e só se confirma medindo com um multímetro de µA.</p>
      </Panel>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-4 sm:px-6">
      <nav aria-label="Partes das configurações" className="sticky top-14 z-30 -mx-4 mb-6 overflow-x-auto border-b border-line bg-bg/90 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <ul role="tablist" className="flex gap-1 whitespace-nowrap py-2">
          {SETTINGS_TABS.map(([k, label]) => (
            <li key={k}>
              <button role="tab" aria-selected={tab === k} onClick={() => go(`s/${station.id}/config/${k}`)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${tab === k ? 'bg-card-hover text-ink ring-1 ring-line-hover' : 'text-ink-3 hover:text-ink'}`}>{label}</button>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'geral' && (
        <div className="grid gap-4">
          <ConfigStatus station={station} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel id="sensores" title="Sensores" hint="pela configuração e pela última leitura">
              <ul className="grid gap-2.5">
                {sensors.map((s) => (
                  <li key={s.name} className="flex items-start gap-2.5 text-sm">
                    {s.state === 'ok' ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="ok" />
                      : s.state === 'off' ? <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-label="não usado" />
                      : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="sem resposta" />}
                    <span className="min-w-0 flex-1">{s.name}</span>
                    <span className="num text-right text-xs text-ink-3">{s.pin}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => go(`s/${station.id}/config/sensores`)} className="mt-3 text-xs text-cyan hover:underline">Mudar o sensor ou os pinos</button>
            </Panel>
            <Panel id="agora" title="Energia e sinal agora">
              <dl className="num grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-ink-3">Tensão</dt><dd className="text-right">{hasBattery(now.vbat) ? `${now.vbat.toFixed(2)} V · ${batteryPct(now.vbat, draft.config.battery_chem)}%` : 'sem bateria'}</dd>
                <dt className="text-ink-3">Bateria</dt><dd className="text-right">{chem.label} · {draft.config.battery_mah} mAh</dd>
                <dt className="text-ink-3">Autonomia estimada</dt><dd className="text-right">{Math.round(est.days)} dias sem sol</dd>
                <dt className="text-ink-3">Último sinal</dt><dd className="flex items-center justify-end gap-1.5"><Wifi className="h-3.5 w-3.5" aria-hidden />{now.rssi < 0 ? `${now.rssi} dBm` : '—'}</dd>
                <dt className="text-ink-3">Firmware</dt><dd className="text-right">{station.fw_version ?? '—'}</dd>
              </dl>
            </Panel>
            <Panel id="bateria" title="Tensão da bateria · 7 dias" hint={last7.length ? 'sobe com o sol, cai à noite' : 'sem bateria ligada'}>
              <Chart unit="V" decimals={2} series={[{ label: 'bateria', color: '#4ade80', points: last7, fill: true }]} />
            </Panel>
            <Panel id="wifi" title="Sinal do Wi-Fi · 24 h" hint="dBm">
              <Chart unit="dBm" decimals={0} height={150} series={[{ label: 'RSSI', color: '#60a5fa', points: rssi }]} />
            </Panel>
          </div>
        </div>
      )}

      {tab === 'sensores' && (
        <Panel id="cfg-sensores" title="Placa e sensores" hint={`versão ${station.config.version}`}>
          <ConfigSection section="sensores" station={draft} source={source} onChange={setDraft} />
        </Panel>
      )}

      {tab === 'envio' && (
        <div className="grid gap-4">
          {energy}
          <Panel id="cfg-envio" title="Medição, envio e energia" hint={`versão ${station.config.version}`}>
            <ConfigSection section="envio" station={draft} source={source} onChange={setDraft} />
          </Panel>
        </div>
      )}

      {tab === 'diagnostico' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel id="eventos" title="Reinícios e eventos" hint={`${events.length} registros`}>
            <p className="mb-3 text-xs text-ink-3">Reinícios fora do sono de rotina, atualizações e o modo bancada. Quedas de tensão repetidas costumam apontar para a bateria ou o regulador.</p>
            <DiagnosticsPanel station={station} readings={readings} events={events} />
          </Panel>
          <Panel id="firmware" title="Firmware pelo ar" hint={station.fw_version ? `instalado ${station.fw_version}` : undefined}>
            <FirmwarePanel station={station} info={info} />
          </Panel>
        </div>
      )}

      {tab === 'instalacao' && (
        <div className="grid gap-4">
          <Panel id="cfg-instalacao" title="Nome, local e modo bancada" hint={`versão ${station.config.version}`}>
            <ConfigSection section="instalacao" station={draft} source={source} onChange={setDraft} />
          </Panel>
          <Panel id="primeiro-acesso" title={<span className="flex items-center gap-2"><BatteryCharging className="h-5 w-5 text-cyan" aria-hidden /> Primeiro acesso e portal Wi-Fi</span>}>
            <ol className="grid gap-3 sm:grid-cols-2">
              {PORTAL.map(([n, t, d]) => (
                <li key={n} className="flex gap-3">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-hover text-xs text-cyan">{n}</span>
                  <span><b className="block text-sm">{t}</b><span className="text-xs text-ink-2">{d}</span></span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel id="chave" title="Chave da estação e código de pareamento">
            <KeyTools station={station} source={source} onNewKey={onNewKey} />
          </Panel>
        </div>
      )}

      <SaveBar draft={draft} source={source} dirty={dirty} onSave={onSave} onDiscard={() => setDraft(station)} />
    </div>
  )
}
