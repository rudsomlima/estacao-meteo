import sys; sys.path.insert(0, '.')
from scene2 import *
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

OUTD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S, _ = make_scene()

W1, H1 = 1400, 1150
cam1 = dict(pos=cam_iso((-25, 0, 36), 800, -58, 21), scale=118)
pl1, img1, pr1 = render(S, (W1, H1), cam1)
A = {k: pr1(v) for k, v in dict(
    vane=(-105, 0, 55), cups=(62, 0, 62), arm=(12, 0, 54), hall=(XSENS, 0, 51), north=(0, 34, 21.6),
    base=(20, -18, 3), cables=(2, -34, 2.6), magA=(21, 0, MAGA_Z), magB=(XSENS, 0, MAGB_ZTOP),
    sens=(0, 0, 4), brgs=(0, -11, 34), shaft=(0, -6.8, 24)).items()}
pl1.close()

W2, H2 = 1800, 800
cam2 = dict(pos=[(-22, -800, 40), (-22, 0, 40), (0, 0, 1)], scale=52)
pl2, img2, pr2 = render(S, (W2, H2), cam2)
Q = lambda x, z: pr2((x, 0, z))

fig = plt.figure(figsize=(20, 11.4), dpi=130)
fig.patch.set_facecolor("white")
fig.text(0.015, 0.955, "Windicator + GY-273 (direção) + A3144 (velocidade) — montagem completa", fontsize=23, weight="bold")
fig.text(0.015, 0.922, "Base no mecanismo original do autor (.3mf): eixo fixo + 2 rolamentos 608ZZ. Em cima: perspectiva · embaixo: elevação com cotas (mm).", fontsize=13, color="#444")
ax1 = fig.add_axes([0.0, 0.33, 0.62, 0.58]); ax1.imshow(img1); ax1.axis("off")
ax2 = fig.add_axes([0.0, 0.0, 0.75, 0.31]); ax2.imshow(img2); ax2.axis("off"); ax2.set_xlim(0, W2 * 1.0); ax2.set_ylim(H2, 0)


def tag(ax, p, txt, xy, color="#111"):
    ax.annotate(txt, xy=p, xytext=xy, fontsize=12, color=color, weight="bold", ha="left", va="center",
                arrowprops=dict(arrowstyle="-", color=color, lw=1.3),
                bbox=dict(boxstyle="round,pad=0.3", fc="white", ec=color, lw=1.3))


tag(ax1, A["vane"], "Biruta (Tail boom)\n+ ímã A 5×2 mm", (20, 100), "#c9581f")
tag(ax1, A["cups"], "Rotor de copos (Wings)\n+ ímã B 4×1 mm no topo", (1010, 150), "#0f6b7d")
tag(ax1, A["hall"], "A3144 no braço fixo\n(1 pulso por volta)", (1010, 460), "#2c7a3a")
tag(ax1, A["north"], "Indicador N\n(original)", (60, 700), "#555")
tag(ax1, A["base"], "Base com bolso\nGY-273 por baixo", (60, 1020), "#1c4fd0")
tag(ax1, A["cables"], "Cabos: GY-273 (4) + A3144 (3)\nsaem pelo canal da base → ESP32", (360, 1090), "#333")
tag(ax1, A["shaft"], "Eixo fixo OCO\n(passa os fios do A3144)", (1010, 800), "#555")
ax1.add_patch(Circle(A["magA"], 12, fc="none", ec="#e03131", lw=2.4))
ax1.add_patch(Circle(A["magB"], 12, fc="none", ec="#e03131", lw=2.4))
ax1.add_patch(Circle(A["sens"], 18, fc="none", ec="#1c4fd0", lw=2.2, ls="--"))

lv = [(0, "z = 0  face de baixo da base (GY-273 em z ≈ 0,3–2,8)", "#1c4fd0"), (20.1, "z = 20,1  topo do tubo / indicador N", "#555"),
      (MAGA_Z, f"z = {MAGA_Z:.1f}  ímã A (biruta) — roda sobre o rolamento", "#e03131"),
      (Z_ROTOR, "z = 38,4  base do rotor", "#0f6b7d"), (MAGB_ZTOP, "z = 47,4  topo do cubo: ímã B ↔ A3144", "#2c7a3a"),
      (ARM_Z1, "z = 52  braço do Hall (fixo)", "#2c7a3a"), (88.4, "z = 88,4  topo dos copos", "#0f6b7d")]
xr = Q(96, 0)[0]
for z, lab, col in lv:
    y = Q(0, z)[1]
    ax2.plot([Q(-139, 0)[0], xr], [y, y], color=col, lw=0.9, ls=(0, (6, 4)))
    ax2.text(xr + 12, y, lab, fontsize=11.5, color=col, weight="bold", va="center")
ax2.set_xlim(0, W2 * 1.25)
ya, yb = Q(0, 0.3)[1], Q(0, 47.4)[1]
fig.text(0.015, 0.012, "Altura total 88,4 mm · biruta + copos ≈ 160 mm de envergadura · pilha original preservada; mudanças: base (bolso), eixo (oco/prolongado), biruta (furo do ímã), rotor (furo + ímã), + braço do Hall.", fontsize=11.5, color="#444")
fig.savefig(os.path.join(OUTD, "01_montagem_completa.png"))
print("ok")
