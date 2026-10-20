"""Conversa com a placa pela porta USB (mesmo protocolo JSON do site) e, opcionalmente, com um servidor da API.

Serve para testar o firmware numa placa de verdade. Precisa de `pyserial` (vem no ambiente do PlatformIO).

    from station import Board, Api, check, summary
    b = Board("COM8")          # ou /dev/ttyACM0; sem argumento, usa a env METEO_PORT
    print(b.hello())           # identificação: fw, id, servidor, Wi-Fi salvo
    print(b.diag())            # toda a configuração guardada + estado do ciclo

Comandos que o firmware entende (uma linha JSON por comando, resposta em uma linha):
    hello                      identificação
    scan                       redes Wi-Fi por perto
    provision {ssid,pass,server,id,key}   grava rede e chave e reinicia
    config {config:{...}}      aplica a configuração na hora (a mesma que o servidor entregaria)
    diag                       configuração completa + estado (bateria, lote, falhas, intervalo)
    simvbat {v}                simula a tensão da bateria (v<0 desliga) — só para testes
    nettest {url}              conecta ao Wi-Fi e faz um GET validando o HTTPS, sem enviar dados
    body {columns}             mostra o corpo que o próximo envio levaria, sem enviar
    portal                     abre o portal Wi-Fi (3 min)
    restart                    reinicia
"""
import http.cookiejar
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    sys.exit("pyserial não encontrado. Use o Python do PlatformIO ou `pip install pyserial`.")

T0 = time.time()
_results = []


def now():
    return time.time() - T0


def say(*a):
    print(f"[{now():7.1f}s]", *a, flush=True)


def check(name, ok, extra=""):
    _results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"   ({extra})" if extra and not ok else ""), flush=True)
    return ok


def summary():
    ok = sum(1 for _, o in _results if o)
    print(f"\n==== {ok}/{len(_results)} verificações passaram ====")
    for n, o in _results:
        if not o:
            print("  FALHOU:", n)
    return ok == len(_results)


def default_port():
    if os.environ.get("METEO_PORT"):
        return os.environ["METEO_PORT"]
    esp = [p for p in list_ports.comports() if p.vid in (0x303A, 0x10C4, 0x1A86, 0x0403)]
    esp.sort(key=lambda p: 0 if p.vid == 0x303A else 1)  # USB nativa do ESP32-C3 primeiro
    if not esp:
        sys.exit("nenhuma placa ESP32 na USB. Plugue o cabo (de dados) ou defina METEO_PORT.")
    return esp[0].device


class Board:
    def __init__(self, port=None):
        self.port = port or default_port()
        self.s = serial.Serial()
        self.s.port = self.port
        self.s.baudrate = 115200
        self.s.timeout = 0.1
        self.s.dtr = False
        self.s.rts = False
        self.s.open()
        self.lines = []  # (t, texto) do log da placa
        self.json = []   # (t, objeto) das respostas JSON
        self.json_mark = []  # quantas linhas de log havia quando cada JSON chegou
        self.ack_mark = 0
        self._lock = threading.Lock()
        self._alive = True
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        buf = b""
        while self._alive:
            try:
                d = self.s.read(512)
            except Exception:
                time.sleep(0.2)
                continue
            if not d:
                continue
            buf += d
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                t = line.decode("utf-8", "replace").strip()
                if not t:
                    continue
                with self._lock:
                    if t.startswith("{"):
                        try:
                            self.json.append((time.time(), json.loads(t)))
                            self.json_mark.append(len(self.lines))
                            continue
                        except ValueError:
                            pass
                    self.lines.append((time.time(), t))

    # --- comandos
    def send(self, obj):
        data = (json.dumps(obj, separators=(",", ":")) + "\n").encode()
        for i in range(0, len(data), 48):  # em pedaços, como o site (a linha da configuração tem ~600 bytes)
            self.s.write(data[i:i + 48])
            self.s.flush()
            time.sleep(0.004)

    def ask(self, obj, accept, wait=6.0):
        mark = len(self.json)
        self.send(obj)
        end = time.time() + wait
        while time.time() < end:
            with self._lock:
                for i in range(mark, len(self.json)):
                    if accept(self.json[i][1]):
                        self.ack_mark = self.json_mark[i]
                        return self.json[i][1]
            time.sleep(0.05)
        return None

    def hello(self, total=90):
        end = time.time() + total
        while time.time() < end:
            r = self.ask({"cmd": "hello"}, lambda o: o.get("app") == "estacao-meteo", 1.2)
            if r:
                return r
        return None

    def diag(self):
        for _ in range(30):
            r = self.ask({"cmd": "diag"}, lambda o: "cfg" in o and "state" in o, 2.0)
            if r:
                return r
        return None

    def config(self, cfg, wait=14.0):
        """Aplica a configuração pelo cabo. Preencha cfg['version'] com a versão que a placa já tem (b.diag()['cfg']['version'])."""
        for _ in range(4):  # a placa só escuta a USB entre as medições; se estiver medindo, tenta de novo
            r = self.ask({"cmd": "config", "config": cfg}, lambda o: "version" in o or "error" in o, wait)
            if r is not None:
                return r
        return None

    # --- log
    def mark(self):
        with self._lock:
            return len(self.lines)

    def since(self, mark):
        with self._lock:
            return list(self.lines[mark:])

    def wait_line(self, pattern, mark, timeout):
        rx = re.compile(pattern)
        end = time.time() + timeout
        while time.time() < end:
            for t, line in self.since(mark):
                if rx.search(line):
                    return t, line
            time.sleep(0.1)
        return None

    def reopen(self):
        """Depois de um reinício a porta USB some e volta. Solta antes, espera a placa sumir e voltar, e só então abre."""
        try:
            self.s.close()
        except Exception:
            pass
        present = lambda: any(p.device == self.port for p in list_ports.comports())
        t0 = time.time()
        gone = False
        while time.time() - t0 < 6 and not gone:
            gone = not present()
            time.sleep(0.2)
        t1 = time.time()
        while time.time() - t1 < 30 and not present():
            time.sleep(0.3)
        time.sleep(2.5)
        for _ in range(40):
            try:
                self.s.open()
                return True
            except Exception:
                time.sleep(0.5)
        return False

    def close(self):
        self._alive = False
        time.sleep(0.3)
        try:
            self.s.close()
        except Exception:
            pass


class Api:
    """Cliente simples da API, para conferir no servidor o que a placa enviou. Em dev, faz login sem senha."""
    def __init__(self, base=None):
        self.base = base or os.environ.get("METEO_API", "http://127.0.0.1:8787")
        self._op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={"content-type": "application/json"})
        try:
            with self._op.open(req, timeout=15) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read() or b"null")
            except Exception:
                return e.code, None

    def login_dev(self):
        self.call("POST", "/api/auth/dev", {"role": "admin"})

    def station(self, sid):
        s, j = self.call("GET", f"/api/stations/{sid}")
        return j if s == 200 else {}
