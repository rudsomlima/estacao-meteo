import { useMemo } from 'react'
import Energy from './components/Energy'
import Hero from './components/Hero'
import MapPage from './components/MapPage'
import Navbar from './components/Navbar'
import Trends from './components/Trends'
import { useLenis } from './hooks/useLenis'
import { useNetwork, useReadings } from './hooks/useNetwork'
import { go, useRoute } from './hooks/useRoute'
import { isOnline } from './lib/derive'

function StationPage({ id, net }: { id: string; net: ReturnType<typeof useNetwork> }) {
  const { stations, source, save, newKey } = net
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
  if (!readings.length) {
    return (
      <div className="grid min-h-svh place-items-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-bold">{station.name} ainda não enviou leituras</h1>
          <p className="mt-2 text-ink-2">Ligue o ESP32, confira o Wi-Fi e a chave do dispositivo. A primeira leitura aparece aqui em até {station.config.interval_min} min.</p>
          <button onClick={() => go('')} className="mt-4 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white">Voltar ao mapa</button>
        </div>
      </div>
    )
  }
  const now = readings[readings.length - 1]
  const on = isOnline({ latest: now, config: station.config })
  return (
    <>
      <Navbar
        mode="station" title={station.name} source={source} lastTs={now.ts}
        status={{ color: source === 'demo' ? 'bg-warn' : on ? 'bg-ok' : 'bg-bad', text: source === 'demo' ? 'demonstração' : on ? 'online' : 'atrasada' }}
      />
      <main>
        <Hero readings={readings} station={station} />
        <Trends readings={readings} />
        <Energy readings={readings} station={station} source={source} onSave={save} onNewKey={newKey} />
      </main>
      <footer className="border-t border-line px-4 py-8 text-center text-xs text-ink-3">
        Estação meteorológica ESP32-C3 · sensores de vento baseados no Windicator V2.0 Compact
      </footer>
    </>
  )
}

export default function App() {
  useLenis()
  const net = useNetwork()
  const route = useRoute()
  const online = useMemo(() => net.stations.filter((s) => isOnline(s)).length, [net.stations])

  if (net.loading) return <div className="grid min-h-svh place-items-center text-sm text-ink-3">Carregando estações…</div>

  if (route.page === 'station') return <StationPage id={route.id} net={net} />

  return (
    <>
      <Navbar
        mode="map" title="Estação Meteo" source={net.source}
        status={{ color: net.source === 'demo' ? 'bg-warn' : 'bg-ok', text: net.source === 'demo' ? 'demonstração' : `${online} de ${net.stations.length} online` }}
      />
      <main>
        <MapPage stations={net.stations} source={net.source} onCreate={net.add} />
      </main>
      <footer className="border-t border-line px-4 py-8 text-center text-xs text-ink-3">
        Mapa © OpenStreetMap contributors · Estação meteorológica ESP32-C3
      </footer>
    </>
  )
}
