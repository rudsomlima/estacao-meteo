"""Verificações rápidas numa placa de verdade (não altera nada em definitivo). Uso:

    python firmware/tools/hwtest/checks.py            # usa a porta achada sozinha (ou METEO_PORT)
    METEO_PORT=COM8 python firmware/tools/hwtest/checks.py

Cobre o que dá para testar sem bateria, vento, chuva nem rede: identificação, a configuração guardada, a validação dos
pinos no firmware, os limites dos campos e a configuração aplicada pelo cabo. Para os testes longos (intervalos, bateria
simulada, HTTPS, portal), veja o README.
"""
import sys
import time

from station import Board, check, say, summary

b = Board()
h = b.hello(90)
if not check("a placa responde ao hello pela USB", h is not None):
    sys.exit(1)
say("firmware", h["fw"], "| estação", h["id"], "| servidor", h["server"])

d = b.diag()
check("diag devolve a configuração e o estado do ciclo", d is not None and "cfg" in d and "state" in d)
cfg0 = d["cfg"]
ver = cfg0["version"]

# --- configuração aplicada pelo cabo, e lida de volta no diag
r = b.config({"dir_offset": 37, "k_wind": 0.63, "version": ver})
check("a placa aceita a configuração pelo cabo", r is not None and r.get("ok"), str(r))
d = b.diag()
check("os valores aplicados aparecem no diag", abs(d["cfg"]["dir_offset"] - 37) < 1e-3 and abs(d["cfg"]["k_wind"] - 0.63) < 1e-3,
      str({k: d["cfg"][k] for k in ("dir_offset", "k_wind")}))

# --- validação dos pinos no firmware: um conjunto inválido é ignorado, sem reiniciar
for name, bad in [("chuva fora de 0-5", {"pin_rain": 7}), ("pino repetido", {"pin_sda": cfg0["pin_wind"]}), ("GPIO de boot", {"pin_scl": 9})]:
    r = b.config({**bad, "version": b.diag()["cfg"]["version"]})
    c = b.diag()["cfg"]
    ok = r and r.get("ok") and r.get("restarting") is False and c["pin_sda"] == cfg0["pin_sda"] and c["pin_scl"] == cfg0["pin_scl"] and c["pin_rain"] == cfg0["pin_rain"]
    check(f"recusa pinos invalidos ({name}) sem reiniciar", ok, str(r))

# --- limites: valores fora da faixa são presos ao máximo/mínimo
r = b.config({"send_every": 99, "bench_min": 99, "env_sensor": 9, "version": b.diag()["cfg"]["version"]})
c = b.diag()["cfg"]
check("limites presos pelo firmware (send_every->12, bench_min->30, env_sensor->3)", c["send_every"] == 12 and c["bench_min"] == 30 and c["env_sensor"] == 3,
      str({k: c[k] for k in ("send_every", "bench_min", "env_sensor")}))

# --- restaura os valores originais
b.config({k: cfg0[k] for k in ("dir_offset", "k_wind", "send_every", "bench_min", "env_sensor", "pin_sda", "pin_scl", "pin_rain")} | {"version": b.diag()["cfg"]["version"]})
say("configuração restaurada")

b.close()
sys.exit(0 if summary() else 1)
