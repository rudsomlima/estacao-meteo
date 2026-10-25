"""Monta Windicator_sensores_placa.3mf: as 7 pecas dos STL numa placa, com nomes (rode depois do build2.py)."""
import os
import numpy as np, trimesh

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PECAS = [("01 base com bolso GY273", "01_base_com_bolso_GY273.stl"),
         ("02 eixo oco prolongado (imprimir em pe)", "02_eixo_oco_prolongado.stl"),
         ("03 biruta com furo do ima", "03_biruta_com_furo_do_ima.stl"),
         ("04 rotor copos ima e furo", "04_rotor_copos_ima_e_furo.stl"),
         ("05 braco do Hall", "05_braco_do_hall.stl"),
         ("06 indicador N", "06_indicador_N_original.stl"),
         ("07 arruela", "07_arruela_original.stl")]
GAP = 6.0

scene = trimesh.Scene()
meshes = [(n, trimesh.load(os.path.join(OUT, f))) for n, f in PECAS]
# prateleiras: largura maxima de 230 mm (mesa de 256 mm)
x = y = row_h = 0.0
for nome, m in sorted(meshes, key=lambda t: -t[1].extents[1]):
    w, d = m.extents[0], m.extents[1]
    if x + w > 230 and x > 0:
        x, y, row_h = 0.0, y + row_h + GAP, 0.0
    m = m.copy()
    m.apply_translation([x - m.bounds[0][0], y - m.bounds[0][1], -m.bounds[0][2]])
    scene.add_geometry(m, node_name=nome, geom_name=nome)
    x += w + GAP
    row_h = max(row_h, d)
scene.export(os.path.join(OUT, "Windicator_sensores_placa.3mf"))
print("ok", scene.bounds.round(0).tolist())
