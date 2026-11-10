# Cena de exemplo: um prédio simples, montado por script, que segue a convenção de fonte/_blender.py.
# Não é o prédio da demo (aquele foi modelado à parte); serve para ver como o .blend precisa estar organizado e
# para testar o caminho inteiro em poucos minutos, com poucas amostras, antes de gastar horas com o prédio de verdade.
# Uso: npm run blender -- cena_exemplo.py        (salva fonte/predio-exemplo.blend; abra no Blender para olhar)
#      depois, por exemplo: npm run blender -- hero.py --cena fonte/predio-exemplo.blend --amostras 16
import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _blender as B

o = B.args({'saida': os.path.join(B.AQUI, 'predio-exemplo.blend')})
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
PE = 3.2  # pé-direito de laje a laje
Z2 = 9.2  # cota do 2º andar


def col(nome, pai=None):
    c = bpy.data.collections.new(nome)
    (pai or sc.collection).children.link(c)
    return c


def mat(nome, cor, emissao=0.0, rug=0.6, alfa=1.0, metal=0.0):
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*cor, 1)
    p.inputs['Roughness'].default_value = rug
    p.inputs['Metallic'].default_value = metal
    p.inputs['Alpha'].default_value = alfa
    if emissao:
        p.inputs['Emission Color'].default_value = (*cor, 1)
        p.inputs['Emission Strength'].default_value = emissao
    return m


def caixa(nome, c, centro, tam, m, **props):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centro)
    ob = bpy.context.object
    ob.name = nome
    ob.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(m)
    for k, v in props.items():
        ob[k] = v
    for u in ob.users_collection:
        u.objects.unlink(ob)
    c.objects.link(ob)
    return ob


def vazio(nome, c, loc):
    e = bpy.data.objects.new(nome, None)
    e.location = loc
    c.objects.link(e)
    return e


def camera(nome, c, loc, alvo, lente, sx=0.0, sy=0.0):
    d = bpy.data.cameras.new(nome)
    d.lens, d.sensor_width, d.sensor_fit = lente, 36, 'AUTO'
    d.shift_x, d.shift_y = sx, sy
    d.clip_end = 2000
    cam = bpy.data.objects.new(nome, d)
    cam.location = loc
    c.objects.link(cam)
    t = vazio(f'{nome}_alvo', c, alvo)
    k = cam.constraints.new('TRACK_TO')
    k.target, k.track_axis, k.up_axis = t, 'TRACK_NEGATIVE_Z', 'UP_Y'
    return cam


bl = lambda g: Vector((g[0], -g[2], g[1]))  # glTF (y sobe) → Blender (z sobe)

# ---------- mundo: hora azul ----------
w = bpy.data.worlds.new('hora_azul')
sc.world = w
w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.09, 0.22, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sol = bpy.data.objects.new('Sol', bpy.data.lights.new('Sol', 'SUN'))
sol.data.energy, sol.data.color = 0.6, (1, 0.62, 0.42)
sol.rotation_euler = (math.radians(84), 0, math.radians(-35))
sc.collection.objects.link(sol)

# ---------- cidade e rua ----------
cid = col('Cidade')
caixa('Chao', cid, (0, 0, -0.05), (600, 600, 0.1), mat('asfalto', (0.03, 0.03, 0.035), rug=0.35))
for i in range(70):
    x, y = random.uniform(-220, 220), random.uniform(25, 260)
    if abs(x) < 30 and y < 60:
        continue
    h = random.uniform(15, 70)
    caixa(f'Vizinho_{i}', cid, (x, y, h / 2), (random.uniform(14, 26), 16, h),
          mat(f'vizinho_{i % 3}', [(0.16, 0.15, 0.14), (0.2, 0.19, 0.17), (0.12, 0.12, 0.13)][i % 3]))
    caixa(f'Janelas_{i}', cid, (x, y - 8.6, h / 2), (random.uniform(8, 14), 1, h * 0.8), mat('janela_viz', (1, 0.66, 0.35), emissao=1.2))

# ---------- a torre ----------
torre = col('Torre')
acesas = col('Acesas')
masc = col('Mascaras')
concreto = mat('laje', (0.55, 0.52, 0.48))
vidro = mat('vidro_fachada', (0.04, 0.05, 0.06), rug=0.05, metal=0.6)
caixa('Embasamento', torre, (0, 0, 4.6), (30, 22, 9.2), mat('embasamento', (0.18, 0.16, 0.14)))
caixa('Lamina', torre, (14, 0, (Z2 + 20 * PE + 7) / 2), (2.2, 9, Z2 + 20 * PE + 7), mat('basalto', (0.1, 0.09, 0.08), rug=0.8))
for n in range(2, 22):
    z = Z2 + (n - 2) * PE
    caixa(f'Laje_{n}', torre, (0, -0.6, z), (25, 17.4, 0.3), concreto)
    recuo = 3.0 if n == 21 else 0.0
    caixa(f'Fachada_{n}', torre, (0, recuo / 2, z + PE / 2), (23, 15.6 - recuo, PE - 0.3), vidro)
    # alguns andares acesos na cena base; todos na coleção Acesas
    if n % 3 == 0:
        caixa(f'Luz_base_{n}', torre, (0, -7.9 + recuo, z + 1.4), (22, 0.05, 2.4), mat('luz', (1, 0.72, 0.42), emissao=3))
    caixa(f'Luz_{n}', acesas, (0, -7.95 + recuo, z + 1.4), (22, 0.05, 2.4), mat('luz', (1, 0.72, 0.42), emissao=3))
    caixa(f'Mascara_{n}', masc, (0, -0.6, z + PE / 2), (25, 17.4, PE), mat('mascara', (1, 0, 1)), andar=n)
caixa('Teto', torre, (0, 1.5, Z2 + 20 * PE + 0.2), (23, 12.6, 0.4), concreto)
vazio('Ancora_tipo', torre, (0, 0, Z2 + 12 * PE + 0.15))     # 14º andar
vazio('Ancora_cobertura', torre, (0, 0, Z2 + 19 * PE + 0.15))  # 21º andar
camera('Cam_Hero', sc.collection, (-12, -125, 18), (2, 0, 34), 30, sy=0.08)

# ---------- maquetes cortadas (na origem, sem teto) ----------
COMODOS = {
    'tipo': {
        'living': ((4.0, 0.9, 3.25), (5.6, 1.55, 1.0), (-3.0, 1.55, 3.9), 28),
        'cozinha': ((8.0, 0.9, -2.2), (7.9, 1.55, 2.6), (7.9, 1.55, -4.4), 24),
        'suite_master': ((-7.0, 0.9, 3.25), (-3.6, 1.55, 3.4), (-9.8, 1.55, 2.6), 24),
        'banho_master': ((-9.0, 0.9, -3.25), (-7.35, 1.55, -0.35), (-10.0, 1.55, -5.2), 22),
        'home_office': ((1.4, 0.9, -4.05), (-0.05, 1.55, -1.95), (3.0, 1.55, -4.9), 24),
        'varanda': ((4.0, 0.9, 7.7), (-1.6, 1.55, 8.5), (9.5, 1.55, 6.9), 24),
    },
    'cobertura': {
        'living': ((-5.0, 0.9, 3.0), (-1.5, 1.55, 0.5), (-8.0, 1.55, 5.0), 24),
        'terraco': ((6.3, 0.9, 2.45), (1.0, 1.55, 6.0), (9.0, 1.55, 0.0), 22),
        'cozinha': ((3.5, 0.9, -3.5), (3.5, 1.55, 0.5), (3.5, 1.55, -6.0), 24),
        'suite_master': ((-7.25, 0.9, -3.5), (-4.0, 1.55, -1.0), (-9.5, 1.55, -5.5), 24),
        'banho_master': ((-1.5, 0.9, -4.75), (-0.5, 1.55, -2.0), (-2.5, 1.55, -6.5), 22),
    },
}
CORTE = {'tipo': ((-9.2376, 37.2817, 44.4597), (0.0, 0.4, 1.3), 0.13), 'cobertura': ((20.4526, 42.1812, 46.8881), (0.2, 0.4, 1.4), 0.11)}
for tip, nome in B.TIPOLOGIAS.items():
    c = col(nome)
    caixa(f'{tip}_piso', c, (0, -1, -0.15), (23.2, 15.8, 0.3), mat('piso', (0.75, 0.68, 0.58)), grupo='casco')
    for i, (x, y, sx, sy) in enumerate([(0, 6.85, 23.2, 0.2), (-11.5, -1, 0.2, 15.8), (11.5, -1, 0.2, 15.8), (-3, 1.5, 0.15, 10.5), (5, 0.5, 0.15, 12)]):
        caixa(f'{tip}_parede_{i}', c, (x, y, 1.4), (sx, sy, 2.8), mat('parede', (0.86, 0.83, 0.78)), grupo='casco')
    caixa(f'{tip}_vidro', c, (0, -6.8, 1.4), (23, 0.05, 2.8), mat('vidro', (0.8, 0.85, 0.9), rug=0.05, alfa=0.15), grupo='vidro')
    caixa(f'{tip}_cortina', c, (-8, -6.5, 1.4), (5, 0.05, 2.8), mat('cortina', (0.7, 0.55, 0.35), alfa=0.5), grupo='cortinas')
    for cm, (pt, loc, alvo, lente) in COMODOS[tip].items():
        p = bl(pt)
        vazio(f'Ponto_{tip}_{cm}', c, p)
        camera(f'Cam_{tip}_{cm}', c, bl(loc), bl(alvo), lente)
        caixa(f'{tip}_{cm}_movel', c, (p.x, p.y, 0.4), (2.2, 1.1, 0.8), mat('movel', (0.55, 0.42, 0.3)), grupo='itens')
        bpy.ops.mesh.primitive_ico_sphere_add(radius=0.45, subdivisions=2, location=(p.x + 1.6, p.y + 0.8, 0.9))
        pl = bpy.context.object
        pl.name, pl['grupo'] = f'{tip}_{cm}_planta', 'folhas'
        pl.data.materials.append(mat('folha', (0.12, 0.3, 0.08)))
        for u in pl.users_collection:
            u.objects.unlink(pl)
        c.objects.link(pl)
        lz = bpy.data.objects.new(f'{tip}_{cm}_luz', bpy.data.lights.new(f'{tip}_{cm}_luz', 'POINT'))
        lz.data.energy, lz.data.color = 250, (1, 0.78, 0.55)
        lz.location = (p.x, p.y, 2.5)
        c.objects.link(lz)
    if tip == 'cobertura':
        caixa('agua', c, (6.3, -2.45, 0.05), (8, 2.4, 0.1), mat('agua', (0.05, 0.4, 0.38), rug=0.05, alfa=0.5), grupo='agua')
    loc, alvo, sx = CORTE[tip]
    camera(f'Cam_{tip}_corte', c, bl(loc), bl(alvo), 50, sx=sx)

sc.frame_start, sc.frame_end, sc.render.fps = 1, 78, 60
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(o['saida']))
print('ok', o['saida'])
