/** A imagem de firmware que este site oferece para gravar (gerada por firmware/tools/make_factory.py). */
/** full: imagem completa em 0x0 (apaga os dados guardados na placa). app: só o aplicativo em 0x10000 (preserva). Manifestos antigos não têm kind: valem como full. */
export interface FirmwareImage { file: string; kind?: 'full' | 'app'; address?: number; env: string; title?: string; note?: string; size: number; server: string | null; fw?: string; built?: number }

let cache: FirmwareImage[] | null = null
export async function loadManifest(): Promise<FirmwareImage[]> {
  if (cache) return cache
  try {
    const r = await fetch('/firmware/manifest.json')
    const m = r.ok ? ((await r.json()) as FirmwareImage[]) : []
    cache = Array.isArray(m) ? m : []
  } catch { cache = [] }
  return cache
}

export async function fetchImage(img: Pick<FirmwareImage, 'file'>): Promise<Uint8Array> {
  const r = await fetch(`/firmware/${img.file}`)
  if (!r.ok) throw new Error('Não foi possível baixar a imagem do firmware.')
  return new Uint8Array(await r.arrayBuffer())
}

export const imageOf = (m: FirmwareImage[], kind: 'full' | 'app') => m.find((i) => (i.kind ?? 'full') === kind) ?? null
