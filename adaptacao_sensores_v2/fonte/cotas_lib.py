"""Ferramentas de desenho tecnico 2D (cortes, silhuetas e cotas) para as imagens com medidas."""
import os, pickle
import numpy as np, trimesh, shapely
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch
from shapely.geometry import box as sbox, Polygon
from shapely.geometry.polygon import orient

SCR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(SCR)

COL = dict(base="#d9dde3", shaft="#9aa3b2", north="#efe6c4", wash="#e2d49a", vane="#f2a36b", rotor="#6cc0d0",
           arm="#8fd19e", brg="#c3c8d2", pcb="#3b66e0", hall="#333333", magN="#e03131", magS="#2f6fe0")
INK = "#1b1b1b"
DIM = "#c92a2a"

plt.rcParams.update({"font.family": "DejaVu Sans", "axes.unicode_minus": False})


def fmt(v):
    s = f"{v:.1f}".replace(".", ",")
    return s[:-2] if s.endswith(",0") else s


def load():
    return pickle.load(open(os.path.join(SCR, "parts2.pkl"), "rb"))


def tomesh(path):
    return trimesh.load(path)


# ---------------- geometria 2D ----------------
def section(mesh, axis, val=0.001):
    """corte por plano axis=val; devolve poligono (shapely) com (u,v): y->(x,z), x->(y,z), z->(x,y)"""
    n = {"x": [1, 0, 0], "y": [0, 1, 0], "z": [0, 0, 1]}[axis]
    s = mesh.section(plane_origin=np.array(n) * val, plane_normal=n)
    idx = {"x": [1, 2], "y": [0, 2], "z": [0, 1]}[axis]
    p2 = trimesh.path.Path2D(entities=s.entities, vertices=s.vertices[:, idx])
    return shapely.union_all(p2.polygons_full)


def silhouette(mesh, axes):
    """projecao ortogonal da malha (descarta a coordenada que nao esta em axes)"""
    tri = mesh.vertices[mesh.faces][:, :, list(axes)]
    polys = shapely.polygons(tri)
    polys = polys[shapely.area(polys) > 1e-9]
    g = shapely.union_all(polys)
    return g.buffer(0.02).buffer(-0.02)


def shift(g, dx=0, dy=0):
    return shapely.affinity.translate(g, dx, dy)


def clip(g, x0, x1, y0, y1):
    return g.intersection(sbox(x0, y0, x1, y1))


def draw(ax, geom, fc, ec=INK, lw=0.9, hatch=None, alpha=1.0, z=2):
    for poly in getattr(geom, "geoms", [geom]):
        if poly.is_empty or poly.geom_type != "Polygon":
            continue
        poly = orient(poly, 1)
        verts, codes = [], []
        for ring in [poly.exterior, *poly.interiors]:
            c = np.asarray(ring.coords)
            verts += list(c)
            codes += [Path.MOVETO] + [Path.LINETO] * (len(c) - 2) + [Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(verts, codes), fc=fc, ec=ec, lw=lw, hatch=hatch, alpha=alpha, zorder=z))


def rect(ax, x0, x1, y0, y1, fc, ec=INK, lw=0.9, z=3, hatch=None):
    draw(ax, sbox(x0, y0, x1, y1), fc, ec, lw, hatch=hatch, z=z)


def circle(ax, cx, cy, r, fc="none", ec=INK, lw=0.9, z=3, ls="-"):
    ax.add_patch(plt.Circle((cx, cy), r, fc=fc, ec=ec, lw=lw, zorder=z, ls=ls))


def axis_line(ax, x, y0, y1, z=1):
    ax.plot([x, x], [y0, y1], color="#777", lw=0.8, ls=(0, (10, 3, 2, 3)), zorder=z)


def axis_hline(ax, y, x0, x1, z=1):
    ax.plot([x0, x1], [y, y], color="#777", lw=0.8, ls=(0, (10, 3, 2, 3)), zorder=z)


# ---------------- cotas ----------------
def _arrow(ax, a, b, style="<|-|>"):
    ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle=style, color=DIM, lw=0.9, shrinkA=0, shrinkB=0,
                                                    mutation_scale=9), zorder=9)


def dimh(ax, x0, x1, y, text=None, ref=None, fs=9.5, out=False, ty=None, tx=None):
    """cota horizontal entre x0 e x1, linha em y; ref = y de onde saem as linhas de chamada (um valor ou par)"""
    if text is None:
        text = fmt(abs(x1 - x0))
    refs = ref if isinstance(ref, (tuple, list)) else (ref, ref)
    for x, r in zip((x0, x1), refs):
        if r is not None:
            s = 1.2 if y > r else -1.2
            ax.plot([x, x], [r + (0.6 if y > r else -0.6) * 1, y + s], color=DIM, lw=0.6, zorder=8)
    if out:
        d = max(abs(x1 - x0) * 0.0, 5)
        _arrow(ax, (x0 - 7, y), (x0, y), "-|>")
        _arrow(ax, (x1 + 7, y), (x1, y), "-|>")
        ax.plot([x0, x1], [y, y], color=DIM, lw=0.9, zorder=8)
    else:
        _arrow(ax, (x0, y), (x1, y))
    xm = (x0 + x1) / 2 if tx is None else tx
    yy = y + (3.0 if ty is None else ty)
    ax.text(xm, yy, text, ha="center", va="bottom" if (ty is None or ty >= 0) else "top", fontsize=fs, color=DIM,
            zorder=10, bbox=dict(fc="white", ec="none", pad=0.6, alpha=0.85))


def dimv(ax, y0, y1, x, text=None, ref=None, fs=9.5, out=False, tx=None, ty=None, ha="right"):
    """cota vertical entre y0 e y1, linha em x; ref = x das linhas de chamada"""
    if text is None:
        text = fmt(abs(y1 - y0))
    refs = ref if isinstance(ref, (tuple, list)) else (ref, ref)
    for y, r in zip((y0, y1), refs):
        if r is not None:
            s = 1.2 if x > r else -1.2
            ax.plot([r + (0.6 if x > r else -0.6), x + s], [y, y], color=DIM, lw=0.6, zorder=8)
    if out:
        _arrow(ax, (x, y0 - 6), (x, y0), "-|>")
        _arrow(ax, (x, y1 + 6), (x, y1), "-|>")
        ax.plot([x, x], [y0, y1], color=DIM, lw=0.9, zorder=8)
    else:
        _arrow(ax, (x, y0), (x, y1))
    ym = (y0 + y1) / 2 if ty is None else ty
    xx = x - 1.6 if tx is None else tx
    ax.text(xx, ym, text, ha=ha, va="center", fontsize=fs, color=DIM, zorder=10,
            bbox=dict(fc="white", ec="none", pad=0.6, alpha=0.85))


def level(ax, y, x0, x1, text, side="r", fs=9, color=DIM):
    """linha de nivel (z) tracejada com rotulo na ponta"""
    ax.plot([x0, x1], [y, y], color=color, lw=0.6, ls=(0, (4, 2)), zorder=7)
    if side == "r":
        ax.text(x1 + 1, y, text, ha="left", va="center", fontsize=fs, color=color, zorder=10)
    else:
        ax.text(x0 - 1, y, text, ha="right", va="center", fontsize=fs, color=color, zorder=10)


def note(ax, xy, xytext, text, fs=9, color=INK, ha="left", va="center", box=True):
    ax.annotate(text, xy=xy, xytext=xytext, fontsize=fs, color=color, ha=ha, va=va, zorder=11,
                arrowprops=dict(arrowstyle="-|>", color=color, lw=0.8, shrinkA=0, shrinkB=0, mutation_scale=8),
                bbox=dict(fc="white", ec="#999", boxstyle="round,pad=0.3", lw=0.6) if box else None)


def title(fig, t, sub):
    fig.text(0.015, 0.968, t, fontsize=22, fontweight="bold", va="center")
    fig.text(0.015, 0.935, sub, fontsize=12.5, color="#444", va="center")


def foot(fig, text):
    fig.text(0.015, 0.012, text, fontsize=11, color="#444")


def panel(ax, xlim, ylim, label=None):
    ax.set_xlim(*xlim); ax.set_ylim(*ylim)
    ax.set_aspect("equal"); ax.axis("off")
    if label:
        ax.text(xlim[0], ylim[1], label, fontsize=13, fontweight="bold", va="top", ha="left", color=INK)


def save(fig, name):
    fig.savefig(os.path.join(OUT, name), dpi=150)
    plt.close(fig)
    print("ok", name)
