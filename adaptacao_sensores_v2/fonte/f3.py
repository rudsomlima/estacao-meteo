import sys; sys.path.insert(0, '.')
from scene2 import *
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Wedge, Rectangle

OUTD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S, _ = make_scene(cut=True, xclip=(-30, 30))
N1, N2 = 900, 1300
cam = dict(pos=[(0, -500, 27), (0, 0, 27), (0, 0, 1)], scale=36)
pl, img, pr = render(S, (N1, N2), cam)
hz = (HALL_Z0 + HALL_Z1) / 2
A = [  # (lado, ponto, texto, cor)
    ("L", (0, 0, 2.35), "Chip QMC5883L do GY-273\n(placa deitada no bolso, sob a base)", "#1c4fd0"),
    ("L", (-19, 0, 2.5), "Base original (plate Ø50)\n+ bolso 3,4 mm e canal de cabos", "#555"),
    ("L", (0, 0, 4.3), "Passa-fios Ø3,6\n(bolso → furo do eixo)", "#333"),
    ("L", (-11.5, 0, 21.6), "Indicador N (original)", "#8a7a40"),
    ("L", (-17, 0, 29.8), "Anel da biruta\n(lábio original z29–30)", "#c9581f"),
    ("L", (-9, 0, 33.5), "Rolamento 608ZZ nº1", "#555"),
    ("L", (-4.6, 0, 37.9), "Arruela espaçadora", "#8a7a40"),
    ("L", (-9, 0, 42.4), "Rolamento 608ZZ nº2", "#555"),
    ("L", (-19, 0, 44), "Cubo do rotor\n(teto de 1 mm com furo p/ o eixo)", "#0f6b7d"),
    ("L", (-5, 0, 55), "Colar do braço do Hall\n(prensado no eixo)", "#2c7a3a"),
    ("R", (MAGA_X, 0, MAGA_Z), "Ímã A 5×2 mm (radial)\nna biruta → gira com ela", "#e03131"),
    ("R", (6.5, 0, 20), "Eixo fixo OCO\n(parede 1,9 mm; fios por dentro)", "#555"),
    ("R", (XSENS, 0, MAGB_ZTOP - 0.5), "Ímã B 4×1 mm no topo do cubo\n(face S p/ cima)", "#e03131"),
    ("R", (XSENS, 0, hz), "A3144 (face marcada p/ baixo)\n≈ 3 mm do ímã B", "#2c7a3a"),
    ("R", (11, 0, 52.2), "Braço do Hall (fixo)", "#2c7a3a"),
    ("R", (2.4, 0, 51.2), "Furo lateral: fios do A3144\nentram no eixo", "#333"),
]
pts = [pr(p) for _, p, _, _ in A]
pl.close()

fig = plt.figure(figsize=(20, 12.6), dpi=120)
fig.patch.set_facecolor("white")
fig.text(0.015, 0.965, "Detalhes — corte pelo eixo (plano Y = 0)", fontsize=23, weight="bold")
fig.text(0.015, 0.938, "Corte vertical da montagem: GY-273 sob a base, rolamentos, ímãs e A3144 no braço fixo.", fontsize=12.5, color="#444")
ax = fig.add_axes([0.0, 0.0, 0.555, 0.92]); ax.imshow(img); ax.axis("off")
ax.set_xlim(-360, N1 + 440); ax.set_ylim(N2, 0)


def place(side):
    idx = [i for i, a in enumerate(A) if a[0] == side]
    idx.sort(key=lambda i: pts[i][1])
    ys = []
    for i in idx:
        y = pts[i][1]
        if ys and y < ys[-1] + 80:
            y = ys[-1] + 80
        ys.append(y)
    return dict(zip(idx, ys))


for side in ("L", "R"):
    ys = place(side)
    for i, y in ys.items():
        _, p, t, c = A[i]
        x = -350 if side == "L" else N1 + 20
        ax.annotate(t, xy=pts[i], xytext=(x, y), fontsize=10, color=c, weight="bold", ha="left", va="center",
                    arrowprops=dict(arrowstyle="-", color=c, lw=1.1),
                    bbox=dict(boxstyle="round,pad=0.28", fc="white", ec=c, lw=1.1))
for i in (0, 10, 12, 13):
    ax.add_patch(Circle(pts[i], 15, fc="none", ec=A[i][3], lw=2.2, ls="--" if i in (0, 13) else "-"))

# ---------- painel direcao ----------
a1 = fig.add_axes([0.575, 0.55, 0.195, 0.36]); a1.set_aspect("equal"); a1.axis("off"); a1.set_xlim(-30, 30); a1.set_ylim(-34, 30)
a1.set_title("Direção — GY-273 (de cima)", fontsize=13.5, weight="bold", loc="left")
a1.add_patch(Circle((0, 0), 21, fc="#fbe3d3", ec="#c9581f", lw=1.5))
a1.add_patch(Circle((0, 0), 11, fc="#d9dde3", ec="#555", lw=1.2))
a1.add_patch(Circle((0, 0), 3.5, fc="#7b8494", ec="#444"))
th = np.radians(40)
mx, my = MAGA_X * np.cos(th), MAGA_X * np.sin(th)
a1.add_patch(Circle((mx, my), 2.6, fc="#e03131", ec="k"))
a1.annotate("", xy=(mx * 0.55, my * 0.55), xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color="#1c4fd0", lw=2.4))
a1.plot([0, 26], [0, 0], color="#aaa", lw=1)
a1.add_patch(Wedge((0, 0), 8, 0, 40, fc="#fbd0d0", ec="#e03131"))
a1.text(9, 2.5, "θ", color="#e03131", fontsize=14, weight="bold")
a1.text(-29, -22, "• O ímã A (5×2) gira com a biruta; o GY-273 fica fixo,\n  34 mm abaixo (distância real ρ ≈ 34 mm).\n• Campo horizontal no chip ≈ 0,5 G (pode cair pela\n  metade com os rolamentos de aço).\n• Placa deitada → use os eixos X e Y:\n  θ = atan2(By − cy, Bx − cx), centro (cx, cy) pela\n  calibração (gire a biruta 360°).\n• Aponte o indicador N e some o offset.",
        fontsize=9.2, va="top", color="#222", linespacing=1.4)

# ---------- painel velocidade ----------
a2 = fig.add_axes([0.79, 0.55, 0.205, 0.36]); a2.axis("off"); a2.set_xlim(0, 60); a2.set_ylim(-34, 30)
a2.set_title("Velocidade — A3144", fontsize=13.5, weight="bold", loc="left")
t = np.linspace(0, 58, 600)
sig = np.ones_like(t) * 20
for k in (8, 28, 48):
    sig[(t > k) & (t < k + 3)] = 12
a2.plot(t, sig, color="#2c7a3a", lw=2.2)
a2.text(0, 25, "OUT (pull-up 10 kΩ → 3V3)", fontsize=10, color="#2c7a3a", weight="bold")
a2.text(0, 8.5, "borda de descida = ímã passou", fontsize=9.5, color="#555")
a2.annotate("", xy=(48, 4), xytext=(8, 4), arrowprops=dict(arrowstyle="<->", color="#e03131"))
a2.text(28, 0.5, "T = 1 volta", color="#e03131", fontsize=10.5, ha="center", weight="bold")
a2.text(0, -6, "• 1 pulso por volta: f = 1/T, v = k·f (calibrar k)\n• 3 fios pelo eixo; GPIO com interrupção (FALLING)\n• Liga com polo SUL na face marcada (≥ 35 G\n  garantido); ímã B a ~3 mm: centenas de G\n• Vento 10 m/s ≈ 8 voltas/s (copos a ~67 mm)",
        fontsize=10.2, va="top", color="#222", linespacing=1.4)

# ---------- ligacao + compras ----------
a3 = fig.add_axes([0.575, 0.0, 0.42, 0.52]); a3.axis("off"); a3.set_xlim(0, 100); a3.set_ylim(0, 60)
a3.text(0, 58, "Ligação ao ESP32", fontsize=15, weight="bold")
rows = [("GY-273 (direção)", "#1c4fd0", ["VCC → 3V3", "GND → GND", "SDA → GPIO 21", "SCL → GPIO 22"], "I²C 0x0D — único no barramento"),
        ("A3144 (velocidade)", "#2c7a3a", ["VCC → 5 V (VIN)", "GND → GND", "OUT → GPIO 27", "10 kΩ de OUT p/ 3V3"], "coletor aberto: pull-up em 3,3 V")]
for i, (tt, c, pins, sub) in enumerate(rows):
    x0 = i * 50.5
    a3.add_patch(Rectangle((x0, 38), 48.5, 17, fc="white", ec=c, lw=2))
    a3.text(x0 + 2, 52, tt, fontsize=12.5, weight="bold", color=c)
    a3.text(x0 + 2, 49, sub, fontsize=9.5, color="#444")
    for j, p in enumerate(pins):
        a3.text(x0 + 2 + (j % 2) * 24, 44 - (j // 2) * 4.2, p, fontsize=10.5, family="monospace")
a3.text(0, 35, "O A3144 (4,5–24 V) é garantido a 5 V; a 3,3 V está fora da especificação (teste se usar)."+"\n"+"O pull-up em 3,3 V mantém o sinal seguro para o ESP32.", fontsize=9.6, color="#222", va="top", linespacing=1.4)
a3.text(0, 29, "Lista de compras / impressão", fontsize=15, weight="bold")
a3.text(0, 27,
        "Comprar: 2× rolamento 608ZZ (8×22×7) · 1× GY-273 (QMC5883L) ·\n"
        "1× A3144 (TO-92UA) · ímã 5×2 mm (A) · ímã 4×1 mm (B) · resistor 10 kΩ ·\n"
        "fio 28 AWG ~0,5 m · epóxi · 3 parafusos M4 (fixação da base).\n"
        "Imprimir (PETG/ASA ao ar livre): 01 base · 02 eixo (em pé) · 03 biruta ·\n"
        "04 rotor · 05 braço do Hall\n"
        "+ originais sem mudança: 06 indicador N · 07 arruela\n"
        "Montagem: GY-273 no bolso → eixo na base (fios do Hall pelo furo) → aro N →\n"
        "rolamento + biruta → arruela → rolamento + rotor → ímã B no topo do cubo →\n"
        "braço do Hall prensado no eixo, A3144 colado no bolso.\n"
        "Ímãs: A radial (face S p/ o eixo), B vertical (face S p/ cima);\n"
        "confira a polaridade com o A3144 na bancada.",
        fontsize=10.2, va="top", color="#222", linespacing=1.5)
fig.savefig(os.path.join(OUTD, "03_detalhes_cortes.png"))
print("ok")
