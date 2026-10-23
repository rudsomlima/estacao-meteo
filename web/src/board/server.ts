export const isLocal = (u: string) => /\/\/(localhost|127\.|\[::1\])/.test(u)

/** O IP deste computador na rede local, que só o servidor de desenvolvimento (npm run dev) sabe dizer. */
let lanCache: Promise<string> | null = null
export function lanServer(): Promise<string> {
  lanCache ??= fetch('/__lan')
    .then((r) => (r.ok ? (r.json() as Promise<{ ips: string[] }>) : { ips: [] }))
    .then((j) => (j.ips[0] ? `http://${j.ips[0]}:8787` : ''))
    .catch(() => '')
  return lanCache
}

/**
 * O endereço do site que a placa vai usar. Publicado: o do próprio site. Em desenvolvimento "localhost" não serve (a placa
 * não o alcança): usa o IP do computador, ou um endereço que a placa ou a imagem já tragam e que não seja local.
 */
export async function resolveServer(embedded: (string | null | undefined)[] = []): Promise<string> {
  if (!isLocal(location.origin)) return location.origin
  const lan = await lanServer()
  return lan || embedded.find((u): u is string => !!u && !isLocal(u)) || location.origin
}
