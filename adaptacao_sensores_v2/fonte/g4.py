"""07 - Base: vistas superior e inferior, cortes A-A e B-B, com cotas."""
from cotas_lib import *
import math

D = load(); P, C = D["parts"], D["cfg"]
base = P["base"]
PW, PH, PD = C["POCKET_H"], C["POCKET_W"], C["POCKET_D"]     # 19,4 x 14,8 x 3,4
fig = plt.figure(figsize=(16, 10))
title(fig, "Cotas — base com bolso do GY-273",
      "Vista superior, vista inferior (lado do bolso) e dois cortes. Furos de fixação M4 a 120° entre si.")

HOLES = [(0, 17.5), (-17.5 * math.cos(math.radians(30)), -8.75), (17.5 * math.cos(math.radians(30)), -8.75)]

# ================= vista superior =================
ax = fig.add_axes([0.01, 0.48, 0.38, 0.44])
panel(ax, (-36, 36), (-34, 32))
ax.text(-36, 32, "Vista superior", fontsize=13, fontweight="bold", va="top")
circle(ax, 0, 0, 25, fc=COL["base"], z=2)
circle(ax, 0, 0, 10, fc="#c9cfd8", z=3)
circle(ax, 0, 0, 6.75, fc="white", z=4)
circle(ax, 0, 0, 1.8, fc="#9aa", z=5)
for hx_, hy_ in HOLES:
    circle(ax, hx_, hy_, 3.5, fc="#eee", ls="--", lw=0.7, z=4)
    circle(ax, hx_, hy_, 2.5, fc="white", z=5)
axis_line(ax, 0, -28, 28); axis_hline(ax, 0, -28, 28)
dimh(ax, -25, 25, -29, "Ø50", ref=-25, ty=-1.0)
dimh(ax, -10, 10, 14, "Ø20", fs=9, ty=0.9)
dimh(ax, -6.75, 6.75, -3.5, "Ø13,5", fs=9, ty=-1.0)
note(ax, (0, 1.8 * 0.0 + 1.0), (-33, 6), "passa-fios Ø3,6\n(no piso, z 5)", fs=8.5, ha="left")
note(ax, (HOLES[0][0] + 2.5, HOLES[0][1]), (12, 27), "3 furos Ø5\nescareado Ø7 (cônico)", fs=8.5, ha="left")
# raio 17,5
ax.plot([0, HOLES[0][0]], [0, HOLES[0][1]], color=DIM, lw=0.9, zorder=9)
ax.text(1.0, 8.5, "R17,5", fontsize=9, color=DIM, zorder=10, bbox=dict(fc="white", ec="none", pad=0.5))

# ================= vista inferior =================
ax2 = fig.add_axes([0.01, 0.02, 0.38, 0.44])
panel(ax2, (-36, 36), (-34, 32))
ax2.text(-36, 32, "Vista inferior (lado do bolso)", fontsize=13, fontweight="bold", va="top")
circle(ax2, 0, 0, 25, fc=COL["base"], z=2)
rect(ax2, -PW / 2, PW / 2, -PH / 2, PH / 2, "#f5f6f8", z=3)
rect(ax2, -3, 3, -25, 0, "#f5f6f8", ec=INK, z=3)
rect(ax2, -PW / 2, PW / 2, -PH / 2, PH / 2, "#f5f6f8", z=4)
rect(ax2, -9.25, 9.25, -6.9, 6.9, COL["pcb"], z=5)
rect(ax2, -1.5, 1.5, -1.5, 1.5, "#151515", z=6)
circle(ax2, 0, 0, 1.8, fc="white", z=7)
for hx_, hy_ in HOLES:
    circle(ax2, hx_, hy_, 2.5, fc="white", z=5)
axis_line(ax2, 0, -28, 28)
dimh(ax2, -PW / 2, PW / 2, 12.5, fmt(PW), ref=PH / 2, ty=0.9)
dimv(ax2, -PH / 2, PH / 2, -14, fmt(PH), ref=-PW / 2, tx=-15.4)
dimh(ax2, -3, 3, -27.5, "6", ref=-25, out=True, ty=-1.2, fs=9)
note(ax2, (0, -16), (10, -30.5), "canal 6 mm até a borda (−Y)", fs=8.5, ha="left") if False else None
ax2.text(8, -19, "canal 6 × 3,4\naté a borda (−Y)", fontsize=9, color="#333")
note(ax2, (6, 3.5), (15, 16.5), "GY-273 (placa 18,5 × 13,8)", fs=8.5, ha="left")
dimh(ax2, -25, 25, -31.5, "Ø50", ref=-25, ty=-1.0) if False else None

# ================= corte A-A =================
ax3 = fig.add_axes([0.41, 0.47, 0.58, 0.45])
panel(ax3, (-44, 54), (-13, 30))
ax3.text(-44, 30, "Corte A–A (Y = 0)", fontsize=13, fontweight="bold", va="top")
draw(ax3, section(base, "y"), COL["base"], hatch="////", z=3)
axis_line(ax3, 0, -4, 25)
dimh(ax3, -25, 25, -6, "Ø50", ref=0, ty=-1.0)
dimh(ax3, -10, 10, 23.5, "Ø20", ref=20.1, fs=9.5)
dimh(ax3, -6.75, 6.75, 12.0, "Ø13,5", fs=9.5)
dimh(ax3, -PW / 2, PW / 2, -2.0, fmt(PW), ref=3.4 if False else None, ty=0.8, fs=9) if False else None
dimv(ax3, 0, 5, -31, "5", ref=-25, out=True)
dimv(ax3, 0, 20.1, -37, "20,1", ref=-25)
dimv(ax3, 5, 20.1, 31, "15,1", ref=(25, 10), tx=32.4, ha="left")
dimv(ax3, 0, PD, 13, fmt(PD), ref=PW / 2, out=True, tx=14.4, ha="left", fs=9)
level(ax3, 5, 10, 28, "z 5: piso do furo (o eixo assenta aqui)", fs=9)
note(ax3, (0, 4.0), (-42, 9.5), "passa-fios Ø3,6\n(bolso → furo)", fs=8.5, ha="left")
note(ax3, (-PW / 2 + 1, 1.7), (-42, -3), "bolso do GY-273", fs=8.5, ha="left") if False else None

# ================= corte B-B =================
ax4 = fig.add_axes([0.41, 0.02, 0.58, 0.44])
panel(ax4, (-34, 52), (-9, 30))
ax4.text(-34, 30, "Corte B–B (X = 0, ao longo do canal)", fontsize=13, fontweight="bold", va="top")
sb = section(base, "x")
draw(ax4, sb, COL["base"], hatch="////", z=3)
axis_line(ax4, 0, -4, 25)
dimh(ax4, -PH / 2, PH / 2, -5.5, fmt(PH), ref=0, ty=-1.0, fs=9.5)
dimh(ax4, -25, -PH / 2, 7.0, "17,6", ref=(None, None), ty=0.9, fs=9.5)
note(ax4, (-16, 1.7), (-31, 12.5), "canal 6 × 3,4", fs=8.5, ha="left")
dimv(ax4, 0, PD, 12, fmt(PD), ref=PH / 2, out=True, tx=13.4, ha="left", fs=9)
dimv(ax4, 0, 5, 26, "5", ref=25, out=True, tx=27.4, ha="left")
dimv(ax4, 0, 20.1, 32, "20,1", ref=(25, 10), tx=33.4, ha="left")
level(ax4, 5, 12, 30, "z 5: piso do furo", fs=9)
foot(fig, "M4: use parafuso de cabeça escareada (ou cabeça panela, que assenta no escareado). Pontos do bolso abrem para a mesa na impressão: veja o guia de impressão.")
save(fig, "07_cotas_base.png")
