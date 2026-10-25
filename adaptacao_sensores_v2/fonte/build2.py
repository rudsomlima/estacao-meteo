"""v2 — adaptacao fiel ao mecanismo original (.3mf do autor): eixo fixo + 2 rolamentos 608ZZ.
Coordenadas do conjunto montado: Z vertical, eixo do conjunto em (0,0).
"""
import os, pickle
import numpy as np, trimesh, pymeshfix
from trimesh.transformations import rotation_matrix as rot

SCR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(SCR)            # grava os STL na pasta acima (adaptacao_sensores_v2/)
W3MF = os.path.join(SCR, "Windicator_V2.0_Compact.3mf")

# ---------------- alturas (mm) da pilha original ----------------
Z_NORTH = 20.1          # aro N apoia no topo do tubo
Z_VANE = 29.0           # base do anel da biruta (labio z29-30)
Z_BRG_V = 30.0          # rolamento 608ZZ da biruta: z30-37
Z_WASH = 37.0           # arruela espacadora: 37-38.9
Z_BRG_R = 38.9          # rolamento do rotor: 38.9-45.9
Z_ROTOR = 38.4          # base do cubo do rotor (bolso 8 mm, teto 1 mm)
BRG_OD, BRG_ID, BRG_W = 22.0, 8.0, 7.0       # 608ZZ: 8 x 22 x 7 mm
SEAT_D = 7.9            # eixo sob os rolamentos: 0,1 mm abaixo do furo de 8 mm (o original tem 8,25)
SEAT_Z1 = 46.0          # topo do trecho de apoio dos rolamentos (z30 a 46)
SHAFT_Z0, SHAFT_TOP = 5.0, 53.4   # eixo aparado em z5 e prolongado ate 53,4
ARM_Z0, ARM_Z1 = 48.4, 52.0
COLLAR_TOP = 56.4
XSENS = 15.0            # raio do Hall / ima do rotor
MAGA_D, MAGA_T, MAGA_X, MAGA_ZL = 5.0, 2.0, 12.7, 4.5   # ima da biruta (radial)
MAGB_D, MAGB_T = 4.0, 1.0                                 # ima do rotor (vertical, face S p/ cima)
POCKET_H, POCKET_W, POCKET_D = 19.4, 14.8, 3.4            # bolso do GY-273 sob a base


def cyl(r, h, z0=0, sections=128, x=0, y=0):
    c = trimesh.creation.cylinder(radius=r, height=h, sections=sections)
    c.apply_translation([x, y, z0 + h / 2])
    return c


def box(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return b


def diff(a, *bs):
    return trimesh.boolean.difference([a, *bs], engine="manifold")


def union(*ms):
    return trimesh.boolean.union(list(ms), engine="manifold")


def hx(x_from, x_to, r, z, y=0):
    """cilindro horizontal ao longo de X"""
    c = trimesh.creation.cylinder(radius=r, height=x_to - x_from, sections=64)
    c.apply_transform(rot(np.pi / 2, [0, 1, 0]))
    c.apply_translation([(x_from + x_to) / 2, y, z])
    return c


def find_circle(mesh, z, r_t, guess, tol=0.35):
    """acha o centro XY de um furo circular de raio ~r_t perto de 'guess' (corte em z)"""
    sec = mesh.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
    best = None
    for e in sec.entities:
        p = sec.vertices[e.points][:, :2]
        c = p.mean(0)
        r = np.linalg.norm(p - c, axis=1)
        if abs(r.mean() - r_t) < tol and r.std() < 0.2:
            d = np.linalg.norm(c - guess)
            if best is None or d < best[0]:
                best = (d, c)
    assert best is not None, "circulo nao encontrado"
    return best[1]


# ---------------- carrega o .3mf do autor ----------------
sc = trimesh.load(W3MF, file_type="3mf", force="scene")
G = dict(sc.geometry)
names = {"1": "Spacer washer", "3": "Wings", "5": "Tail boom", "7": "Shaft", "9": "North indicator",
         "11": "Base for horizontal surfaces", "13": "Base for vertical surfaces"}


def zero_z(m):
    m = m.copy()
    m.apply_translation([0, 0, -m.bounds[0][2]])
    return m


# ---- base horizontal ----
base0 = zero_z(G["11"])
base0.apply_translation([-(base0.bounds[0][0] + base0.bounds[1][0]) / 2, -(base0.bounds[0][1] + base0.bounds[1][1]) / 2, 0])
base = union(base0, cyl(7.6, 5.0, 0))                 # fecha o furo abaixo de z5 (piso do furo = z5)
pocket = box(-POCKET_H / 2, POCKET_H / 2, -POCKET_W / 2, POCKET_W / 2, -1, POCKET_D)
slot = box(-3.0, 3.0, -27, 0, -1, POCKET_D)           # canal dos cabos para -Y
hole = cyl(1.8, 4.0, 2.5, 48)                         # passa-fios: bolso -> furo do eixo
base = diff(base, pocket, slot, hole)

# ---- eixo (shaft): aparado em z5, prolongado, oco, com furo lateral ----
shaft0 = zero_z(G["7"])
shaft = diff(shaft0, box(-20, 20, -20, 20, -1, SHAFT_Z0))
# o trecho de apoio dos rolamentos (original Ø8,25) vira Ø7,9 para o 608ZZ (furo de 8 mm)
shaft = diff(shaft, diff(cyl(5.0, SEAT_Z1 - Z_BRG_V + 0.2, Z_BRG_V, 128), cyl(SEAT_D / 2, SEAT_Z1 - Z_BRG_V + 1.0, Z_BRG_V - 0.5, 128)))
ext = cyl(3.5, SHAFT_TOP - 46.0 + 0.5, 45.5, 64)
shaft = union(shaft, ext)
bore = cyl(1.6, 70, -5, 48)
cross = hx(0, 5, 1.5, 51.2)
shaft = diff(shaft, bore, cross)

# ---- aro N e arruela (originais) ----
north0 = zero_z(G["9"])
nc = find_circle(north0, 1.5, 6.8, np.array([0, -23.5]))
north = north0.copy(); north.apply_translation([-nc[0], -nc[1], 0])
north.apply_translation([0, 0, Z_NORTH])
wash = zero_z(G["1"]); wash.apply_translation([-wash.centroid[0], -wash.centroid[1], 0]); wash.apply_translation([0, 0, Z_WASH])

# ---- biruta (Tail boom) ----
t0 = zero_z(G["5"])
mf = pymeshfix.MeshFix(t0.vertices, t0.faces); mf.repair()
tail = trimesh.Trimesh(mf.points, mf.faces)
tc = find_circle(tail, 0.5, 8.5, np.array([59.0, 0.0]), tol=0.6)
tail.apply_translation([-tc[0], -tc[1], 0])
tail = diff(tail, hx(MAGA_X - MAGA_T / 2 - 0.0, 22.5, MAGA_D / 2 + 0.15, MAGA_ZL))
tail_local = tail.copy()
tail.apply_translation([0, 0, Z_VANE])

# ---- rotor (Wings) ----
w0 = zero_z(G["3"])
wc = find_circle(w0, 4.0, 11.0, np.array([-2.05, 18.65]), tol=0.4)
wings = w0.copy(); wings.apply_translation([-wc[0], -wc[1], 0])
wings = diff(wings, cyl(3.75, 4.0, 7.0, 64))                        # furo no teto p/ passar o eixo
wings = diff(wings, cyl(MAGB_D / 2 + 0.15, 1.6, 9.0 - 1.2, 64, XSENS, 0))  # bolso do ima (topo do cubo)
wings_local = wings.copy()
wings.apply_translation([0, 0, Z_ROTOR])

# ---- braco do Hall (novo) ----
collar = diff(cyl(6.0, COLLAR_TOP - ARM_Z0, ARM_Z0, 96), cyl(3.6, 6.0, ARM_Z0 - 0.1, 64))
bar = box(0, 19.5, -3.0, 3.0, ARM_Z0, ARM_Z1)
arm = union(collar, bar)
pk = box(XSENS - 2.15, XSENS + 2.15, -1.65, 1.65, ARM_Z0 + 1.0, ARM_Z1 + 0.5)   # bolso do A3144 (aberto no topo)
ch = box(6.0, XSENS - 2.0, -1.7, 1.7, 50.6, ARM_Z1 + 0.5)                      # canal dos terminais (aberto no topo)
win = box(2.5, 6.5, -1.7, 1.7, 50.0, 52.4)                                      # janela p/ o furo lateral do eixo
arm = diff(arm, pk, ch, win)

parts = dict(base=base, shaft=shaft, north=north, wash=wash, tail=tail, wings=wings, arm=arm)
for k, v in parts.items():
    print(k, v.is_watertight, v.bounds.round(1).tolist())

# ---------------- exporta STL ----------------
base.export(os.path.join(OUT, "01_base_com_bolso_GY273.stl"))
sh = shaft.copy(); sh.apply_translation([0, 0, -SHAFT_Z0]); sh.export(os.path.join(OUT, "02_eixo_oco_prolongado.stl"))
tail_local.export(os.path.join(OUT, "03_biruta_com_furo_do_ima.stl"))
wings_local.export(os.path.join(OUT, "04_rotor_copos_ima_e_furo.stl"))
a2 = arm.copy(); a2.apply_translation([0, 0, -ARM_Z0]); a2.export(os.path.join(OUT, "05_braco_do_hall.stl"))
zero_z(G["9"]).export(os.path.join(OUT, "06_indicador_N_original.stl"))
zero_z(G["1"]).export(os.path.join(OUT, "07_arruela_original.stl"))

cfg = {k: v for k, v in globals().items() if k.isupper() and isinstance(v, (int, float))}
pickle.dump(dict(parts=parts, cfg=cfg, tail_local=tail_local, wings_local=wings_local), open(os.path.join(SCR, "parts2.pkl"), "wb"))
print("ok")
