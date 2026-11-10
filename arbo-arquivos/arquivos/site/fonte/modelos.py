# As maquetes cortadas: as poses de câmera de cada tipologia (public/modelos/<tipologia>.json), a imagem fixa do
# corte (fonte/render/<tipologia>/corte.png, 3200×1800) e os renders de cada cômodo no olhar da foto
# (fonte/render/fotos-base/<tipologia>/<comodo>.png), que viram as fotos do site no gerador de imagem.
# Uso (da pasta do site):
#   npm run blender -- modelos.py                   poses + corte + cômodos das duas tipologias
#   npm run blender -- modelos.py --so-poses        só o .json (instantâneo)
#   opções: --tipologia tipo  --amostras 256  --cena outra.blend
# Depois: npm run hotspots (os pontos da planta) e, com as fotos prontas, npm run otimiza.
import json
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _blender as B

o = B.args({'tipologia': 'tipo,cobertura', 'amostras': 256, 'so_poses': False})
sc = bpy.context.scene
FUNDO = {'tipo': (0x03, 0x07, 0x0d), 'cobertura': (0x0d, 0x14, 0x1c)}  # o fundo de cada corte (unidades.js)
B.avalia_restricoes()


def caixa(col):
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in col.all_objects:
        if ob.type != 'MESH':
            continue
        e = ob.evaluated_get(dg)
        pts += [e.matrix_world @ Vector(c) for c in e.bound_box]
    g = [B.gltf(p) for p in pts]
    return {k: [round(min(p[i] for p in g), 2), round(max(p[i] for p in g), 2)] for i, k in enumerate('xyz')}


def projeta(p, c, sensor=36, W=3200, H=1800):
    """ponto 3D (glTF) → fração do quadro, pela câmera c (a mesma conta de fonte/hotspots.mjs)"""
    sub = lambda a, b: [a[i] - b[i] for i in range(3)]
    dot = lambda a, b: sum(a[i] * b[i] for i in range(3))
    nor = lambda a: [v / (sum(x * x for x in a) ** 0.5) for v in a]
    cr = lambda a, b: [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    f = nor(sub(c['alvo'], c['loc']))
    r = nor(cr(f, [0, 1, 0]))
    u = cr(r, f)
    d = sub(p, c['loc'])
    z = dot(d, f)
    k = c['lente'] / sensor
    return 0.5 + dot(d, r) / z * k - c['sx'], 0.5 - (dot(d, u) / z * k - c['sy']) * W / H


for tip in [t for t in o['tipologia'].split(',') if t]:
    col = B.colecao(B.TIPOLOGIAS[tip])
    hero = B.obj('Cam_Hero')
    ancora = B.obj(f'Ancora_{tip}')
    dist = (hero.matrix_world.translation - ancora.matrix_world.translation).length
    corte_cam = B.obj(f'Cam_{tip}_corte')
    comodos, pontos = {}, {}
    for ob in bpy.data.objects:
        pre = f'Cam_{tip}_'
        if ob.type == 'CAMERA' and ob.name.startswith(pre) and ob.name != f'Cam_{tip}_corte':
            comodos[ob.name[len(pre):]] = B.pose(ob, dist=4)
        if ob.name.startswith(f'Ponto_{tip}_'):
            pontos[ob.name[len(f'Ponto_{tip}_'):]] = B.gltf(ob.matrix_world.translation)
    cx = caixa(col)
    poses = {
        'tipologia': tip,
        'quadro': [1600, 900],
        'sensor': 36,
        # a Cam_Hero vista da âncora: a maquete de frente, encaixada na laje da fachada
        'frente': B.pose(hero, ref=ancora.matrix_world, dist=dist),
        'corte': B.pose(corte_cam, dist=40),
        'comodos': comodos,
        'hotspots': pontos,
        'caixa': cx,
        'centro': [round((cx['x'][0] + cx['x'][1]) / 2, 2), 1.0, round((cx['z'][0] + cx['z'][1]) / 2, 2)],
    }
    # o retângulo que a maquete ocupa no corte: é o FOCO de src/motion/explorador/planta.js
    cantos = [[x, y, z] for x in cx['x'] for y in cx['y'] for z in cx['z']]
    pr = [projeta(p, poses['corte']) for p in cantos]
    foco = {k: round(v, 3) for k, v in zip(('x0', 'y0', 'x1', 'y1'), (min(p[0] for p in pr), min(p[1] for p in pr), max(p[0] for p in pr), max(p[1] for p in pr)))}
    os.makedirs(os.path.join(B.PUBLIC, 'modelos'), exist_ok=True)
    with open(os.path.join(B.PUBLIC, 'modelos', f'{tip}.json'), 'w') as f:
        json.dump(poses, f, indent=1, ensure_ascii=False)
    print(f'{tip}.json: {len(comodos)} cômodos, {len(pontos)} pontos; FOCO.{tip} em planta.js = {foco}')
    faltam = sorted(set(comodos) ^ set(pontos))
    if faltam:
        print(f'aviso: cômodo sem câmera ou sem ponto: {faltam}')
    if o['so_poses']:
        continue

    # ---------- renders: só esta tipologia visível ----------
    for nome in B.TIPOLOGIAS.values():
        B.exclui(nome, nome != B.TIPOLOGIAS[tip])
    vis = {ob.name: ob.hide_render for ob in sc.objects}
    for ob in sc.objects:
        if ob.type in ('MESH', 'CURVE') and ob.name not in col.all_objects:
            ob.hide_render = True
    B.cycles(o['amostras'])
    # corte: fundo escuro chapado e uma sombra de contato (shadow catcher) sob a maquete
    mundo = bpy.data.worlds.new(f'_fundo_{tip}')
    lin = lambda c: (c / 255 / 12.92) if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4
    mundo.node_tree.nodes['Background'].inputs[0].default_value = (*[lin(c) for c in FUNDO[tip]], 1)
    mundo.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    luz_mundo, sc.world = sc.world, mundo
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, cx['y'][0] - 0.02))
    chao = bpy.context.object
    chao.scale = ((cx['x'][1] - cx['x'][0]) * 1.5, (cx['z'][1] - cx['z'][0]) * 1.5, 1)
    chao.is_shadow_catcher = True
    sc.camera = corte_cam
    B.resolucao(3200, 1800)
    B.png(os.path.join(B.RENDER, tip, 'corte.png'))
    # a luz da cena continua acesa no corte: o mundo escuro só pinta o fundo (luz do mundo vem das lâmpadas da cena)
    B.renderiza(os.path.join(B.RENDER, tip, 'corte.png'))
    bpy.data.objects.remove(chao)
    sc.world = luz_mundo
    # cômodos: o olhar exato de cada foto, com a luz da cena
    B.resolucao(1672, 941)
    for c in comodos:
        sc.camera = B.obj(f'Cam_{tip}_{c}')
        B.renderiza(os.path.join(B.RENDER, 'fotos-base', tip, f'{c}.png'))
    for n, h in vis.items():
        sc.objects[n].hide_render = h
