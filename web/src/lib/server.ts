const isLocal = (u: string) => /\/\/(localhost|127\.|\[::1\])/.test(u)

let lan = ''
/** O IP deste computador na rede local, que só o servidor de desenvolvimento (npm run dev) sabe dizer. */
export async function loadLan() {
  try {
    const r = await fetch('/__lan')
    const j = r.ok ? ((await r.json()) as { ips: string[] }) : { ips: [] }
    lan = j.ips[0] ? `http://${j.ips[0]}:8787` : ''
  } catch { lan = '' }
}

/** O endereço do site que a placa vai usar: o do próprio site; em desenvolvimento (localhost) o IP do computador, que a placa alcança. */
export const deviceServer = () => (isLocal(location.origin) ? lan || location.origin : location.origin)
void loadLan()
