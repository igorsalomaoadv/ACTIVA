# A maquete 3D do site: cada tipologia vira um .glb com a luz do Cycles assada em dois atlas (casco e itens),
# material sem luz (o pixel já é o render, no tom AgX), plantas com a luz nos vértices e vidro, cortinas e água
# como cores simples (o site troca esses três por materiais próprios). Saída: fonte/render/glb/<tipologia>.glb.
# Uso (da pasta do site):
#   npm run blender -- exporta_glb.py               as duas tipologias, atlas de 4096, 256 amostras
#   opções: --tipologia tipo  --lado 4096  --amostras 256  --cena outra.blend
# Depois: npm run otimiza:glb (gera as versões -4096 e -2048 em public/modelos/).
# É um dos passos mais pesados: assar dois atlas de 4096 com 256 amostras leva de dezenas de minutos a horas.
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _blender as B

o = B.args({'tipologia': 'tipo,cobertura', 'lado': 4096, 'amostras': 256})
sc = bpy.context.scene
GRUPOS = ('casco', 'itens', 'vidro', 'cortinas', 'folhas', 'agua')
ASSADOS = ('casco', 'itens')
COR = {  # cor e transparência no glTF (fator linear)
    'vidro': ((0.86, 0.82, 0.70), 0.14),
    'cortinas': ((0.694, 0.546, 0.352), 0.5),
    'agua': ((0.050, 0.235, 0.227), 0.5),
}


def grupo(ob):
    g = str(ob.get('grupo', '')).lower()
    if g in GRUPOS:
        return g
    n = ob.name.lower()
    return next((k for k in GRUPOS if n.startswith(k)), 'itens')


def junta(objs, nome):
    """cópias com os modificadores aplicados, juntadas numa malha só"""
    dg = bpy.context.evaluated_depsgraph_get()
    novos = []
    for ob in objs:
        malha = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        malha.transform(ob.matrix_world)
        n = bpy.data.objects.new(f'_{nome}', malha)
        sc.collection.objects.link(n)
        novos.append(n)
    bpy.ops.object.select_all(action='DESELECT')
    for n in novos:
        n.select_set(True)
    bpy.context.view_layer.objects.active = novos[0]
    if len(novos) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = j.data.name = nome
    return j


def material_unlit(nome, imagem=None, cor_vertice=None):
    m = bpy.data.materials.new(nome)
    nt = m.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground')  # Background ligado à saída = KHR_materials_unlit no exportador
    sai = nt.nodes.new('ShaderNodeOutputMaterial')
    if imagem:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = imagem
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'atlas'
        nt.links.new(uv.outputs[0], t.inputs[0])
        nt.links.new(t.outputs[0], bg.inputs[0])
    elif cor_vertice:
        a = nt.nodes.new('ShaderNodeVertexColor')
        a.layer_name = cor_vertice
        nt.links.new(a.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], sai.inputs[0])
    return m


def material_cor(nome, cor, alfa):
    m = bpy.data.materials.new(nome)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*cor, 1)
    p.inputs['Alpha'].default_value = alfa
    p.inputs['Roughness'].default_value = 0.05 if nome == 'vidro' else 0.5
    return m


def assa_imagem(ob, lado, nome):
    """UV novo 'atlas', assa a luz (Combined) numa imagem float e salva com o tom da cena (AgX)"""
    uv = ob.data.uv_layers.new(name='atlas')
    ob.data.uv_layers.active = uv
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.003, area_weight=1.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(nome, lado, lado, float_buffer=True)
    for slot in ob.material_slots:  # o alvo do bake: um nó de imagem ativo em cada material
        if not slot.material:
            continue
        slot.material = slot.material.copy()
        nt = slot.material.node_tree
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        nt.nodes.active = t
    t0 = time.time()
    bpy.ops.object.bake(type='COMBINED', margin=8, use_clear=True, target='IMAGE_TEXTURES')
    print(f'  atlas {nome}: {(time.time() - t0) / 60:.1f} min')
    caminho = os.path.join(B.RENDER, 'glb', f'_{TIP}_{nome}.png')
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'
    img.save_render(caminho, scene=sc)  # aplica o AgX: o atlas fica como o render ficaria
    final = bpy.data.images.load(caminho)
    final.name = nome
    for i in range(len(ob.data.uv_layers) - 1, -1, -1):  # só o atlas vai para o glb
        if ob.data.uv_layers[i].name != 'atlas':
            ob.data.uv_layers.remove(ob.data.uv_layers[i])
    ob.data.materials.clear()
    ob.data.materials.append(material_unlit(nome, imagem=final))


def assa_vertices(ob):
    attr = ob.data.color_attributes.new('luz', 'BYTE_COLOR', 'CORNER')
    ob.data.color_attributes.active_color = attr
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='COMBINED', target='VERTEX_COLORS', use_clear=True)
    ob.data.materials.clear()
    ob.data.materials.append(material_unlit('folhas', cor_vertice='luz'))


B.cycles(o['amostras'], ruido=False)
sc.render.bake.use_selected_to_active = False
for TIP in [t for t in o['tipologia'].split(',') if t]:
    tip = TIP
    col = B.colecao(B.TIPOLOGIAS[tip])
    for nome in B.TIPOLOGIAS.values():
        B.exclui(nome, nome != B.TIPOLOGIAS[tip])
    # pelos nomes: depois de juntar e assar, as referências Python aos objetos da coleção perdem a validade
    proprios = [ob.name for ob in col.all_objects if ob.type == 'MESH' and not ob.hide_render]
    # só a maquete conta na luz: a torre e a cidade (que ficam no mesmo lugar da cena) somem do bake
    fora = [ob.name for ob in sc.objects if ob.type in ('MESH', 'CURVE') and ob.name not in col.all_objects and not ob.hide_render]
    for n in fora:
        bpy.data.objects[n].hide_render = True
    por_grupo = {}
    for n in proprios:
        ob = bpy.data.objects[n]
        por_grupo.setdefault(grupo(ob), []).append(ob)
    print(tip, {k: len(v) for k, v in por_grupo.items()})
    juntos = [junta(objs, g).name for g, objs in por_grupo.items()]
    # assa com a maquete inteira presente (sombras e reflexos entre os grupos), cada grupo por vez
    for n in proprios:
        bpy.data.objects[n].hide_render = True
    for n in juntos:
        j = bpy.data.objects[n]
        if n in ASSADOS:
            assa_imagem(j, o['lado'], n)
        elif n == 'folhas':
            assa_vertices(j)
    for n in juntos:
        j = bpy.data.objects[n]
        if n in COR:
            j.data.materials.clear()
            j.data.materials.append(material_cor(n, *COR[n]))
    bpy.ops.object.select_all(action='DESELECT')
    for n in juntos:
        bpy.data.objects[n].select_set(True)
    destino = os.path.join(B.RENDER, 'glb', f'{tip}.glb')
    bpy.ops.export_scene.gltf(filepath=destino, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_texcoords=True, export_normals=False,
                              export_vertex_color='MATERIAL', export_image_format='AUTO', export_cameras=False,
                              export_lights=False, export_extras=False)
    print('ok', destino)
    for n in juntos:
        bpy.data.objects.remove(bpy.data.objects[n])
    for n in proprios + fora:
        bpy.data.objects[n].hide_render = False
