#!/usr/bin/env python3
"""Gera as imagens de fábrica (bootloader + partições + app juntos) que o site grava pelo navegador.

Uso (na pasta firmware):
    python tools/make_factory.py --server https://seu-site.workers.dev [--version 0.2.0]

Compila os dois ambientes com o endereço do site embutido e escreve em ../web/public/firmware/:
    estacao-c3-campo.bin   ambiente esp32c3-lowpower (para instalar em campo)
    estacao-c3-usb.bin     ambiente esp32c3 (USB serial ligada: o site reconhece a placa e a configura pela USB)
    manifest.json          o que o site lista na tela de gravação
Depois rode "npm run build" e publique o site. As imagens ficam fora do git (.gitignore).
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE.parent / "web" / "public" / "firmware"
ENVS = [
    ("esp32c3-lowpower", "estacao-c3-campo.bin", "Campo (baixo consumo)", "Sem USB serial: configura pelo portal do celular e pelo código de pareamento."),
    ("esp32c3", "estacao-c3-usb.bin", "USB (desenvolvimento)", "Com USB serial: o site reconhece a placa e a configura pelo cabo. Consome mais em campo."),
]
# endereços da flash do ESP32-C3 com o esquema de partições padrão do Arduino
BOOT, PART, APP0, APP = 0x0, 0x8000, 0xE000, 0x10000


def find_boot_app0() -> Path:
    base = Path.home() / ".platformio" / "packages"
    for p in base.glob("framework-arduinoespressif32*/tools/partitions/boot_app0.bin"):
        return p
    sys.exit("boot_app0.bin não encontrado: compile uma vez com 'pio run' para baixar o framework.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="", help="endereço do site embutido no firmware (https://...)")
    ap.add_argument("--version", default="", help="FW_VERSION (padrão: o de config.h)")
    a = ap.parse_args()
    if a.server and not a.server.startswith(("https://", "http://")):
        sys.exit("--server precisa começar com https:// (ou http://)")

    flags = []
    if a.server:
        flags.append(f'-DDEFAULT_SERVER_URL=\\"{a.server.rstrip("/")}\\"')
    if a.version:
        flags.append(f'-DFW_VERSION=\\"{a.version}\\"')
    env = dict(os.environ, PLATFORMIO_BUILD_FLAGS=" ".join(flags))

    boot_app0 = find_boot_app0().read_bytes()
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, out, title, note in ENVS:
        print(f"== compilando {name}")
        subprocess.run(["pio", "run", "-e", name], cwd=HERE, env=env, check=True)
        b = HERE / ".pio" / "build" / name
        parts = [(BOOT, (b / "bootloader.bin").read_bytes()), (PART, (b / "partitions.bin").read_bytes()), (APP0, boot_app0), (APP, (b / "firmware.bin").read_bytes())]
        img = bytearray(b"\xff" * (parts[-1][0] + len(parts[-1][1])))
        for off, data in parts:
            img[off:off + len(data)] = data
        (OUT / out).write_bytes(img)
        manifest.append({"file": out, "title": title, "note": note, "size": len(img), "server": a.server or None, "env": name})
        print(f"   {out}: {len(img) / 1024:.0f} KB")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"pronto em {OUT}")


if __name__ == "__main__":
    main()
