import sys; sys.path.insert(0, '.')
from scene2 import *
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUTD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S, dz = make_scene(explode=True)
W, H = 1500, 2050
cam = dict(pos=cam_iso((-25, 0, 140), 1400, -58, 17), scale=200)
pl, img, proj = render(S, (W, H), cam)
hz = (HALL_Z0 + HALL_Z1) / 2
items = [
    (1, (20, -18, 3 + dz["base"]), "R"),
    (2, (6, -3, 2 + dz["board"]), "L"),
    (3, (0, -6.8, 20 + dz["shaft"]), "R"),
    (4, (0, 34, 21.6 + dz["north"]), "L"),
    (5, (-90, 0, 30 + dz["vane"]), "L"),
    (6, (MAGA_X + 16, 0, MAGA_Z + dz["vane"]), "R"),
    (7, (11, 0, Z_BRG_V + 3.5 + dz["brgV"]), "R"),
    (8, (5.5, 0, Z_WASH + 1 + dz["wash"]), "L"),
    (9, (11, 0, Z_BRG_R + 3.5 + dz["brgR"]), "R"),
    (10, (-21, 0, Z_ROTOR + 4 + dz["rotor"]), "L"),
    (11, (XSENS, 0, MAGB_ZTOP + dz["rotor"] + 14), "R"),
    (12, (6, 0, ARM_Z0 + 4 + dz["arm"]), "L"),
    (13, (XSENS, 0, hz + dz["hall"]), "R"),
    (14, (0, -12, 1.4 + dz["board"]), "R"),
]
P2 = {n: proj(p) for n, p, _ in items}
ax_pts = [proj((0, 0, z)) for z in (-45, 330)]
pl.close()

fig = plt.figure(figsize=(20, 14.4), dpi=120)
fig.patch.set_facecolor("white")
ax = fig.add_axes([0.0, 0.0, 0.58, 0.93]); ax.imshow(img); ax.axis("off")
ax.plot([ax_pts[0][0], ax_pts[1][0]], [ax_pts[0][1], ax_pts[1][1]], color="#888", lw=1.2, ls=(0, (8, 6)), zorder=0)
fig.text(0.015, 0.968, "Vista explodida — ordem de montagem (de baixo para cima)", fontsize=24, weight="bold")
fig.text(0.015, 0.942, "Linha tracejada = eixo comum (Z). Peças azuis/vermelhas pequenas = ímãs (N vermelho, S azul). Não impressos: rolamentos, ímãs e sensores.", fontsize=12.5, color="#444")
for n, p, side in items:
    x, y = P2[n]
    tx = 40 if side == "L" else W - 40
    ax.annotate(str(n), xy=(x, y), xytext=(tx, y), fontsize=12.5, weight="bold", color="white", ha="center", va="center",
                arrowprops=dict(arrowstyle="-", color="#222", lw=1.1, shrinkA=13, shrinkB=0),
                bbox=dict(boxstyle="circle,pad=0.33", fc="#222", ec="none"))
    ax.plot([x], [y], "o", ms=4.5, color="#222")

leg = [
    ("1", "Base com bolso p/ GY-273  [MODIFICADA]", "Base original + piso do furo em z=5, bolso 19,4×14,8×3,4 sob a placa, canal de cabos (−Y)."),
    ("2", "GY-273 (QMC5883L)  [compra]", "Deitado no bolso, componentes p/ cima. Mede o ângulo da biruta."),
    ("3", "Eixo oco prolongado  [MODIFICADO]", "Aparado em z=5; apoio dos rolamentos Ø7,9 (608ZZ); furo Ø3,2 axial + furo lateral p/ os fios do Hall; topo z=53,4."),
    ("4", "Indicador N  [ORIGINAL]", "Aro ID 13,6 sobre o eixo; aponta o norte (referência da bússola)."),
    ("5", "Biruta (Tail boom)  [MODIFICADA]", "Túnel Ø5,3 radial para o ímã A; resto igual (lábio + bolso do rolamento)."),
    ("6", "Ímã A — neodímio 5×2 mm  [compra]", "Radial, face S voltada ao eixo; cola epóxi e tampa o túnel."),
    ("7", "Rolamento 608ZZ nº1  [compra]", "8×22×7 mm. Entra no anel da biruta, sobre o ressalto do eixo (z=30)."),
    ("8", "Arruela espaçadora  [ORIGINAL]", "Separa as pistas internas dos dois rolamentos (z=37)."),
    ("9", "Rolamento 608ZZ nº2  [compra]", "Entra no cubo do rotor (z=38,9)."),
    ("10", "Rotor de copos (Wings)  [MODIFICADO]", "Furo Ø7,5 no teto p/ o eixo passar + bolso Ø4,3 p/ o ímã B no topo do cubo."),
    ("11", "Ímã B — neodímio 4×1 mm  [compra]", "Vertical, face S p/ cima, rente ao topo do cubo (r = 15 mm)."),
    ("12", "Braço do Hall  [NOVO]", "Colar prensa no topo do eixo; braço de 19,5 mm leva o A3144 sobre o ímã B."),
    ("13", "A3144 (TO-92UA)  [compra]", "No bolso do braço, face marcada p/ baixo; terminais por canal → furo do eixo."),
    ("14", "Fios", "GY-273: 4 fios. A3144: 3 fios (descem pelo eixo). Saem juntos pelo canal da base."),
]
y0 = 0.915
fig.text(0.60, 0.945, "Legenda", fontsize=18, weight="bold")
for i, (n, t, d) in enumerate(leg):
    y = y0 - i * 0.0635
    fig.text(0.607, y, n, fontsize=12, weight="bold", color="white", ha="center", va="center",
             bbox=dict(boxstyle="circle,pad=0.3", fc="#222", ec="none"))
    fig.text(0.625, y + 0.011, t, fontsize=12.5, weight="bold", va="center")
    fig.text(0.625, y - 0.0125, d, fontsize=9.8, color="#444", va="center")
fig.savefig(os.path.join(OUTD, "02_vista_explodida.png"))
print("ok")
