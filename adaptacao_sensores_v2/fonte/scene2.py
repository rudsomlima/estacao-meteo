import os, pickle
import numpy as np, trimesh, pyvista as pv, vtk
from trimesh.transformations import rotation_matrix as rot

SCR = os.path.dirname(os.path.abspath(__file__))
D = pickle.load(open(os.path.join(SCR, "parts2.pkl"), "rb"))
P, C = D["parts"], D["cfg"]
globals().update(C)

COL = dict(base="#d9dde3", shaft="#7b8494", north="#f3efe2", wash="#e9e4d4", vane="#ee7a3a", rotor="#1d8fa6",
           arm="#58b368", brg="#b9bfc9", pcb="#1c4fd0", chip="#151515", hall="#222222", lead="#c9ccd2",
           magN="#e03131", magS="#2f6fe0", red="#e03131", blk="#222222", grn="#2fb344", yel="#f5d90a")


def Box(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return b


def Cyl(r, h, z0, x=0, y=0, sec=96):
    c = trimesh.creation.cylinder(radius=r, height=h, sections=sec)
    c.apply_translation([x, y, z0 + h / 2])
    return c


def bearing(z0):
    return trimesh.boolean.difference([Cyl(BRG_OD / 2, BRG_W, z0), Cyl(BRG_ID / 2, BRG_W + 2, z0 - 1)], engine="manifold")


def mag_x(x, z, d, t):
    """ima radial ao longo de X: metade externa N (vermelha), interna S (azul)"""
    out = []
    for dx, col in ((t / 4, COL["magN"]), (-t / 4, COL["magS"])):
        c = trimesh.creation.cylinder(radius=d / 2, height=t / 2, sections=48)
        c.apply_transform(rot(np.pi / 2, [0, 1, 0]))
        c.apply_translation([x + dx, 0, z])
        out.append((c, col))
    return out


def mag_z(x, ztop, d, t):
    """ima vertical: metade de cima S (azul), de baixo N (vermelha)"""
    out = []
    for dz, col in ((t / 4, COL["magS"]), (-t / 4, COL["magN"])):
        c = trimesh.creation.cylinder(radius=d / 2, height=t / 2, sections=48)
        c.apply_translation([x, 0, ztop - t / 2 + dz])
        out.append((c, col))
    return out


def tube_from(pts, r=0.4):
    p = np.asarray(pts, float)
    for _ in range(3):
        q = []
        for a, b in zip(p[:-1], p[1:]):
            q += [0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b]
        p = np.vstack([p[:1], q, p[-1:]])
    return pv.lines_from_points(p).tube(radius=r, n_sides=10)


BRG_V = bearing(Z_BRG_V)
BRG_R = bearing(Z_BRG_R)
HALL_X0, HALL_X1 = XSENS - 2.05, XSENS + 2.05
HALL_Z0, HALL_Z1 = ARM_Z0 + 1.0, ARM_Z0 + 2.5
MAGB_ZTOP = Z_ROTOR + 9.0
MAGA_Z = Z_VANE + MAGA_ZL


def make_scene(explode=False, cut=False, xclip=None):
    dz = dict(base=0, board=0, shaft=0, north=0, vane=0, brgV=0, wash=0, brgR=0, rotor=0, arm=0, hall=0)
    dx = dict(vane=0, rotor=0)
    if explode:
        dz = dict(base=0, board=-34, shaft=30, north=78, vane=97, brgV=122, wash=137, brgR=156,
                  rotor=181 - Z_ROTOR + Z_ROTOR, arm=0, hall=0)
        dz["rotor"] = 226 - Z_ROTOR
        dz["arm"] = 268 - ARM_Z0
        dz["hall"] = dz["arm"] + 26
    S = []

    def add(mesh, color, name, grp, ox=0, oz=0):
        m2 = mesh.copy()
        m2.apply_translation([ox, 0, dz[grp] + oz])
        S.append(dict(kind="tm", obj=m2, color=color, name=name, group=grp))

    def addpv(poly, color, name):
        S.append(dict(kind="pv", obj=poly, color=color, name=name, group="wire"))

    add(P["base"], COL["base"], "base", "base")
    add(P["shaft"], COL["shaft"], "shaft", "shaft")
    add(P["north"], COL["north"], "north", "north")
    add(P["tail"], COL["vane"], "vane", "vane")
    add(BRG_V, COL["brg"], "brgV", "brgV")
    add(P["wash"], COL["wash"], "wash", "wash")
    add(BRG_R, COL["brg"], "brgR", "brgR")
    add(P["wings"], COL["rotor"], "rotor", "rotor")
    add(P["arm"], COL["arm"], "arm", "arm")
    # GY-273 (placa deitada no bolso sob a base) + chip
    add(Box(-9.25, 9.25, -6.9, 6.9, 0.3, 1.9), COL["pcb"], "pcb", "board")
    add(Box(-1.5, 1.5, -1.5, 1.5, 1.9, 2.8), COL["chip"], "chip", "board")
    # ima A (biruta) e ima B (rotor)
    for m_, c_ in mag_x(MAGA_X, MAGA_ZL + Z_VANE, MAGA_D, MAGA_T):
        add(m_, c_, "magA", "vane", ox=(16 if explode else 0))
    for m_, c_ in mag_z(XSENS, MAGB_ZTOP, MAGB_D, MAGB_T):
        add(m_, c_, "magB", "rotor", oz=(14 if explode else 0))
    # A3144 (corpo deitado, face marcada para baixo) + terminais para -X
    add(Box(HALL_X0, HALL_X1, -1.55, 1.55, HALL_Z0, HALL_Z1), COL["hall"], "hall", "hall")
    for y in (-1.27, 0, 1.27):
        add(Box(HALL_X0 - 8.0, HALL_X0, y - 0.25, y + 0.25, (HALL_Z0 + HALL_Z1) / 2 - 0.2, (HALL_Z0 + HALL_Z1) / 2 + 0.2),
            COL["lead"], "lead", "hall")
    # fios
    gy = [COL["red"], COL["blk"], COL["grn"], COL["yel"]]
    for i, c in enumerate(gy):
        x = -3.0 + 2.0 * i
        if explode:
            pts = [(x, -6.0, 1.4 + dz["board"]), (x, -12, 1.4 + dz["board"]), (x * 1.5, -34, 1.0 + dz["board"] - 6)]
        else:
            pts = [(x, -6.0, 1.5), (x, -9, 1.2), (x, -27, 1.2), (x * 1.6, -46, 1.2)]
        addpv(tube_from(pts), c, "wgy")
    hl = [COL["red"], COL["blk"], COL["yel"]]
    for i, c in enumerate(hl):
        y = (i - 1) * 1.27
        if explode:
            x0 = HALL_X0 - 8.0
            pts = [(x0, y, (HALL_Z0 + HALL_Z1) / 2 + dz["hall"]), (x0 - 6, y * 2, (HALL_Z0 + HALL_Z1) / 2 + dz["hall"] + 2),
                   (x0 - 10, y * 3, (HALL_Z0 + HALL_Z1) / 2 + dz["hall"] + 12)]
        else:
            ym = (i - 1) * 0.8
            pts = [(HALL_X0 - 8.0, y, 50.2), (5.0, y * 0.5, 51.0), (0.5, ym, 51.2), (0, ym, 46), (0, ym, 6),
                   (0, ym, 3.2), (0.0, -6, 2.6), (ym * 1.5, -27, 2.6), (ym * 2.5, -46, 2.6)]
        addpv(tube_from(pts), c, "whall")

    if cut or xclip:
        S2 = []
        for it in S:
            o = it["obj"]
            if it["kind"] == "tm":
                try:
                    if cut:
                        o = trimesh.intersections.slice_mesh_plane(o, [0, 1, 0], [0, 0.0, 0], cap=True)
                    if xclip:
                        o = trimesh.intersections.slice_mesh_plane(o, [1, 0, 0], [xclip[0], 0, 0], cap=True)
                        o = trimesh.intersections.slice_mesh_plane(o, [-1, 0, 0], [xclip[1], 0, 0], cap=True)
                except Exception as e:
                    print("clip fail", it["name"], e)
                if o is None or len(o.faces) == 0:
                    continue
            else:
                if cut:
                    o = o.clip(normal=(0, 1, 0), origin=(0, 0, 0), invert=False)
                if xclip:
                    o = o.clip(normal=(1, 0, 0), origin=(xclip[0], 0, 0), invert=False)
                    o = o.clip(normal=(-1, 0, 0), origin=(xclip[1], 0, 0), invert=False)
                if o.n_points == 0:
                    continue
            S2.append(dict(it, obj=o))
        S = S2
    return S, dz


def render(S, size, cam, parallel=True):
    pl = pv.Plotter(off_screen=True, window_size=size)
    pl.set_background("white")
    for it in S:
        poly = pv.wrap(it["obj"]) if it["kind"] == "tm" else it["obj"]
        pl.add_mesh(poly, color=it["color"], smooth_shading=True, split_sharp_edges=True,
                    specular=0.35, specular_power=20, ambient=0.28, diffuse=0.85)
    pl.camera_position = cam["pos"]
    if parallel:
        pl.camera.parallel_projection = True
        pl.camera.parallel_scale = cam["scale"]
    pl.enable_anti_aliasing("ssaa")
    pl.render()
    img = pl.screenshot(return_img=True)

    def proj(p):
        c = vtk.vtkCoordinate()
        c.SetCoordinateSystemToWorld()
        c.SetValue(float(p[0]), float(p[1]), float(p[2]))
        d = c.GetComputedDoubleDisplayValue(pl.renderer)
        return d[0], size[1] - d[1]
    return pl, img, proj


def cam_iso(center, dist, az, el, up=(0, 0, 1)):
    az, el = np.radians(az), np.radians(el)
    d = np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)]) * dist
    return [tuple(np.array(center) + d), tuple(center), up]
