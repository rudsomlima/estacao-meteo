#!/usr/bin/env python3
"""Gera a imagem de fábrica (bootloader + partições + app juntos) que o site grava pelo navegador.

Uso (na pasta firmware):
    python tools/make_factory.py --server https://seu-site.workers.dev   # site publicado
    python tools/make_factory.py --lan                                    # teste local: http://IP-DO-COMPUTADOR:8787
    python tools/make_factory.py                                          # sem endereço embutido (a USB configura)

Compila o firmware (um só serve para a bancada e para o campo) e escreve em ../web/public/firmware/:
    estacao-c3.bin       imagem completa, para gravar a partir do endereço 0x0 (placa nova ou recuperação). Os vazios da flash saem
                         em 0xFF, o que APAGA Wi-Fi, chave e configuração guardados na placa.
    estacao-c3-app.bin   só o aplicativo, para gravar a partir de 0x10000: atualiza o firmware e preserva os dados guardados.
    manifest.json        o que o site lista na tela de gravação
Depois rode "npm run build" e publique o site (em desenvolvimento o "npm run dev" já serve a pasta). A imagem fica fora do git.
"""
import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE.parent / "web" / "public" / "firmware"
ENV = "esp32c3"
IMAGE = "estacao-c3.bin"
IMAGE_APP = "estacao-c3-app.bin"
# endereços da flash do ESP32-C3 com o esquema de partições padrão do Arduino
BOOT, PART, APP0, APP = 0x0, 0x8000, 0xE000, 0x10000


def find_boot_app0() -> Path:
    base = Path.home() / ".platformio" / "packages"
    for p in base.glob("framework-arduinoespressif32*/tools/partitions/boot_app0.bin"):
        return p
    sys.exit("boot_app0.bin não encontrado: compile uma vez com 'pio run' para baixar o framework.")


def lan_ip() -> str:
    """O IP deste computador na rede local (o que a placa alcança). Não envia nada: só pergunta ao sistema qual rota usaria."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        sys.exit("Não consegui descobrir o IP do computador na rede. Use --server http://IP:8787")
    finally:
        s.close()


def fw_version(override: str) -> str:
    if override:
        return override
    m = re.search(r'#define\s+FW_VERSION\s+"([^"]+)"', (HERE / "src" / "config.h").read_text(encoding="utf-8"))
    return m.group(1) if m else ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="", help="endereço do site embutido no firmware (https://...)")
    ap.add_argument("--lan", action="store_true", help="embute http://IP-DESTE-COMPUTADOR:8787 (teste local com 'npm run dev:lan')")
    ap.add_argument("--version", default="", help="FW_VERSION (padrão: o de config.h)")
    a = ap.parse_args()
    server = a.server.rstrip("/")
    if a.lan:
        server = f"http://{lan_ip()}:8787"
    if server and not server.startswith(("https://", "http://")):
        sys.exit("--server precisa começar com https:// (ou http://)")

    flags = []
    if server:
        flags.append(f'-DDEFAULT_SERVER_URL=\\"{server}\\"')
    if a.version:
        flags.append(f'-DFW_VERSION=\\"{a.version}\\"')
    env = dict(os.environ, PLATFORMIO_BUILD_FLAGS=" ".join(flags))

    boot_app0 = find_boot_app0().read_bytes()
    print(f"== compilando {ENV}" + (f" com o site {server}" if server else ""))
    # os objetos antigos não sabem do endereço novo: força recompilar o que depende dele
    for stale in (HERE / ".pio" / "build" / ENV).glob("src/*.o"):
        stale.unlink()
    subprocess.run(["pio", "run", "-e", ENV], cwd=HERE, env=env, check=True)

    b = HERE / ".pio" / "build" / ENV
    parts = [(BOOT, (b / "bootloader.bin").read_bytes()), (PART, (b / "partitions.bin").read_bytes()), (APP0, boot_app0), (APP, (b / "firmware.bin").read_bytes())]
    img = bytearray(b"\xff" * (parts[-1][0] + len(parts[-1][1])))
    for off, data in parts:
        img[off:off + len(data)] = data

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.bin"):  # imagens de versões anteriores deste script
        old.unlink()
    (OUT / IMAGE).write_bytes(img)
    app = parts[-1][1]
    (OUT / IMAGE_APP).write_bytes(app)
    common = {"server": server or None, "env": ENV, "fw": fw_version(a.version), "built": int(time.time())}
    manifest = [
        {
            "file": IMAGE, "kind": "full", "address": BOOT,
            "title": "Estação Meteo (imagem completa)",
            "note": "Placa nova ou recuperação: grava bootloader, partições e aplicativo a partir de 0x0. Apaga Wi-Fi, chave e configuração guardados na placa.",
            "size": len(img), **common,
        },
        {
            "file": IMAGE_APP, "kind": "app", "address": APP,
            "title": "Estação Meteo (só o aplicativo)",
            "note": "Atualiza o firmware a partir de 0x10000 e preserva Wi-Fi, chave e configuração guardados na placa.",
            "size": len(app), **common,
        },
    ]
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"   {IMAGE}: {len(img) / 1024:.0f} KB, firmware {manifest[0]['fw']}")
    print(f"   {IMAGE_APP}: {len(app) / 1024:.0f} KB")
    print(f"pronto em {OUT}")


if __name__ == "__main__":
    main()
