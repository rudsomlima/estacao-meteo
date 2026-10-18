import { useEffect, useMemo, type ReactNode } from 'react'
import Analyses from './components/Analyses'
import GlobalSettings from './components/GlobalSettings'
import StationSettings from './components/StationSettings'
import { NoReadings } from './components/StationPanel'
import Hero from './components/Hero'
import MapPage from './components/MapPage'
import Navbar from './components/Navbar'
import UsbDevice from './components/UsbDevice'
import TechCard from './components/TechCard'
import Trends from './components/Trends'
import { useLenis } from './hooks/useLenis'
import { useNetwork, useReadings } from './hooks/useNetwork'
import { go, useRoute } from './hooks/useRoute'
import { isOnline } from './lib/derive'
import { getPrefs } from './lib/prefs'
import type { Reading, Station } from './types'

type Net = ReturnType<typeof useNetwork>

/** Carrega a estação e as leituras e mostra uma página de erro ou de espera quando não há o que mostrar. */
function StationGate({ id, net, allowEmpty, children }: { id: string; net: Net; allowEmpty?: boolean; children: (station: Station, readings: Reading[]) => ReactNode }) {
  const { stations, source } = net
  const station = stations.find((s) => s.id === id)
  const { readings, loading } = useReadings(station ? id : null, source)

  if (!station) {
    return (
      <div className="grid min-h-svh place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Estação não encontrada</h1>
          <p className="mt-2 text-ink-2">Não existe uma estação com o id <b className="num">{id}</b>.</p>
          <button onClick={() => go('')} className="mt-4 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">Voltar ao mapa</button>
        </div>
      </div>
    )
  }
  if (loading) return <div className="grid min-h-svh place-items-center text-sm text-ink-3">Carregando leituras…</div>
  if (!readings.length && !allowEmpty) {
    return (
      <div className="grid min-h-svh place-items-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-bold">{station.name} ainda não enviou leituras</h1>
          <div className="text-left"><NoReadings s={station} /></div>
          <p className="mt-3 text-xs text-ink-3">Sensor BME280: 3V3, GND, SDA no GPIO 6 e SCL no GPIO 7. Depois aperte RESET na placa.</p>
          <button onClick={() => go(`s/${station.id}/config`)} className="mt-4 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-card-hover">Configurações da estação</button>
          <button onClick={() => go('')} className="mt-4 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">Voltar ao mapa</button>
        </div>
      </div>
    )
  }
  return <>{children(station, readings)}</>
}

function statusOf(station: Station, now: Reading, source: Net['source']) {
  const on = isOnline({ latest: now, config: station.config })
  return { color: source === 'demo' ? 'bg-warn' : on ? 'bg-ok' : 'bg-bad', text: source === 'demo' ? 'demonstração' : on ? 'online' : 'atrasada' }
}

function StationPage({ id, net }: { id: string; net: Net }) {
  return (
    <StationGate id={id} net={net}>
      {(station, readings) => {
        const now = readings[readings.length - 1]
        return (
          <>
            <Navbar
              mode="station" title={station.name} source={net.source} lastTs={now.ts} status={statusOf(station, now, net.source)}
              back={{ to: '', label: 'Rede' }} settingsTo={`s/${station.id}/config`}
            />
            <main>
              <Hero readings={readings} station={station} />
              <Trends readings={readings} />
              <TechCard station={station} readings={readings} />
            </main>
            <footer className="border-t border-line px-4 py-8 text-center text-xs text-ink-3">
              Estação meteorológica ESP32-C3 · sensores de vento baseados no Windicator V2.0 Compact
            </footer>
          </>
        )
      }}
    </StationGate>
  )
}

/** Parte técnica da estação: energia, telemetria, sensores e configuração remota. */
function SettingsPage({ id, net }: { id: string; net: Net }) {
  return (
    <StationGate id={id} net={net} allowEmpty>
      {(station, loaded) => {
        // estação sem leitura de sensor (por exemplo, sem BME280): a configuração continua disponível, com o que a placa informa
        const readings = loaded.length ? loaded : [{ ts: station.last_seen ?? 0, temp: NaN, hum: NaN, pres: NaN, wind: NaN, gust: NaN, dir: NaN, rain: NaN, vbat: station.vbat ?? 0, rssi: station.rssi ?? 0 }]
        const now = readings[readings.length - 1]
        return (
          <>
            <Navbar
              mode="settings" title={`Configurações · ${station.name}`} source={net.source} lastTs={now.ts} status={statusOf(station, now, net.source)}
              back={{ to: `s/${station.id}`, label: station.name }}
            />
            <main>
              <div className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
                <p className="num text-xs text-ink-3">{station.name}{station.city ? ` · ${station.city}` : ''}</p>
                <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Configurações</h1>
                <p className="mt-2 max-w-2xl text-ink-2">Parte técnica da estação: consumo e autonomia, estado dos sensores, bateria e a configuração que ela baixa a cada envio.</p>
              </div>
              <StationSettings readings={readings} station={station} source={net.source} onSave={net.save} onNewKey={net.newKey} />
            </main>
          </>
        )
      }}
    </StationGate>
  )
}

function Routes({ net }: { net: Net }) {
  useLenis()
  const route = useRoute()
  const online = useMemo(() => net.stations.filter((s) => isOnline(s)).length, [net.stations])

  // "abrir na estação principal": só na primeira visita à página inicial, para o botão Voltar ainda levar ao mapa
  useEffect(() => {
    const p = getPrefs()
    if (!net.loading && p.openMain && p.favorites[0] && route.page === 'map' && !sessionStorage.getItem('meteo.opened')) {
      sessionStorage.setItem('meteo.opened', '1')
      if (net.stations.some((s) => s.id === p.favorites[0])) go(`s/${p.favorites[0]}`)
    }
  }, [net.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (net.loading) return <div className="grid min-h-svh place-items-center text-sm text-ink-3">Carregando estações…</div>

  if (route.page === 'station') return <StationPage id={route.id} net={net} />
  if (route.page === 'settings') return <SettingsPage id={route.id} net={net} />
  if (route.page === 'config' || route.page === 'analyses') {
    const cfg = route.page === 'config'
    return (
      <>
        <Navbar mode={route.page} title={cfg ? 'Ajustes' : 'Análises'} source={net.source} status={null} back={{ to: '', label: 'Rede' }} />
        <main>
          {cfg ? <GlobalSettings stations={net.stations} source={net.source} /> : <Analyses stations={net.stations} source={net.source} />}
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar
        mode="map" title="Estação Meteo" source={net.source}
        status={{ color: net.source === 'demo' ? 'bg-warn' : 'bg-ok', text: net.source === 'demo' ? 'demonstração' : `${online} de ${net.stations.length} online` }}
      />
      <main>
        <MapPage stations={net.stations} source={net.source} onCreate={net.add} onSave={net.save} onRemove={net.remove} />
      </main>
      <footer className="border-t border-line px-4 py-8 text-center text-xs text-ink-3">
        Mapa © OpenStreetMap contributors · Estação meteorológica ESP32-C3
      </footer>
    </>
  )
}

export default function App() {
  const net = useNetwork()
  return (
    <>
      <Routes net={net} />
      <UsbDevice stations={net.stations} source={net.source} onChanged={net.refresh} />
    </>
  )
}
