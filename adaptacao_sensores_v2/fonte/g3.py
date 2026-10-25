"""06 - Eixo, arruela e indicador N: cotas de impressao."""
from cotas_lib import *

D = load(); P, C = D["parts"], D["cfg"]
fig = plt.figure(figsize=(16, 10))
title(fig, "Cotas — eixo, arruela e indicador N",
      "Eixo no sistema da peça impressa (z = 0 na base do eixo; em parênteses, a altura z na montagem). Imprima o eixo em pé.")

# ================= eixo =================
ax = fig.add_axes([0.01, 0.03, 0.52, 0.89])
panel(ax, (-34, 66), (-12, 58))
ax.text(-34, 58, "Eixo oco (corte A–A, plano Y = 0)", fontsize=13, fontweight="bold", va="top")
sh = shift(section(P["shaft"], "y"), 0, -5)
draw(ax, sh, COL["shaft"], z=3)
axis_line(ax, 0, -4, 52)
# niveis
for z, t in ((0, "z 0  (montagem z 5, assenta no piso do furo da base)"),
             (25, "z 25  (montagem z 30): ressalto, apoia o rolamento nº 1"),
             (41, "z 41  (montagem z 46): fim do apoio dos rolamentos"),
             (48.4, "z 48,4  (montagem z 53,4): topo")):
    level(ax, z, 8, 22, t, side="r", fs=8.5)
# cotas verticais
xl = -13
dimv(ax, 0, 25, xl, "25", ref=-6.8)
dimv(ax, 25, 41, xl, "16", ref=-4)
dimv(ax, 41, 48.4, xl, "7,4", ref=-3.5, out=True)
dimv(ax, 0, 48.4, -22, "48,4", ref=-6.8, tx=-23.4)
# horizontais
dimh(ax, -6.8, 6.8, 12.5, "Ø13,6", fs=10)
dimh(ax, -3.95, 3.95, 33.0, "Ø7,9", out=True, fs=10, ty=1.0)
dimh(ax, -3.5, 3.5, 44.8, "Ø7", out=True, fs=9, ty=1.0) if False else None
dimh(ax, -3.5, 3.5, 51.4, "Ø7", ref=48.4, fs=10)
dimh(ax, -1.6, 1.6, 20.0, "Ø3,2", out=True, fs=9, ty=1.0)
# furo lateral
cz = 51.2 - 5
note(ax, (3.6, cz), (14, 55.5), "furo lateral Ø3,0\nz 46,2 (montagem 51,2)", fs=8.5)
dimv(ax, cz - 1.5, cz + 1.5, 9.6, "3", ref=3.5, out=True, tx=11, ha="left", fs=9) if False else None
note(ax, (0, 2.0), (12, 4), "furo axial Ø3,2 (passa os fios)\npor todo o eixo", fs=8.5)
note(ax, (6.4, 24.6), (12, 28.5), "chanfro 0,65 no ressalto", fs=8.5) if False else None

# ================= arruela =================
ax2 = fig.add_axes([0.54, 0.50, 0.45, 0.42])
panel(ax2, (-24, 40), (-14, 14))
ax2.text(-24, 14, "07 Arruela espaçadora", fontsize=13, fontweight="bold", va="top")
circle(ax2, 0, 0, 5.55, fc=COL["wash"], z=3)
circle(ax2, 0, 0, 4.1, fc="white", z=4)
axis_hline(ax2, 0, -9, 9); axis_line(ax2, 0, -9, 9)
dimh(ax2, -5.55, 5.55, -9, "Ø11,1", ref=-5.55, ty=-1.0)
dimh(ax2, -4.1, 4.1, 0.0, "Ø8,2", out=True, fs=9, ty=1.0)
# lateral
rect(ax2, 18, 18 + 1.4, 0, 1.9, COL["wash"], z=3)
rect(ax2, 18 + 1.4, 18 + 11.1 - 1.4, 0, 1.9, "white", ec="none", z=3)
rect(ax2, 18 + 11.1 - 1.4, 18 + 11.1, 0, 1.9, COL["wash"], z=3)
rect(ax2, 18, 18 + 11.1, 0, 1.9, "none", z=4)
dimv(ax2, 0, 1.9, 33, "1,9", ref=29.1, out=True, tx=34.4, ha="left")
dimh(ax2, 18, 29.1, -2.5, "Ø11,1", ref=0, ty=-1.0, fs=9)
ax2.text(23.5, 7.0, "vista lateral", fontsize=9.5, color="#555", ha="center")
ax2.text(0, 8.2, "planta", fontsize=9.5, color="#555", ha="center")
note(ax2, (4.1, 0.0), (7.3, -9.5), "folga de 0,15 a 0,2 mm\nsobre o eixo Ø7,9", fs=8.5) if False else None

# ================= indicador N =================
ax3 = fig.add_axes([0.54, 0.03, 0.45, 0.46])
panel(ax3, (-40, 70), (-22, 64))
ax3.text(-40, 64, "06 Indicador N (aro + haste do norte)", fontsize=13, fontweight="bold", va="top")
# gira 90 graus: haste na horizontal (x = y original), largura em y (= x original)
sil = silhouette(P["north"], (0, 1))
rot = shapely.affinity.rotate(sil, -90, origin=(0, 0))
draw(ax3, rot, COL["north"], z=3)
# furos do aro (Ø13,6) e da haste (Ø15, a 42 do centro)
circle(ax3, 0, 0, 6.8, fc="white", z=4)
circle(ax3, 42.0, 0, 7.5, fc="white", z=4)
axis_hline(ax3, 0, -14, 60); axis_line(ax3, 0, -14, 14); axis_line(ax3, 42, -14, 14)
dimh(ax3, -10, 57, 22, "67", ref=(10, 10), ty=0.8)
dimh(ax3, 0, 42, 17, "42", ref=0, ty=0.8)
dimv(ax3, -15, 15, 62, "30", ref=57, tx=63, ha="left") if False else None
dimv(ax3, -15, 15, 64, "30", ref=(57 - 3, 57 - 3), tx=65.3, ha="left") if False else None
dimv(ax3, -15, 15, 27.5, "30", ref=27.0, tx=29, ha="left", fs=9.5) if False else None
dimh(ax3, -10, 10, -17.5, "Ø20", ref=-10, ty=-1.0)
dimv(ax3, -6.8, 6.8, -13, "Ø13,6", ref=0, out=True, tx=-14.4, fs=9.5) if False else None
note(ax3, (0, 5.5), (-30, 17), "furo Ø13,6\n(entra no tubo)", fs=9)
note(ax3, (42, 5.5), (30, -17), "furo Ø15", fs=9)
dimh(ax3, 45.0, 57.0, -17.5, "", fs=1) if False else None
# espessura
rect(ax3, 0, 67 - 10 - 10, -20.6, -20.6, "none", ec="none")
rect(ax3, 46, 49, 41, 41, "none", ec="none")
dimv(ax3, -15, 15, 66, "Ø30", ref=(57, 57), tx=67.3, ha="left")
ax3.text(-38, 40, "espessura 3 mm\n(z 20,1 a 23,1)", fontsize=10, color="#333", ha="left")
foot(fig, "Nenhuma medida de folga foi testada em impressão: ajuste o apoio do eixo (SEAT_D em build2.py) conforme o guia de impressão.")
save(fig, "06_cotas_eixo_arruela_indicador.png")
