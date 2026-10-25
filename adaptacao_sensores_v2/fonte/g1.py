"""04 - Montagem completa: vista frontal e corte pelo eixo, com cotas."""
from cotas_lib import *

D = load(); P, C = D["parts"], D["cfg"]
fig = plt.figure(figsize=(16, 10))
title(fig, "Cotas — montagem completa (vista frontal e corte A–A)",
      "Medidas em mm; z = altura a partir da face de baixo da base. Corte A–A: plano Y = 0 pelo eixo do conjunto.")

# ================= vista frontal =================
ax = fig.add_axes([0.52, 0.50, 0.475, 0.43])
panel(ax, (-168, 118), (-24, 118))
ax.text(-168, 118, "Vista frontal", fontsize=13, fontweight="bold", va="top")
for k, c in [("base", "base"), ("tail", "vane"), ("wings", "rotor"), ("north", "north"), ("arm", "arm")]:
    draw(ax, silhouette(P[k], (0, 2)), COL[c], alpha=0.95, z=2)
axis_line(ax, 0, -4, 98)
dimh(ax, -25, 25, -10, "Ø50", ref=0, ty=-1)
dimh(ax, -138.9, 21.1, 98, "160 (biruta)", ref=89)
dimh(ax, -138.9, 82.6, 108, "221,5 (aleta a copo)", ref=(89, 88.4))
dimv(ax, 0, 89, -150, "89,0", ref=(-25, -138.9), tx=-151.5)
dimv(ax, 29, 89, -160, "60", ref=(-138.9, -138.9), tx=-161.3)
dimv(ax, 0, 88.4, 100, "88,4", ref=(25, 82.6), tx=101.5, ha="left")
dimv(ax, 0, 20.1, -34, "20,1", ref=(-25, -10))
dimv(ax, 20.1, 29, -34, "8,9", ref=(-15, -21))
note(ax, (75, 28), (62, -15), "rotor: copos Ø181,5\n(raio varrido 90,8)", fs=9, ha="left")
note(ax, (-5, 21.5), (-70, 8), "indicador N", fs=9, ha="center")

# ================= corte A-A =================
ax2 = fig.add_axes([0.005, 0.03, 0.51, 0.89])
panel(ax2, (-46, 62), (-16, 66))
ax2.text(-46, 66, "Corte A–A (zoom do eixo)", fontsize=13, fontweight="bold", va="top")
X0, X1 = -38, 38
cl = lambda g: clip(g, X0, X1, -5, 70)
draw(ax2, cl(section(P["base"], "y")), COL["base"], hatch="////", z=2)
draw(ax2, cl(section(P["shaft"], "y")), COL["shaft"], z=3)
draw(ax2, cl(section(P["north"], "y")), COL["north"], z=3)
draw(ax2, cl(section(P["tail"], "y")), COL["vane"], z=3)
draw(ax2, cl(section(P["wash"], "y")), COL["wash"], z=4)
draw(ax2, cl(section(P["wings"], "y")), COL["rotor"], z=3)
draw(ax2, cl(section(P["arm"], "y")), COL["arm"], z=4)
for z0 in (C["Z_BRG_V"], C["Z_BRG_R"]):
    for sg in (-1, 1):
        rect(ax2, min(sg * 4, sg * 11), max(sg * 4, sg * 11), z0, z0 + 7, COL["brg"], z=5)
rect(ax2, -9.25, 9.25, 0.3, 1.9, COL["pcb"], z=5)
rect(ax2, -1.5, 1.5, 1.9, 2.8, "#151515", z=5)
mz = C["Z_VANE"] + C["MAGA_ZL"]
rect(ax2, 11.7, 13.7, mz - 2.5, mz + 2.5, COL["magN"], z=6)
rect(ax2, 13.0, 17.0, 46.4, 47.4, COL["magS"], z=6)
rect(ax2, 12.95, 17.05, 49.4, 50.9, "#222", z=6)
axis_line(ax2, 0, -6, 60)

# horizontais
dimh(ax2, -25, 25, -9, "Ø50", ref=0, ty=-1)
dimh(ax2, -10, 10, 12.5, "Ø20", fs=9)
dimh(ax2, -6.75, 6.75, 8.5, "Ø13,5", fs=9)
dimh(ax2, -21, 21, 26.0, "Ø42", ref=29, fs=9, ty=-1)
dimh(ax2, -3.95, 3.95, 35.0, "Ø7,9", out=True, fs=8.5, ty=0.8)
dimh(ax2, -11, 11, 42.0, "Ø22", fs=8.5)
dimh(ax2, -6, 6, 59.0, "Ø12", ref=56.4, fs=9)
dimh(ax2, 0, 19.5, 62.2, "19,5", ref=(56.4, 52), fs=9)
# verticais, esquerda (base e tubo)
xl = -31
dimv(ax2, 0, 5, xl, "5", ref=-25, out=True)
dimv(ax2, 5, 20.1, xl, "15,1", ref=(-25, -10))
dimv(ax2, 20.1, 23.1, xl, "3", ref=-9, out=True)
# verticais, direita: cadeia A (anel/cubo/braco), B (rolamentos), C (eixo)
xa, xb, xc = 25.5, 31.5, 40
dimv(ax2, 29, 38, xa, "9", ref=21, tx=xa + 1.6, ha="left")
dimv(ax2, 38.4, 47.4, xa, "9", ref=21, tx=xa + 1.6, ha="left")
dimv(ax2, 47.4, 48.4, xa, "1", out=True, tx=xa + 1.6, ha="left")
dimv(ax2, 48.4, 56.4, xa, "8", ref=6, tx=xa + 1.6, ha="left")
dimv(ax2, 30, 37, xb, "7", ref=11, tx=xb + 1.6, ha="left", fs=9)
dimv(ax2, 38.9, 45.9, xb, "7", ref=11, tx=xb + 1.6, ha="left", fs=9)
dimv(ax2, 37, 38.9, xb, "1,9", ref=5.55, out=True, tx=xb + 1.6, ha="left", fs=9)
dimv(ax2, 5, 53.4, xc, "48,4 (eixo)", ref=(6.8, 3.5), tx=xc + 1.6, ha="left", fs=9)
note(ax2, (12.7, mz), (44, 20), "ímã A 5×2\n(radial)", fs=8.5, ha="left")
note(ax2, (15, 46.9), (46, 44.5), "ímã B 4×1", fs=8.5, ha="left")
note(ax2, (15, 50.2), (31, 52.0), "A3144", fs=8.5, ha="left")
note(ax2, (4, 1.0), (14, -5.5), "GY-273 sob a base", fs=8.5, ha="left")

# ================= quadro =================
fig.text(0.56, 0.43, "Cotas principais", fontsize=14, fontweight="bold")
linhas = [
    ("Altura total (copos / aleta)", "88,4 / 89,0 mm"),
    ("Largura total (aleta a copo)", "221,5 mm"),
    ("Círculo varrido pelos copos", "Ø181,5 mm"),
    ("Placa da base", "Ø50 × 5 mm"),
    ("Tubo da base: externo / furo", "Ø20 / Ø13,5 mm (topo z 20,1)"),
    ("Eixo: base / rolamentos / topo", "Ø13,6 / Ø7,9 / Ø7 mm"),
    ("Eixo montado (z 5 a 53,4)", "48,4 mm"),
    ("Rolamento 608ZZ (×2)", "Ø8 × Ø22 × 7 mm"),
    ("Arruela", "Ø11,1 / Ø8,2 × 1,9 mm"),
    ("Anel da biruta / cubo do rotor", "Ø42 × 9 mm"),
    ("Folga cubo–braço do Hall", "1 mm (z 47,4 a 48,4)"),
]
for i, (a, b) in enumerate(linhas):
    y = 0.395 - i * 0.028
    fig.text(0.56, y, a, fontsize=11, color="#333")
    fig.text(0.78, y, b, fontsize=11, fontweight="bold", color=INK)
foot(fig, "Fonte: malhas dos STL. As cotas de impressão de cada peça estão nas imagens 05 a 08.")
save(fig, "04_cotas_montagem_corte.png")
