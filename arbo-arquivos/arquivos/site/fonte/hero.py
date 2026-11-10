# A fachada do site: os passes do hero (2560×1440) e a placa (a torre em alta para o zoom do clique).
# Uso (da pasta do site):
#   npm run blender -- hero.py                      passes base, acesa e ids
#   npm run blender -- hero.py --passe ids          só o mapa dos andares (rápido: 1 amostra)
#   npm run blender -- hero.py --placa todas        a placa em 2×, 4× e 8× (o render mais pesado de todos)
#   opções: --amostras 512  --regiao 1030,120,1550,1320  --cena outra.blend (ou ARBO_BLEND)
# Saída em fonte/render/hero/ e fonte/render/placa/. Depois: npm run andares && npm run otimiza.
#
# Passes: "base" é a cena como está, sem a coleção Acesas (alguns andares acesos, outros não);
# "acesa" é a mesma câmera com Acesas ligada (todos os andares acesos: o site recorta o andar do hover dela);
# "ids" pinta só as Mascaras, cada uma com R = andar, G = 0, B = 255, sem luz e sem antisserrilhado.
# Placa: a região da torre renderizada N vezes maior, com a MESMA câmera (render de borda), para casar pixel a pixel
# com o hero multiplicado por N. Em 8× são 4160×9600 pixels por passe.
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _blender as B

o = B.args({'passe': 'tudo', 'placa': '', 'amostras': 512, 'regiao': '1030,120,1550,1320'})
sc = bpy.context.scene
sc.camera = B.obj('Cam_Hero')
B.colecao('Acesas')
B.colecao('Mascaras')
W, H = 2560, 1440
for nome in B.TIPOLOGIAS.values():  # as maquetes cortadas ficam na origem: nunca entram na fachada
    B.exclui(nome, True)


# pelos nomes: depois de um render, as referências Python aos objetos de uma coleção podem perder a validade
MASCARAS = [ob.name for ob in B.colecao('Mascaras').all_objects]


def mascaras(visivel):
    for n in MASCARAS:
        bpy.data.objects[n].hide_render = not visivel


def passe_luz(nome, caminho, escala=1, regiao=None):
    B.cycles(o['amostras'])
    B.exclui('Acesas', nome == 'base')
    mascaras(False)
    B.resolucao(W * escala, H * escala)
    r = sc.render
    r.use_border = r.use_crop_to_border = regiao is not None
    if regiao:
        x0, y0, x1, y1 = regiao
        r.border_min_x, r.border_max_x = x0 / W, x1 / W
        r.border_min_y, r.border_max_y = 1 - y1 / H, 1 - y0 / H
    B.png(caminho)
    t = time.time()
    B.renderiza(caminho)
    print(f'  {nome} em {(time.time() - t) / 60:.1f} min')


def passe_ids(caminho):
    # tudo some, menos as máscaras; cada uma vira uma cor chapada, sem luz, sem filtro e sem ajuste de cor
    for ob in sc.objects:
        ob.hide_render = True
    B.exclui('Acesas', True)
    mundo = sc.world or bpy.data.worlds.new('mundo')
    sc.world = mundo
    bg = mundo.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0, 0, 0, 1)
        bg.inputs[1].default_value = 0
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4  # sRGB → linear
    for nome in MASCARAS:
        ob = bpy.data.objects[nome]
        if ob.get('andar') is None:
            print(f'aviso: {ob.name} está em Mascaras sem a propriedade "andar"')
            continue
        n = int(ob['andar'])
        m = bpy.data.materials.new(f'_id_{n}')
        nt = m.node_tree
        nt.nodes.clear()
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (lin(n / 255), 0, 1, 1)
        em.inputs['Strength'].default_value = 1
        sai = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(em.outputs[0], sai.inputs[0])
        ob.data = ob.data.copy()
        ob.data.materials.clear()
        ob.data.materials.append(m)
        ob.hide_render = False
    B.cycles(1, ruido=False)
    sc.cycles.filter_width = 0.01
    sc.cycles.max_bounces = 0
    sc.render.dither_intensity = 0
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0
    sc.view_settings.gamma = 1
    sc.render.use_border = False
    B.resolucao(W, H)
    B.png(caminho)
    B.renderiza(caminho)


saida = os.path.join(B.RENDER, 'hero')
if o['placa']:
    regiao = [int(v) for v in str(o['regiao']).split(',')]
    niveis = [2, 4, 8] if o['placa'] == 'todas' else [int(v) for v in str(o['placa']).split(',')]
    pasta = os.path.join(B.RENDER, 'placa')
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, 'regiao.json'), 'w') as f:
        f.write('{"regiao": [%d, %d, %d, %d]}\n' % tuple(regiao))
    for n in niveis:
        w, h = (regiao[2] - regiao[0]) * n, (regiao[3] - regiao[1]) * n
        print(f'placa {n}×: {w}×{h} pixels por passe')
        for p in ('base', 'acesa'):
            passe_luz(p, os.path.join(pasta, f'{n}x-{p}.png'), n, regiao)
else:
    passes = ['base', 'acesa', 'ids'] if o['passe'] == 'tudo' else o['passe'].split(',')
    for p in passes:
        if p == 'ids':
            continue
        passe_luz(p, os.path.join(saida, f'{p}.png'))
    if 'ids' in passes:  # por último: ele desmonta a cena (nada é salvo no .blend)
        passe_ids(os.path.join(saida, 'ids.png'))
