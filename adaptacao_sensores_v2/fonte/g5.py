"""08 - Biruta, rotor de copos e braco do Hall: cotas de impressao."""
from cotas_lib import *

D = load(); P, C = D["parts"], D["cfg"]
tail, wings, arm = D["tail_local"], D["wings_local"], P["arm"]
A0 = C["ARM_Z0"]
fig = plt.figure(figsize=(16, 10))
title(fig, "Cotas — biruta, rotor de copos e braço do Hall",
      "Medidas no sistema de cada peça impressa (z = 0 na face de baixo). O eixo da peça passa por X = 0, Y = 0.")

# ================= biruta: planta =================
ax = fig.add_axes([0.005, 0.66, 0.50, 0.26])
panel(ax, (-150, 40), (-34, 30))
ax.text(-150, 30, "03 Biruta — planta", fontsize=13, fontweight="bold", va="top")
draw(ax, silhouette(tail, (0, 1)), COL["vane"], z=2)
circle(ax, 0, 0, 11, fc="white", z=3)
rect(ax, 11.7, 22.5, -2.65, 2.65, "none", ec="#555", lw=0.8, z=4)
axis_hline(ax, 0, -146, 30); axis_line(ax, 0, -26, 26)
dimh(ax, -138.9, 21.1, 25.5, "160", ref=(0, 21), ty=0.8)
dimh(ax, -21, 21, -26, "Ø42", ref=-21, ty=-1.0, fs=9)
dimh(ax, -11, 11, -2.5, "Ø22", out=True, fs=9, ty=-1.3)
dimh(ax, -138.9, -94.0, 6, "≈ 45 (aleta)", ref=(0.8, 0.8), ty=0.8, fs=9)
dimh(ax, 0, 12.7, 9.5, "12,7", ref=0, out=True, fs=9, ty=0.8)
note(ax, (17, 2.0), (-75, 16), "túnel Ø5,3 (ímã A)", fs=8.5, ha="left")

# ================= biruta: elevacao =================
ax2 = fig.add_axes([0.005, 0.37, 0.50, 0.28])
panel(ax2, (-150, 40), (-10, 80))
ax2.text(-150, 80, "03 Biruta — vista frontal", fontsize=13, fontweight="bold", va="top")
draw(ax2, silhouette(tail, (0, 2)), COL["vane"], z=2)
axis_line(ax2, 0, -4, 64)
dimv(ax2, 0, 60, 29, "60", ref=21.1, tx=30.4, ha="left")
dimv(ax2, 0, 9, -26, "9", ref=-21, tx=-27.4)
dimh(ax2, -138.9, -95.4, 63.5, "≈ 43", ref=(60, 60), ty=0.8, fs=9)
note(ax2, (-115, 30), (-100, 10), "aleta: 1,5 mm de espessura", fs=9, ha="left")

# ================= biruta: corte do anel =================
ax3 = fig.add_axes([0.005, 0.02, 0.50, 0.33])
panel(ax3, (-34, 52), (-10, 16))
ax3.text(-34, 16, "03 Biruta — corte do anel (Y = 0)", fontsize=13, fontweight="bold", va="top")
draw(ax3, clip(section(tail, "y"), -30, 30, -1, 14), COL["vane"], z=2)
mz = C["MAGA_ZL"]
rect(ax3, 11.7, 13.7, mz - 2.5, mz + 2.5, COL["magN"], z=5)
axis_line(ax3, 0, -3, 12)
dimh(ax3, -21, 21, -4.5, "Ø42", ref=0, ty=-1.0, fs=9)
dimh(ax3, -11, 11, 5.0, "Ø22", fs=9, ty=0.6)
dimv(ax3, 0, 9, -26, "9", ref=-21, out=False, tx=-27.4)
dimv(ax3, 0, 1, 28, "1", ref=-11.5 if False else 21, out=True, tx=29.4, ha="left", fs=9)
dimv(ax3, mz - 2.65, mz + 2.65, 34, "Ø5,3", ref=22.5, out=True, tx=35.4, ha="left", fs=9)
note(ax3, (17, mz + 3.0), (30, 12.2), "túnel: z 4,5 (centro), de r 11,7 até a borda", fs=8.5, ha="left")
note(ax3, (-18, 0.5), (-33, -8), "lábio 1 mm (apoio do rolamento)", fs=8.5, ha="left")

# ================= rotor: planta =================
ax4 = fig.add_axes([0.52, 0.50, 0.47, 0.42])
panel(ax4, (-100, 100), (-100, 100))
ax4.text(-100, 100, "04 Rotor — planta", fontsize=13, fontweight="bold", va="top")
draw(ax4, silhouette(wings, (0, 1)), COL["rotor"], z=2)
circle(ax4, 0, 0, 90.77, ec=DIM, lw=0.8, ls="--", z=6)
circle(ax4, 0, 0, 64.7, ec="#555", lw=0.8, ls="--", z=6)
circle(ax4, 0, 0, 21, fc="#4da9bb", z=4)
circle(ax4, 0, 0, 3.75, fc="white", z=5)
axis_hline(ax4, 0, -96, 96); axis_line(ax4, 0, -96, 96)
ax4.plot([0, 90.77 * math.cos(math.radians(-60))], [0, 90.77 * math.sin(math.radians(-60))], color=DIM, lw=1.0, zorder=9) if False else None
import math
ang = math.radians(150)
ax4.plot([0, 90.77 * math.cos(ang)], [0, 90.77 * math.sin(ang)], color=DIM, lw=1.0, zorder=9)
ax4.text(-52, 38, "R90,8\n(Ø181,5)", fontsize=9.5, color=DIM, zorder=10, bbox=dict(fc="white", ec="none", pad=0.6))
ang = math.radians(-35)
ax4.plot([0, 64.7 * math.cos(ang)], [0, 64.7 * math.sin(ang)], color="#333", lw=1.0, zorder=9)
ax4.text(24, -22, "R64,7\n(centros dos copos)", fontsize=9, color="#333", zorder=10, bbox=dict(fc="white", ec="none", pad=0.6))
ax4.text(-3, -12, "Ø42", fontsize=9.5, color=DIM, ha="center", zorder=10, bbox=dict(fc="white", ec="none", pad=0.4))
ax4.text(-95, -88, "3 copos a 120° entre si", fontsize=10, color="#333")

# ================= rotor: corte do cubo =================
ax5 = fig.add_axes([0.52, 0.255, 0.47, 0.235])
panel(ax5, (-34, 50), (-7, 20))
ax5.text(-34, 20, "04 Rotor — corte do cubo (Y = 0)", fontsize=13, fontweight="bold", va="top")
draw(ax5, clip(section(wings, "y"), -30, 30, -1, 14), COL["rotor"], z=2)
rect(ax5, 13.0, 17.0, 8.0, 9.0, COL["magS"], z=5)
axis_line(ax5, 0, -3, 12)
dimh(ax5, -21, 21, -3.2, "Ø42", ref=0, ty=-1.0, fs=9)
dimh(ax5, -11, 11, 4.0, "Ø22", fs=9, ty=0.6)
dimh(ax5, -3.75, 3.75, 11.6, "Ø7,5", ref=9, fs=9, ty=0.6)
dimv(ax5, 0, 9, 26, "9", ref=21, tx=27.4, ha="left")
dimv(ax5, 8, 9, 31, "1 (teto)", ref=21, out=True, tx=32.4, ha="left", fs=9)
dimv(ax5, 0, 8, 38, "8 (bolso)", ref=21 if False else 21, tx=39.4, ha="left", fs=9)
note(ax5, (15, 8.5), (-33, 15.5), "bolso Ø4,3 × 1,2 a r 15", fs=8.5, ha="left")

# ================= braco do Hall =================
ax6 = fig.add_axes([0.52, 0.02, 0.47, 0.23])
panel(ax6, (-14, 74), (-9, 17))
ax6.text(-14, 17, "05 Braço do Hall — planta e corte (Y = 0)", fontsize=13, fontweight="bold", va="top")
# planta (lado esquerdo) e corte (lado direito), mesma escala
pl = silhouette(arm, (0, 1))
sec = shift(section(arm, "y"), 0, -A0)
draw(ax6, pl, COL["arm"], z=2)
draw(ax6, shift(pl, 0, 0), "none", z=2) if False else None
circle(ax6, 0, 0, 3.6, fc="white", z=3)
rect(ax6, 12.85, 17.15, -1.65, 1.65, "#222", z=4)
dimh(ax6, -6, 6, 9, "Ø12", ref=6, fs=9, ty=0.6)
dimh(ax6, -3.6, 3.6, -1.0, "Ø7,2", out=True, fs=8.5, ty=-2.4) if False else None
dimh(ax6, 0, 19.5, -9 + 3, "19,5", ref=-3, ty=-1.0, fs=9)
dimv(ax6, -3, 3, 22, "6", ref=19.5, out=True, tx=23.2, ha="left", fs=9)
ax6.text(-13, -7.5, "planta", fontsize=9.5, color="#555")
# corte
ox = 42
draw(ax6, shift(sec, ox, 0), COL["arm"], z=2)
rect(ax6, ox + 12.95, ox + 17.05, 1.0, 2.5, "#222", z=5)
dimv(ax6, 0, 8, ox - 9, "8", ref=ox - 6, out=False, tx=ox - 10.4, fs=9)
dimv(ax6, 0, 3.6, ox + 22, "3,6", ref=ox + 19.5, out=True, tx=ox + 23.2, ha="left", fs=9)
dimh(ax6, ox - 3.6, ox + 3.6, 10.2, "Ø7,2", ref=8, fs=9, ty=0.6)
ax6.text(ox + 2, -7.5, "corte (colar à esquerda)", fontsize=9.5, color="#555")
note(ax6, (ox + 15, 2.0), (ox + 4, 14), "bolso do A3144: 4,3 × 3,3\nfundo em z 1", fs=8.5, ha="left")
foot(fig, "Aleta e rotor medidos nas malhas do autor (Windicator V2.0). Valores com ≈ são aproximados. Nada disto foi conferido com a peça impressa.")
save(fig, "08_cotas_biruta_rotor_braco.png")
