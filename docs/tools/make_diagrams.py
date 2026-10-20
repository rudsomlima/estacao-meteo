#!/usr/bin/env python3
"""Gera os diagramas SVG de docs/img. Uso: python docs/tools/make_diagrams.py

Os SVGs têm fundo branco próprio para ficarem legíveis nos temas claro e escuro do GitHub.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "img"
OUT.mkdir(exist_ok=True)

C = dict(
    v33="#d62828", gnd="#1f2933", sda="#1d4ed8", scl="#15803d", wind="#ea580c", rain="#7c3aed", vbat="#ca8a04",
    ink="#0f172a", mute="#64748b", box="#f1f5f9", edge="#94a3b8", esp="#e0f2fe", mod="#f8fafc",
)
FONT = "font-family=\"'Helvetica Neue', Arial, sans-serif\""
MONO = "font-family=\"ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace\""


class Svg:
    def __init__(self, w, h, title):
        self.w, self.h = w, h
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}">',
            f"<title>{title}</title>",
            f'<rect width="{w}" height="{h}" fill="#ffffff"/>',
        ]

    def add(self, s):
        self.parts.append(s)

    def rect(self, x, y, w, h, fill="none", stroke=None, r=6, sw=1.6, extra=""):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{st} {extra}/>')

    def text(self, x, y, s, size=13, fill=None, anchor="start", weight="400", mono=False, extra=""):
        fill = fill or C["ink"]
        fam = MONO if mono else FONT
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}" {fam} {extra}>{s}</text>')

    def line(self, pts, color, sw=2.4, dash=None, dots=()):
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"{da}/>')
        for x, y in dots:
            self.add(f'<circle cx="{x}" cy="{y}" r="3.6" fill="{color}"/>')

    def hop(self, x, y, color, vertical=True):
        """Pequeno arco de travessia (fio que passa por cima de outro sem se ligar)."""
        if vertical:
            self.add(f'<path d="M{x},{y-7} a7,7 0 0 1 0,14" fill="none" stroke="{color}" stroke-width="2.4"/>')
            self.add(f'<rect x="{x-1.5}" y="{y-6}" width="3" height="12" fill="#fff" opacity="0"/>')

    def resistor(self, x, y, label, vertical=True, color=None):
        color = color or C["ink"]
        if vertical:
            self.add(f'<rect x="{x-6}" y="{y-14}" width="12" height="28" fill="#fff" stroke="{color}" stroke-width="1.8"/>')
            self.text(x + 12, y + 4, label, 11, color, mono=True)
        else:
            self.add(f'<rect x="{x-14}" y="{y-6}" width="28" height="12" fill="#fff" stroke="{color}" stroke-width="1.8"/>')
            self.text(x, y - 11, label, 11, color, "middle", mono=True)

    def save(self, name):
        (OUT / name).write_text("\n".join(self.parts) + "\n</svg>\n", encoding="utf-8")
        print("ok", name)


def module(s, x, y, w, h, title, sub=None, fill=None):
    s.rect(x, y, w, h, fill or C["mod"], C["edge"], 8)
    s.text(x + w / 2, y + 24, title, 14, anchor="middle", weight="700")
    if sub:
        s.text(x + w / 2, y + 42, sub, 11, C["mute"], "middle")


def gnd(s, x, y):
    """Símbolo de terra: todos os GND do circuito são o mesmo nó."""
    c = C["gnd"]
    s.line([(x, y), (x, y + 12)], c, 2.4)
    for i, w in enumerate((16, 10, 5)):
        s.line([(x - w, y + 12 + i * 5), (x + w, y + 12 + i * 5)], c, 2.4)


def pin(s, x, y, name, side, color=C["ink"]):
    """Rótulo de pino. side: 'l' texto à direita do ponto, 'r' texto à esquerda."""
    s.add(f'<circle cx="{x}" cy="{y}" r="3.2" fill="{color}"/>')
    if side == "l":
        s.text(x + 8, y + 4, name, 11, color, mono=True)
    elif side == "r":
        s.text(x - 8, y + 4, name, 11, color, "end", mono=True)
    elif side == "t":
        s.text(x, y - 9, name, 11, color, "middle", mono=True)
    else:
        s.text(x, y + 19, name, 11, color, "middle", mono=True)


# ===================================================================== ligações
def wiring():
    s = Svg(1200, 860, "Diagrama de ligação da estação")
    s.text(40, 40, "Ligação da estação", 24, weight="700")
    s.text(40, 62, "ESP32-C3 SuperMini, BME280, GY-273 (QMC5883L), dois sensores Hall, bateria com divisor e carregador solar.", 13, C["mute"])

    # barras de alimentação
    s.line([(60, 100), (1140, 100)], C["v33"], 6)
    s.text(60, 90, "3V3", 13, C["v33"], weight="700", mono=True)
    s.text(60, 830, "Todos os símbolos de terra (GND) são o mesmo nó. Para 3V3, a barra vermelha do topo é o mesmo nó.", 11, C["mute"])

    # ---- ESP32-C3
    ex, ey, ew, eh = 500, 150, 200, 380
    s.rect(ex, ey, ew, eh, C["esp"], "#0284c7", 10, 2.2)
    s.text(ex + ew / 2, ey + 70, "ESP32-C3", 16, anchor="middle", weight="700")
    s.text(ex + ew / 2, ey + 88, "SuperMini", 12, C["mute"], "middle")
    s.text(ex + ew / 2, ey + eh - 40, "botão BOOT (GPIO9)", 11, C["mute"], "middle", mono=True)
    s.text(ex + ew / 2, ey + eh - 24, "segurar ao ligar abre o portal Wi-Fi", 11, C["mute"], "middle")
    # 3V3 / GND
    s.line([(560, ey), (560, 100)], C["v33"], 2.6, dots=[(560, 100)])
    pin(s, 560, ey, "3V3", "b", C["v33"])
    gnd(s, 560, ey + eh)
    pin(s, 560, ey + eh, "GND", "t", C["gnd"])

    # ---- módulos I2C (linha de cima)
    module(s, 70, 150, 190, 90, "BME280", "temp · umidade · pressão")
    module(s, 300, 150, 190, 90, "GY-273", "QMC5883L · direção")
    # VCC
    for bx in (100, 330):
        s.line([(bx, 150), (bx, 100)], C["v33"], 2.6, dots=[(bx, 100)])
        pin(s, bx, 150, "VCC", "b", C["v33"])
    # GND
    for bx in (130, 360):
        gnd(s, bx, 240)
        pin(s, bx, 240, "GND", "t", C["gnd"])
    # barramento I2C
    sda_y, scl_y = 310, 345
    s.line([(170, 240), (170, sda_y), (ex, sda_y)], C["sda"], 2.6, dots=[(170, sda_y), (400, sda_y)])
    s.line([(400, 240), (400, sda_y)], C["sda"], 2.6)
    s.line([(210, 240), (210, scl_y), (ex, scl_y)], C["scl"], 2.6, dots=[(210, scl_y), (440, scl_y)])
    s.line([(440, 240), (440, scl_y)], C["scl"], 2.6)
    for bx, name, col in ((170, "SDA", C["sda"]), (400, "SDA", C["sda"]), (210, "SCL", C["scl"]), (440, "SCL", C["scl"])):
        pin(s, bx, 240, name, "t", col)
    # travessias
    s.hop(210, sda_y, C["scl"])
    s.hop(440, sda_y, C["scl"])
    pin(s, ex, sda_y, "GPIO6 · SDA", "l", C["sda"])
    pin(s, ex, scl_y, "GPIO7 · SCL", "l", C["scl"])
    s.text(70, 275, "Endereços I²C: BME280 0x76 (SDO→GND), QMC5883L 0x0D.", 11, C["mute"])
    s.text(70, 292, "Os módulos já trazem pull-up de 10 kΩ nas linhas SDA e SCL.", 11, C["mute"])

    # ---- Hall do anemômetro e do pluviômetro
    def hall(y, title, sub, label, gp, col, node_x):
        module(s, 860, y, 190, 100, title, sub)
        # sinal
        sy_ = y + 62
        s.line([(ex + ew, sy_), (860, sy_)], col, 2.6, dots=[(node_x, sy_)])
        pin(s, ex + ew, sy_, gp, "r", col)
        pin(s, 860, sy_, "OUT", "l", col)
        # pull-up até 3V3
        s.line([(node_x, sy_), (node_x, 100)], col, 2.0, dots=[(node_x, 100)])
        s.add(f'<rect x="{node_x-6}" y="{(sy_+100)//2-14}" width="12" height="28" fill="#fff" stroke="{col}" stroke-width="1.8"/>')
        s.text(node_x + 12, (sy_ + 100) // 2 + 4, label, 11, col, mono=True)
        # alimentação (lado direito)
        s.line([(1050, y + 30), (1090, y + 30)], C["v33"], 2.6, dots=[(1090, y + 30)])
        pin(s, 1050, y + 30, "VCC", "r", C["v33"])
        s.line([(1050, y + 80), (1090, y + 80)], C["gnd"], 2.6)
        gnd(s, 1090, y + 80)
        pin(s, 1050, y + 80, "GND", "r", C["gnd"])

    hall(160, "Hall · anemômetro", "1 pulso por volta", "1 MΩ", "GPIO4", C["wind"], 770)
    hall(330, "Hall · pluviômetro", "1 pulso por basculada", "1 MΩ", "GPIO3", C["rain"], 740)
    # trilho 3V3 e GND dos halls
    s.line([(1090, 100), (1090, 360)], C["v33"], 2.6)
    s.text(860, 455, "Com Hall DRV5032 (baixa corrente) use pull-up de 1 MΩ.", 11, C["mute"])
    s.text(860, 472, "Com A3144 (4,4 mA, só 4,5 V+) use 10 kΩ e o modo janela.", 11, C["mute"])

    # ---- divisor da bateria
    s.rect(780, 500, 360, 170, "#fffbeb", "#d4a72c", 8, 1.4)
    s.text(960, 524, "Medição da bateria", 13, anchor="middle", weight="700")
    bx0, by = 800, 590
    s.text(bx0 - 4, by + 4, "BAT+", 12, C["vbat"], "end", weight="700", mono=True)
    s.line([(bx0, by), (835, by)], C["vbat"], 2.4)
    s.add(f'<rect x="835" y="{by-6}" width="44" height="12" fill="#fff" stroke="{C["vbat"]}" stroke-width="1.8"/>')
    s.text(857, by - 12, "1 MΩ", 11, C["vbat"], "middle", mono=True)
    s.line([(879, by), (940, by)], C["vbat"], 2.4, dots=[(940, by)])
    s.add(f'<rect x="940" y="{by-6}" width="0" height="0"/>')
    s.line([(940, by), (990, by)], C["vbat"], 2.4)
    s.add(f'<rect x="990" y="{by-6}" width="44" height="12" fill="#fff" stroke="{C["vbat"]}" stroke-width="1.8"/>')
    s.text(1012, by - 12, "1 MΩ", 11, C["vbat"], "middle", mono=True)
    s.line([(1034, by), (1070, by)], C["vbat"], 2.4)
    gnd(s, 1070, by)
    # capacitor
    s.line([(940, by), (940, by + 22)], C["vbat"], 2.4)
    s.line([(926, by + 22), (954, by + 22)], C["vbat"], 2.6)
    s.line([(926, by + 30), (954, by + 30)], C["vbat"], 2.6)
    gnd(s, 940, by + 30)
    s.text(962, by + 30, "100 nF", 11, C["vbat"], mono=True)
    # fio ao GPIO0
    s.line([(940, by), (940, 560), (ex + ew + 40, 560)], C["vbat"], 2.0)
    s.line([(ex + ew, 440), (ex + ew + 40, 440), (ex + ew + 40, 560)], C["vbat"], 2.4, dots=[(ex + ew + 40, 560)])
    pin(s, ex + ew, 440, "GPIO0 · ADC", "r", C["vbat"])

    # ---- cadeia de energia
    s.text(60, 565, "Energia", 13, weight="700")
    module(s, 60, 580, 150, 100, "Painel solar", "5 a 6 V · 1 a 2 W")
    module(s, 250, 580, 190, 100, "Carregador", "com proteção da célula")
    module(s, 480, 580, 150, 100, "Bateria", "ver docs/hardware.md")
    module(s, 640, 700, 200, 70, "Regulador 3,3 V", "pico ≥ 500 mA · Iq baixo")
    s.line([(210, 630), (250, 630)], C["v33"], 3)
    s.line([(440, 630), (480, 630)], C["vbat"], 3)
    s.line([(630, 630), (700, 630), (700, 700)], C["vbat"], 3)
    s.text(900, 655, "470 µF perto do ESP32:", 11, C["mute"])
    s.text(900, 672, "o Wi-Fi puxa picos de ~350 mA.", 11, C["mute"])
    s.text(580, 700, "BAT+", 11, C["vbat"], "middle", weight="700", mono=True)
    # saída do LDO para o trilho 3V3
    s.line([(840, 735), (1150, 735), (1150, 100), (1140, 100)], C["v33"], 3)
    s.text(1000, 728, "3V3 para o trilho do topo", 11, C["v33"], "middle", mono=True)
    # GND do LDO
    gnd(s, 740, 770)
    s.text(40, 850, "Não alimente o pino 3V3 e a USB ao mesmo tempo sem conferir o diodo da sua placa. Detalhes e lista de materiais em docs/hardware.md.", 11, C["mute"])
    s.save("ligacao.svg")


# ===================================================================== arquitetura
def architecture():
    s = Svg(1200, 660, "Arquitetura do sistema")
    s.text(40, 40, "Arquitetura", 24, weight="700")
    s.text(40, 62, "A estação envia lotes por HTTPS. O mesmo Worker guarda os dados, serve o site, avisa os navegadores e dispara os alertas.", 13, C["mute"])

    def box(x, y, w, h, title, lines, fill="#f8fafc", stroke=C["edge"]):
        s.rect(x, y, w, h, fill, stroke, 10, 1.8)
        s.text(x + w / 2, y + 28, title, 15, anchor="middle", weight="700")
        for i, ln in enumerate(lines):
            s.text(x + w / 2, y + 52 + i * 18, ln, 12, C["mute"], "middle")

    box(40, 110, 270, 250, "Estação", ["ESP32-C3", "BME280 e/ou MS5611 · QMC5883L", "Hall do vento · Hall da chuva", "bateria + painel solar", "deep sleep / light sleep", "pinos e sensor configuráveis"], "#e0f2fe", "#0284c7")
    box(470, 110, 270, 250, "Cloudflare Worker", ["POST /api/ingest (lote)", "GET /api/stations · /readings", "PUT /api/stations/:id", "/api/admin/* (administrador)", "/api/live (WebSocket, Hub)", "cron de 5 min: alertas", "serve o site (web/dist)"], "#ecfdf5", "#16a34a")
    box(900, 110, 270, 250, "Navegador", ["React + Vite + Tailwind", "MapLibre: mapa da rede", "figura animada da estação", "gráficos · energia · config", "painel do administrador", "login com Google"], "#f5f3ff", "#7c3aed")
    box(470, 410, 270, 100, "D1 (SQLite)", ["stations · readings · events", "users · releases · settings"], "#fefce8", "#ca8a04")
    box(790, 410, 170, 100, "Telegram", ["alertas: sem dados,", "bateria, rajada, chuva"], "#fff7ed", "#ea580c")
    box(1000, 410, 170, 100, "Google", ["login: o Worker confere", "o ID token (RS256)"], "#f8fafc", "#64748b")

    import math

    def head(x2, y2, a, col):
        p = [(x2, y2), (x2 - 11 * math.cos(a - 0.45), y2 - 11 * math.sin(a - 0.45)), (x2 - 11 * math.cos(a + 0.45), y2 - 11 * math.sin(a + 0.45))]
        s.add(f'<polygon points="{" ".join(f"{x},{y}" for x, y in p)}" fill="{col}"/>')

    def arrow(x1, y1, x2, y2, col, label=None, lx=None, ly=None):
        s.line([(x1, y1), (x2, y2)], col, 3)
        head(x2, y2, math.atan2(y2 - y1, x2 - x1), col)
        if label:
            s.text(lx if lx is not None else (x1 + x2) / 2, ly if ly is not None else (y1 + y2) / 2 - 8, label, 11, col, "middle", mono=True)

    arrow(310, 180, 470, 180, C["wind"], "leituras (lote)", 390, 168)
    arrow(470, 235, 310, 235, C["sda"], "config · firmware", 390, 255)
    arrow(740, 180, 900, 180, C["scl"], "dados e estações", 820, 168)
    arrow(900, 235, 740, 235, C["rain"], "salvar · admin", 820, 255)
    arrow(740, 290, 900, 290, C["vbat"], "avisa: chegou leitura", 820, 278)
    arrow(605, 360, 605, 410, C["vbat"])
    arrow(635, 410, 635, 360, C["vbat"])
    arrow(740, 335, 790, 440, C["wind"])
    arrow(1085, 360, 1085, 410, C["edge"])

    # cabo USB: só o administrador, direto do navegador para a placa (Web Serial)
    s.line([(290, 360), (290, 585), (990, 585), (990, 360)], C["gnd"], 3, dash="9 6")
    head(990, 360, -math.pi / 2, C["gnd"])
    head(290, 360, -math.pi / 2, C["gnd"])
    s.text(580, 570, "cabo USB (Web Serial, Chrome/Edge/Opera, só administrador)", 12, C["gnd"], "middle", weight="700")
    s.text(580, 612, "grava o firmware, entrega Wi-Fi, endereço do site e chave, e aplica a configuração na hora", 12, C["mute"], "middle")

    s.text(40, 410, "Cada leitura leva a idade em segundos,", 12, C["mute"])
    s.text(40, 428, "porque a estação não tem relógio de verdade.", 12, C["mute"])
    s.text(40, 456, "A chave do dispositivo nunca é guardada:", 12, C["mute"])
    s.text(40, 474, "o servidor só guarda o SHA-256 dela.", 12, C["mute"])
    s.text(40, 502, "O firmware novo vai do site para a placa", 12, C["mute"])
    s.text(40, 520, "pela rede (OTA) ou pelo cabo.", 12, C["mute"])
    s.save("arquitetura.svg")


# ===================================================================== energia
def power_modes():
    s = Svg(1200, 640, "Perfis de consumo")
    s.text(40, 40, "Como a estação gasta energia", 24, weight="700")
    s.text(40, 62, "Corrente ao longo do tempo (fora de escala vertical). Estimativas de folha de dados, medir em bancada.", 13, C["mute"])

    def strip(y0, title, subtitle, kind):
        s.text(40, y0, title, 16, weight="700")
        s.text(40, y0 + 20, subtitle, 12, C["mute"])
        top, base, x0, x1 = y0 + 40, y0 + 190, 60, 1150
        s.line([(x0, base), (x1, base)], C["edge"], 1.4)
        s.line([(x0, top), (x0, base)], C["edge"], 1.4)
        s.text(x0 - 6, top + 4, "mA", 11, C["mute"], "end", mono=True)
        s.text(x1, base + 18, "tempo (um ciclo de 10 min e o seguinte)", 11, C["mute"], "end")
        for k in range(2):  # dois ciclos
            cx = x0 + k * 545
            if kind == "window":
                # deep sleep: linha quase no zero
                s.rect(cx + 6, base - 2, 535, 2, "#94a3b8", None, 0)
                # boot
                s.rect(cx + 40, base - 40, 12, 40, "#fbbf24", None, 1)
                # janela de vento em light sleep
                s.rect(cx + 52, base - 14, 64, 14, "#38bdf8", None, 1)
                for j in range(7):
                    s.rect(cx + 56 + j * 9, base - 30, 2.4, 16, "#0ea5e9", None, 0)
                # wi-fi a cada 3 ciclos
                if k == 0:
                    s.rect(cx + 120, base - 150, 60, 150, "#fb923c", None, 2)
                    s.text(cx + 150, base - 158, "Wi-Fi (1 a cada 3)", 11, "#c2410c", "middle")
                s.text(cx + 80, base + 36, "boot + janela 8 s", 11, C["mute"], "middle")
                s.text(cx + 330, base - 10, "deep sleep (~10 µA)", 11, C["mute"], "middle")
            else:
                s.rect(cx + 6, base - 24, 535, 24, "#bae6fd", "#38bdf8", 0, 1)
                for j in range(60):
                    s.rect(cx + 14 + j * 8.8, base - 34, 1.6, 10, "#0284c7", None, 0)
                s.rect(cx + 540, base - 44, 4, 44, "#4ade80", None, 1)
                if k == 0:
                    s.rect(cx + 548, base - 150, 60 - 20, 150, "#fb923c", None, 2)
                    s.text(cx + 560, base - 158, "Wi-Fi (1 a cada 3)", 11, "#c2410c", "middle")
                s.text(cx + 270, base - 8, "light sleep contando cada pulso (~0,3 mA)", 12, "#075985", "middle")
                s.text(cx + 270, base + 36, "média, rajada e direção do ciclo inteiro", 11, C["mute"], "middle")

    strip(100, "Modo janela (padrão)", "Dorme quase o tempo todo; mede o vento por poucos segundos. ≈ 0,20 mA com envio a cada 3 leituras (estimativa).", "window")
    strip(360, "Modo contínuo", "Light sleep o tempo todo: ≈ 0,49 mA com envio a cada 3 leituras (estimativa). Custa mais, mas entrega a média real de 10 min.", "continuous")
    # legenda
    lx, ly = 60, 610
    for i, (col, name) in enumerate([("#94a3b8", "deep sleep"), ("#fbbf24", "boot"), ("#38bdf8", "light sleep + pulsos"), ("#4ade80", "leitura do BME280"), ("#fb923c", "Wi-Fi + envio")]):
        s.rect(lx + i * 210, ly - 10, 14, 14, col, None, 3)
        s.text(lx + i * 210 + 22, ly + 2, name, 12)
    s.save("energia.svg")


# ===================================================================== pinagem do ESP32-C3
def pinout():
    s = Svg(1060, 700, "Pinagem do ESP32-C3 SuperMini")
    s.text(40, 40, "Pinagem do ESP32-C3 SuperMini", 24, weight="700")
    s.text(40, 62, "O que cada pino faz neste projeto (padrão) e o que o chip permite. Confira a serigrafia da sua placa: clones variam.", 13, C["mute"])

    bx, by, bw, bh = 400, 110, 260, 480
    s.rect(bx, by, bw, bh, C["esp"], "#0284c7", 14, 2.4)
    s.rect(bx + 90, by - 8, 80, 30, "#cbd5e1", "#64748b", 6, 1.6)
    s.text(bx + 130, by + 12, "USB-C", 12, C["ink"], "middle", "700")
    s.rect(bx + 70, by + 70, 120, 120, "#bae6fd", "#0284c7", 6, 1.4)
    s.text(bx + 130, by + 125, "ESP32-C3", 15, anchor="middle", weight="700")
    s.text(bx + 130, by + 145, "RISC-V · Wi-Fi · BLE", 11, C["mute"], "middle")
    s.text(bx + 130, by + bh - 40, "botão BOOT = GPIO9", 11, C["mute"], "middle", mono=True)
    s.text(bx + 130, by + bh - 22, "(segurar ao ligar abre o portal)", 11, C["mute"], "middle")

    # (nome, cor do ponto, função neste projeto, características)
    left = [
        ("5V", C["v33"], "entrada 5 V (USB ou painel/carregador)", ""),
        ("GND", C["gnd"], "terra comum", ""),
        ("3V3", C["v33"], "saída 3,3 V para os sensores", ""),
        ("GPIO4", C["wind"], "anemômetro (Hall)", "ADC1 · acorda do deep sleep"),
        ("GPIO3", C["rain"], "pluviômetro (Hall)", "ADC1 · acorda do deep sleep"),
        ("GPIO2", "#94a3b8", "livre (evite)", "ADC1 · acorda · pino de boot"),
        ("GPIO1", "#94a3b8", "livre", "ADC1 · acorda do deep sleep"),
        ("GPIO0", C["vbat"], "bateria (divisor)", "ADC1 · acorda do deep sleep"),
    ]
    right = [
        ("GPIO5", "#94a3b8", "livre", "ADC2 · acorda do deep sleep"),
        ("GPIO6", C["sda"], "SDA (I²C)", ""),
        ("GPIO7", C["scl"], "SCL (I²C)", ""),
        ("GPIO8", "#94a3b8", "LED da placa (evite)", "pino de boot"),
        ("GPIO9", "#94a3b8", "botão BOOT", "pino de boot"),
        ("GPIO10", "#94a3b8", "livre", ""),
        ("GPIO20", "#94a3b8", "UART0 RX (evite)", ""),
        ("GPIO21", "#94a3b8", "UART0 TX (evite)", ""),
    ]
    y0, dy = by + 36, 54
    for i, (name, col, role, extra) in enumerate(left):
        y = y0 + i * dy
        s.line([(bx - 24, y), (bx, y)], col, 3)
        s.add(f'<circle cx="{bx - 24}" cy="{y}" r="5" fill="{col}"/>')
        s.text(bx - 38, y - 2, name, 14, col if col != "#94a3b8" else C["ink"], "end", "700", mono=True)
        s.text(bx - 38, y + 14, role, 11, C["ink"], "end")
        if extra:
            s.text(bx - 38, y + 27, extra, 10, C["mute"], "end")
    for i, (name, col, role, extra) in enumerate(right):
        y = y0 + i * dy
        s.line([(bx + bw, y), (bx + bw + 24, y)], col, 3)
        s.add(f'<circle cx="{bx + bw + 24}" cy="{y}" r="5" fill="{col}"/>')
        s.text(bx + bw + 38, y - 2, name, 14, col if col != "#94a3b8" else C["ink"], "start", "700", mono=True)
        s.text(bx + bw + 38, y + 14, role, 11, C["ink"])
        if extra:
            s.text(bx + bw + 38, y + 27, extra, 10, C["mute"])

    s.text(40, 640, "Regras que o site, o servidor e o firmware aplicam ao trocar os pinos:", 12, weight="700")
    s.text(40, 658, "sem repetir pino · chuva em GPIO0 a 5 (acorda do deep sleep) · bateria em GPIO0 a 4 (ADC1) · nunca 8, 9 (boot), 11 a 17 (flash), 18 e 19 (USB).", 12, C["mute"])
    s.text(40, 676, "GPIO2, 8 e 9 definem o modo de boot: não os use para sensores com pull-up forte ou que puxem o pino na partida.", 12, C["mute"])
    s.save("pinagem.svg")


# ===================================================================== módulos de ambiente (I2C)
def i2c_modules():
    s = Svg(1060, 860, "Ligação dos módulos de ambiente (I2C)")
    s.text(40, 40, "Módulos de ambiente no barramento I²C", 24, weight="700")
    s.text(40, 62, "Os sensores compartilham os mesmos 4 fios. O que muda entre eles é o endereço, escolhido com os jumpers de CSB e SDO.", 13, C["mute"])

    # ESP32-C3
    ex, ey = 40, 110
    s.rect(ex, ey, 170, 190, C["esp"], "#0284c7", 10, 2.2)
    s.text(ex + 85, ey + 24, "ESP32-C3", 15, anchor="middle", weight="700")
    s.text(ex + 85, ey + 42, "SuperMini", 11, C["mute"], "middle")
    pins = [("3V3", C["v33"], 390), ("GND", C["gnd"], 360), ("GPIO7 · SCL", C["scl"], 330), ("GPIO6 · SDA", C["sda"], 300)]
    rails = {}
    for i, (name, col, rx) in enumerate(pins):
        py = ey + 70 + i * 30
        s.text(ex + 160, py + 4, name, 11, col, "end", mono=True)
        s.line([(ex + 170, py), (rx, py)], col, 2.6, dots=[(rx, py)])
        rails[name] = (rx, py, col)
    rail_bottom = 790
    for name, (rx, py, col) in rails.items():
        s.line([(rx, py), (rx, rail_bottom)], col, 2.6)
    s.text(300, rail_bottom + 22, "SDA", 11, C["sda"], "middle", mono=True)
    s.text(330, rail_bottom + 22, "SCL", 11, C["scl"], "middle", mono=True)
    s.text(360, rail_bottom + 22, "GND", 11, C["gnd"], "middle", mono=True)
    s.text(390, rail_bottom + 22, "3V3", 11, C["v33"], "middle", mono=True)

    rx_of = {"VCC": 390, "GND": 360, "SCL": 330, "SDA": 300}
    col_of = {"VCC": C["v33"], "GND": C["gnd"], "SCL": C["scl"], "SDA": C["sda"]}

    def card(top, title, sub, addr, jumpers, notes):
        mx, mw, mh = 520, 500, 190
        s.rect(mx, top, mw, mh, C["mod"], C["edge"], 8)
        s.text(mx + 16, top + 26, title, 15, weight="700")
        s.text(mx + 16, top + 44, sub, 11, C["mute"])
        for j, p in enumerate(("VCC", "GND", "SCL", "SDA")):
            py = top + 76 + j * 26
            x = rx_of[p]
            s.line([(x, py), (mx, py)], col_of[p], 2.4, dots=[(x, py)])
            s.add(f'<circle cx="{mx}" cy="{py}" r="3.6" fill="{col_of[p]}"/>')
            s.text(mx + 10, py + 4, p, 11, col_of[p], mono=True)
        # endereço e jumpers
        s.rect(mx + 120, top + 58, 360, 28, "#ecfeff", "#0891b2", 6, 1.4)
        s.text(mx + 300, top + 77, addr, 12, "#0e7490", "middle", "700")
        for k, line in enumerate(jumpers):
            s.text(mx + 130, top + 108 + k * 18, line, 11, mono=True)
        for k, line in enumerate(notes):
            s.text(mx + 130, top + 108 + (len(jumpers)) * 18 + 6 + k * 15, line, 10, C["mute"])

    card(110, "BME280", "temperatura · umidade · pressão (módulo de 3,3 V)", "endereço 0x76  (SDO → GND)",
         ["CSB → 3V3    (modo I²C)", "SDO → GND    ⇒ 0x76", "SDO → 3V3    ⇒ 0x77"],
         ["Confira se é BME280 mesmo: o BMP280 não mede umidade."])
    card(330, "MS5611  ·  módulo GY-63", "pressão e temperatura (sem umidade)", "endereço 0x77  (CSB → GND)",
         ["PS  → 3V3    (modo I²C; muitos módulos já trazem)", "CSB → GND    ⇒ 0x77", "CSB → 3V3    ⇒ 0x76", "SDO: deixar solto (é do modo SPI)"],
         ["Sensível à luz: abrigue do sol direto."])
    card(550, "GY-273  ·  QMC5883L", "bússola da biruta (direção do vento)", "endereço 0x0D  (fixo)",
         ["DRDY: deixar solto"],
         ["Se o seu GY-273 for HMC5883L (0x1E), não funciona."])

    s.text(40, 840, "Em \"BME280 + MS5611\" o BME280 fica em 0x76 e o MS5611 em 0x77. Dois módulos no mesmo endereço não funcionam.", 12, C["mute"])
    s.save("ligacao-i2c.svg")


if __name__ == "__main__":
    wiring()
    architecture()
    power_modes()
    pinout()
    i2c_modules()
