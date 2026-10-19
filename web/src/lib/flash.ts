import { ESPLoader, Transport } from 'esptool-js'
import { closeActiveLink, setFlashing, type Port } from './usb'

export interface FlashImage { name: string; data: Uint8Array; address: number }
export interface FlashEvents { onProgress: (pct: number) => void; onLog: (line: string) => void }

type TransportPort = ConstructorParameters<typeof Transport>[0]

/** Endereços da flash do ESP32-C3. Imagem completa (bootloader, partições e app) começa em 0; só o app, em 0x10000. */
export const ADDRESS_FULL = 0x0
export const ADDRESS_APP = 0x10000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Reinicia a placa para ela rodar o firmware novo. O reinício do esptool-js só solta o RTS (supõe que ele já estava
 * apertado), o que não reinicia a USB nativa do ESP32-C3: a placa ficava parada no modo de gravação. Aqui o pulso é completo.
 * DTR baixo = GPIO9 alto = boot normal.
 */
async function runFirmware(t: Transport) {
  await t.setDTR(false)
  await t.setRTS(true)
  await sleep(150)
  await t.setRTS(false)
  await sleep(100)
}

/**
 * Por que a gravação falhou, em palavras de quem está mexendo na placa. `waitForBoard` diz que vale esperar a placa
 * reaparecer (RESET, replugar) e tentar de novo sozinho.
 */
export function explainFlashError(e: unknown): { text: string; waitForBoard: boolean } {
  const name = e instanceof DOMException ? e.name : ''
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (name === 'InvalidStateError') return { text: 'A porta já está aberta em outra aba deste site. Feche as outras abas e tente de novo.', waitForBoard: false }
  if (name === 'NetworkError' || /failed to open|open serial/i.test(msg)) {
    return {
      text: 'Não consegui abrir a porta da placa. Ou outro programa está com ela (monitor serial do PlatformIO, Arduino IDE, outra aba do site), ou a placa está dormindo. Feche o que estiver usando a porta e aperte RESET na placa: a gravação recomeça sozinha.',
      waitForBoard: true,
    }
  }
  if (/connect|sync|no serial data|timeout|timed out|packet content|invalid head/i.test(msg)) {
    return {
      text: 'A placa não entrou em modo de gravação. Aperte RESET nela (a gravação recomeça sozinha). Se continuar, segure BOOT, aperte RESET, solte o RESET e depois o BOOT.',
      waitForBoard: true,
    }
  }
  return { text: msg || 'A gravação falhou.', waitForBoard: false }
}

/**
 * Grava uma imagem na placa pelo navegador (esptool-js). A placa precisa de um cabo de dados; a USB nativa do
 * ESP32-C3 entra em modo de gravação sozinha. Pontes CH340/CP210x podem pedir para segurar BOOT e apertar RESET.
 */
export async function flash(port: Port, image: FlashImage, opts: { eraseAll: boolean; keepLocked?: boolean } & FlashEvents): Promise<string> {
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
    await runFirmware(transport)
    return chip
  } finally {
    try { await transport.disconnect() } catch { /* já desconectou ao reiniciar */ }
    // dá tempo da USB reaparecer antes de o aviso de placa voltar a procurar o firmware
    // (quem configura a placa em seguida, como o FlashSetup, mantém a porta reservada e libera ao terminar: keepLocked)
    if (!opts.keepLocked) setTimeout(() => setFlashing(false), 2500)
  }
}
