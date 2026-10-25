"""05 - Vista explodida em corte, com as alturas e larguras de cada peca."""
from cotas_lib import *

D = load(); P, C = D["parts"], D["cfg"]
fig = plt.figure(figsize=(16, 10))
title(fig, "Cotas — vista explodida em corte (plano Y = 0)",
      "Cada peça subiu na ordem de montagem, sobre o mesmo eixo. À esquerda: altura de cada peça. Acima: largura. À direita: nome e posição na montagem.")
ax = fig.add_axes([0.01, 0.02, 0.98, 0.90])
panel(ax, (-96, 200), (-14, 232))

CLIP = 27
cl = lambda g: clip(g, -CLIP, CLIP, -5, 100)


def brg(z0):
    return sbox(-11, z0, 11, z0 + 7).difference(sbox(-4, z0, 4, z0 + 7))


north_sec = section(P["north"], "y")
nw = north_sec.bounds[2] - north_sec.bounds[0]

# (chave, nome, geometria em coordenadas da montagem, z inferior na montagem, z inferior na explodida, cor, larg, texto direito)
parts = [
    ("base", "01 Base", section(P["base"], "y"), 0, 0, COL["base"], 50, "z 0 a 20,1 · Ø50 × 5 + tubo Ø20 · furo Ø13,5 · bolso 19,4 × 14,8 × 3,4"),
    ("shaft", "02 Eixo oco", section(P["shaft"], "y"), 5, 34, COL["shaft"], 13.6, "z 5 a 53,4 · Ø13,6 / Ø7,9 / Ø7 · furo axial Ø3,2"),
    ("north", "06 Indicador N", north_sec, 20.1, 96, COL["north"], nw, "z 20,1 a 23,1 · aro ID 13,6"),
    ("tail", "03 Biruta (anel)", section(P["tail"], "y"), 29, 113, COL["vane"], 42, "z 29 a 38 · anel Ø42 · alojamento Ø22 × 7 · túnel Ø5,3 (ímã A)"),
    ("brgV", "Rolamento 608ZZ nº 1", None, 30, 130, COL["brg"], 22, "z 30 a 37 · 8 × 22 × 7"),
    ("wash", "07 Arruela", section(P["wash"], "y"), 37, 148, COL["wash"], 11.1, "z 37 a 38,9 · Ø11,1 / Ø8,2 × 1,9"),
    ("brgR", "Rolamento 608ZZ nº 2", None, 38.9, 164, COL["brg"], 22, "z 38,9 a 45,9 · 8 × 22 × 7"),
    ("wings", "04 Rotor (cubo)", section(P["wings"], "y"), 38.4, 184, COL["rotor"], 42, "z 38,4 a 47,4 · cubo Ø42 × 9 · furo do teto Ø7,5 · bolso Ø4,3 (ímã B)"),
    ("arm", "05 Braço do Hall", section(P["arm"], "y"), 48.4, 206, COL["arm"], 25.5, "z 48,4 a 56,4 · colar Ø12 · barra 19,5 × 6 × 3,6"),
]
tops = {}
for key, nome, g, zb, zx, col, w, txt in parts:
    dz = zx - zb
    if key.startswith("brg"):
        g = brg(zb)
    g = cl(g)
    gx = shift(g, 0, dz)
    draw(ax, gx, col, hatch="////" if key == "base" else None, z=3)
    h = gx.bounds[3] - gx.bounds[1]
    y0, y1 = gx.bounds[1], gx.bounds[3]
    tops[key] = (y0, y1)
    axis_line(ax, 0, y0 - 4, y1 + 4)
    # altura (esquerda)
    xl = min(gx.bounds[0], -12) - 6
    dimv(ax, y0, y1, xl, fmt(h), ref=gx.bounds[0], out=h < 6, tx=xl - 1.4, fs=9.5)
    # largura (acima)
    xw = w / 2 if key != "arm" else 19.5
    x0w = -w / 2 if key != "arm" else -6
    if key == "base":
        dimh(ax, -25, 25, y0 - 7, "Ø50", ref=y0, ty=-1)
    else:
        dimh(ax, x0w, xw, y1 + 5, ("Ø" if key != "arm" else "") + fmt(w), ref=y1, fs=9)
    # texto (direita)
    ym = (y0 + y1) / 2
    ax.plot([30, 76], [ym, ym], color="#888", lw=0.6, zorder=1)
    ax.text(78, ym + 0.8, nome, fontsize=11, fontweight="bold", va="bottom", color=INK)
    ax.text(78, ym - 0.8, txt, fontsize=9.5, va="top", color="#333")

# ima A, ima B, GY-273, Hall
dzv = 113 - 29; dzr = 184 - 38.4; dza = 206 - 48.4
mz = C["Z_VANE"] + C["MAGA_ZL"]
rect(ax, 11.7, 13.7, mz - 2.5 + dzv, mz + 2.5 + dzv, COL["magN"], z=6)
rect(ax, 13.0, 17.0, 46.4 + dzr, 47.4 + dzr, COL["magS"], z=6)
rect(ax, 12.95, 17.05, 49.4 + dza, 50.9 + dza, "#222", z=6)
rect(ax, -9.25, 9.25, 0.3, 1.9, COL["pcb"], z=6)
rect(ax, -1.5, 1.5, 1.9, 2.8, "#151515", z=6)
note(ax, (13.5, mz + dzv + 2.5), (33, mz + dzv + 13), "ímã A 5×2", fs=8.5)
note(ax, (16, 47.0 + dzr), (33, 47 + dzr + 9), "ímã B 4×1", fs=8.5)
note(ax, (16, 50.2 + dza), (33, 50.2 + dza + 7), "A3144 (3,6 × 2,5)", fs=8.5)
note(ax, (5, 1.0), (33, -9), "GY-273 (placa 18,5 × 13,8 × 1,6)", fs=8.5)
foot(fig, "Distâncias entre as peças são só para a vista; as alturas ‘z’ à direita são as da montagem. Ímãs, rolamentos, sensores e GY-273 são itens de compra.")
save(fig, "05_cotas_explodida_corte.png")
