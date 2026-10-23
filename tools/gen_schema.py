"""Gera os arquivos de configuração do site, da API e do firmware a partir de shared/board-schema.json.

    python tools/gen_schema.py          escreve os arquivos
    python tools/gen_schema.py --check  só confere (o CI usa isto); sai com erro se estiverem desatualizados
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
S = json.loads((ROOT / "shared" / "board-schema.json").read_text(encoding="utf-8"))
F = S["fields"]
HEAD = "GERADO por tools/gen_schema.py a partir de shared/board-schema.json. Não edite à mão."


def num(v):
    return repr(v) if isinstance(v, float) else str(v)


def ts():
    L = [f"// {HEAD}", ""]
    L.append("export const LIMITS: Record<string, [number, number]> = {")
    L += [f"  {f['key']}: [{num(f['min'])}, {num(f['max'])}]," for f in F]
    L.append("}")
    L.append(f"export const INTEGER_FIELDS = {json.dumps([f['key'] for f in F if f.get('int')])}")
    L.append("export const SCHEMA_DEFAULTS = {")
    L += [f"  {f['key']}: {num(f['def'])}," for f in F]
    L.append("}")
    L.append(f"export const USABLE_PINS = {json.dumps(S['pins']['usable'])}")
    L.append("/** Maior GPIO aceito por função: a chuva precisa acordar do deep sleep, a bateria ser ADC1. */")
    L.append("export const PIN_MAX: Record<string, number> = {")
    L += [f"  {f['key']}: {f['pinMax']}," for f in F if f.get("pinMax") is not None]
    L.append("}")
    L.append(f"export const BATTERY_CHEMS = {json.dumps(S['battery_chems'])}")
    return "\n".join(L).replace('"', "'") + "\n"


def cpp():
    L = ["#pragma once", f"// {HEAD}", ""]
    for f in F:
        if f.get("fw"):
            L.append(f"constexpr auto SCH_DEF_{f['key']} = {float(f['def'])!r}{'f' if not f.get('int') else ''};" if not f.get("int") else f"constexpr auto SCH_DEF_{f['key']} = {f['def']};")
    L.append("")
    L.append("/** Campos numéricos comuns (os pinos têm regras próprias): X(chave_json, membro_de_Settings, mínimo, máximo) */")
    L.append("#define SCHEMA_FIELDS(X) \\")
    plain = [f for f in F if f.get("fw") and not f.get("pin")]
    L.append(" \\\n".join(f"  X(\"{f['key']}\", {f['fw']}, {float(f['min'])!r}f, {float(f['max'])!r}f)" for f in plain))
    L.append("")
    u = S["pins"]["usable"]
    L.append(f"constexpr uint8_t SCH_USABLE_PINS[] = {{{', '.join(map(str, u))}}};")
    for f in F:
        if f.get("pinMax") is not None:
            L.append(f"constexpr int SCH_{f['key'].upper()}_MAX = {f['pinMax']};")
    return "\n".join(L) + "\n"


OUT = {
    ROOT / "web" / "src" / "lib" / "schema.ts": ts(),
    ROOT / "worker" / "src" / "schema.ts": ts(),
    ROOT / "firmware" / "src" / "schema_gen.h": cpp(),
}

if "--check" in sys.argv:
    bad = [str(p.relative_to(ROOT)) for p, t in OUT.items() if not p.exists() or p.read_text(encoding="utf-8") != t]
    if bad:
        sys.exit("desatualizados (rode python tools/gen_schema.py): " + ", ".join(bad))
    print("schema em dia")
else:
    for p, t in OUT.items():
        p.write_text(t, encoding="utf-8", newline="\n")
        print("escrito", p.relative_to(ROOT))
