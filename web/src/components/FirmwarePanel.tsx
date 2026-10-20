import { go } from '../hooks/useRoute'
import { useIsAdmin } from '../lib/session'
import { store } from '../lib/api'
import type { FirmwareInfo, Station } from '../types'

/** Situação do firmware da estação. Publicar e atribuir versões é no painel do administrador (aba Firmware). */
export default function FirmwarePanel({ station, info }: { station: Station; info: FirmwareInfo | null }) {
  const admin = useIsAdmin()
  const published = info?.published ?? null
  const installed = info?.installed ?? station.fw_version
  const pending = published && installed !== published.version

  return (
    <div className="grid gap-4">
      <dl className="num grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-ink-3">Instalada na estação</dt><dd>{installed ?? 'desconhecida'}</dd></div>
        <div>
          <dt className="text-xs text-ink-3">Atribuída</dt>
          <dd className={pending ? 'text-warn' : ''}>{published ? `${published.version} · ${(published.size / 1024).toFixed(0)} KB` : 'nenhuma'}{pending ? ' · aguardando a estação' : published ? ' · em dia' : ''}</dd>
        </div>
      </dl>
      <p className="text-sm text-ink-3">
        A estação atualiza pelo ar quando a versão atribuída é <b className="text-ink-2">diferente</b> da instalada, confere o SHA-256 antes de ativar, adia com a bateria perto do crítico e desiste após 3 falhas.
        {admin
          ? <> Para publicar ou atribuir uma versão, use <button type="button" className="underline hover:text-ink" onClick={() => { store.set('meteo.admin.tab', 'firmware'); go('admin') }}>Administração → Firmware</button>.</>
          : ' Só administradores publicam firmware.'}
      </p>
    </div>
  )
}
