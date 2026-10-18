import { ESPLoader, Transport } from 'esptool-js'
import { closeActiveLink, setFlashing, type Port } from './usb'

export interface FlashImage { name: string; data: Uint8Array; address: number }
export interface FlashEvents { onProgress: (pct: number) => void; onLog: (line: string) => void }

type TransportPort = ConstructorParameters<typeof Transport>[0]

/** Endereços da flash do ESP32-C3. Imagem completa (bootloader, partições e app) começa em 0; só o app, em 0x10000. */
export const ADDRESS_FULL = 0x0
export const ADDRESS_APP = 0x10000

/**
 * Grava uma imagem na placa pelo navegador (esptool-js). A placa precisa de um cabo de dados; a USB nativa do
 * ESP32-C3 entra em modo de gravação sozinha. Pontes CH340/CP210x podem pedir para segurar BOOT e apertar RESET.
 */
export async function flash(port: Port, image: FlashImage, opts: { eraseAll: boolean } & FlashEvents): Promise<string> {
  await closeActiveLink() // o aviso de placa USB pode estar com a porta aberta
  setFlashing(true)
  const transport = new Transport(port as unknown as TransportPort, false)
  try {
    const loader = new ESPLoader({
      transport,
      baudrate: 460800,
      romBaudrate: 115200,
      terminal: {
        clean: () => undefined,
        writeLine: (l) => opts.onLog(l),
        write: (l) => opts.onLog(l),
      },
    })
    const chip = await loader.main()
    opts.onLog(`Chip: ${chip}`)
    if (!/ESP32-C3/i.test(chip)) throw new Error(`Esta imagem é para ESP32-C3, mas a placa é ${chip}.`)
    await loader.writeFlash({
      fileArray: [{ data: image.data, address: image.address }],
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: opts.eraseAll,
      compress: true,
      reportProgress: (_i, written, total) => opts.onProgress(total ? Math.round((written / total) * 100) : 0),
    })
    await loader.after('hard_reset')
    return chip
  } finally {
    try { await transport.disconnect() } catch { /* já desconectou ao reiniciar */ }
    // dá tempo da USB reaparecer antes de o aviso de placa voltar a procurar o firmware
    setTimeout(() => setFlashing(false), 2500)
  }
}
