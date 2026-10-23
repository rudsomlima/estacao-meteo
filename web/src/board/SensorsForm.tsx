import { TriangleAlert } from 'lucide-react'
import Toggle from '../components/Toggle'
import { ENV_SENSORS, PIN_DEFAULTS, PINS, pinProblem, pinValue, USABLE_PINS, type PinKey } from '../lib/pins'
import { PIN_MAX } from '../lib/schema'
import type { StationConfig } from '../types'

const input = 'num w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal'

/** Sensor de ambiente, o que está instalado (anemômetro, biruta, pluviômetro) e os pinos. Serve para a placa de uma estação nova e para editar uma antiga. */
export default function SensorsForm({ cfg, set }: { cfg: StationConfig; set: (patch: Partial<StationConfig>) => void }) {
  const sensor = ENV_SENSORS.find((x) => x.id === (cfg.env_sensor ?? 1)) ?? ENV_SENSORS[1]
  const err = pinProblem(cfg)
  return (
    <div className="grid gap-4 text-sm">
      <label className="grid gap-1 font-medium">Sensor de ambiente
        <select className={input} value={cfg.env_sensor ?? 1} onChange={(e) => set({ env_sensor: Number(e.target.value) })}>
          {ENV_SENSORS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <span className="text-xs font-normal text-ink-3">{sensor.hint}</span>
      </label>
      <div className="grid gap-3">
        <Toggle checked={(cfg.has_wind ?? 1) === 1} onChange={(v) => set({ has_wind: v ? 1 : 0 })} title="Tem anemômetro">
          Desligue se não há rotor instalado: velocidade e rajada somem da página (em vez de mostrar ruído do pino solto).
        </Toggle>
        <Toggle checked={(cfg.has_vane ?? 1) === 1} onChange={(v) => set({ has_vane: v ? 1 : 0 })} title="Tem biruta">
          Desligue se não há biruta (bússola QMC5883L) instalada: direção do vento some da página.
        </Toggle>
        <Toggle checked={(cfg.has_rain ?? 1) === 1} onChange={(v) => set({ has_rain: v ? 1 : 0 })} title="Tem pluviômetro">
          Desligue se não há tanque basculante instalado: chuva some da página.
        </Toggle>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PINS.map((p) => {
          const v = pinValue(cfg, p.key)
          const taken = new Set(PINS.filter((o) => o.key !== p.key).map((o) => pinValue(cfg, o.key)))
          const limit = PIN_MAX[p.key] ?? 99
          return (
            <label key={p.key} className="grid gap-1 font-medium">{p.label}
              <select className={input} value={v} onChange={(e) => set({ [p.key]: Number(e.target.value) } as Partial<StationConfig>)}>
                {USABLE_PINS.filter((n) => n <= limit || n === v).map((n) => (
                  <option key={n} value={n} disabled={taken.has(n)}>GPIO{n}{n === PIN_DEFAULTS[p.key as PinKey] ? ' (padrão)' : ''}{taken.has(n) ? ' · em uso' : ''}</option>
                ))}
              </select>
              <span className="text-xs font-normal text-ink-3">{p.hint}</span>
            </label>
          )
        })}
      </div>
      <div>
        {err && <p role="alert" className="mb-2 flex items-center gap-1.5 text-bad"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {err}</p>}
        <button type="button" onClick={() => set({ ...PIN_DEFAULTS })} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-card-hover">Voltar aos pinos padrão</button>
        <p className="mt-2 text-xs text-ink-3">Mudar um pino reinicia a placa, e a fiação precisa estar igual ao que está aqui. Ficam de fora os pinos de boot (8 e 9), da USB (18 e 19) e da memória flash (11 a 17).</p>
      </div>
    </div>
  )
}
