# Peças comuns dos scripts do Blender (hero.py, clipe.py, modelos.py, exporta_glb.py). Não rode este arquivo.
#
# CONVENÇÃO DA CENA (o arquivo .blend do prédio; o cena_exemplo.py monta uma que segue tudo isto):
#   Cam_Hero                    câmera da fachada (o hero de 2560×1440, a primeira tela do site)
#   coleção Acesas              luzes e janelas que acendem TODOS os andares (fica fora do passe "base")
#   coleção Mascaras            um objeto por andar com a propriedade personalizada "andar" (2 a 21): o volume da
#                               unidade visto da Cam_Hero; só aparece no passe "ids" (o mapa do hover e do clique)
#   coleções Tipo e Cobertura   a maquete cortada de cada tipologia, sem teto, com a origem no meio da laje.
#                               Cada objeto pode ter a propriedade "grupo": casco (paredes, piso, laje), itens
#                               (móveis; é o padrão), vidro, cortinas, folhas (plantas) ou agua (piscina)
#   Ancora_tipo, Ancora_cobertura   vazios (empty) na torre, onde a maquete do 14º andar e da cobertura encaixa
#   Cam_tipo_corte, Cam_cobertura_corte   a vista do corte (a planta do site)
#   Cam_<tipologia>_<comodo>    o olhar de cada foto (living, cozinha, suite_master, ...), na altura dos olhos
#   Ponto_<tipologia>_<comodo>  vazio no meio de cada cômodo (o ponto clicável da planta)
#   Cam_Clipe                   (opcional) a câmera animada do voo até a cobertura; sem ela, clipe.py cria o voo
# As câmeras de Tipo e Cobertura podem mirar com uma restrição Track To (o alvo vira o "alvo" do site).
import os
import sys

import bpy
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(AQUI, 'render')
PUBLIC = os.path.join(os.path.dirname(AQUI), 'public')
TIPOLOGIAS = {'tipo': 'Tipo', 'cobertura': 'Cobertura'}


def args(padrao):
    """--chave valor depois do `--` da linha de comando, com os tipos do dicionário padrão"""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = dict(padrao)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--'):
            k = a[2:].replace('-', '_')
            v = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
            if v is not True:
                i += 1
            if k in padrao and isinstance(padrao[k], bool):
                v = v is True or str(v).lower() in ('1', 'sim', 'true')
            elif k in padrao and isinstance(padrao[k], int) and v is not True:
                v = int(v)
            o[k] = v
        i += 1
    return o


def obj(nome, obrigatorio=True):
    o = bpy.data.objects.get(nome)
    if o is None and obrigatorio:
        sys.exit(f'ERRO: a cena não tem o objeto "{nome}" (ver a convenção no topo de fonte/_blender.py)')
    return o


def colecao(nome, obrigatorio=True):
    c = bpy.data.collections.get(nome)
    if c is None and obrigatorio:
        sys.exit(f'ERRO: a cena não tem a coleção "{nome}" (ver a convenção no topo de fonte/_blender.py)')
    return c


def camada(nome):
    """a LayerCollection da coleção na camada de visualização atual"""
    def acha(lc):
        if lc.collection.name == nome:
            return lc
        for f in lc.children:
            r = acha(f)
            if r:
                return r
    return acha(bpy.context.view_layer.layer_collection)


def exclui(nome, sim=True):
    lc = camada(nome)
    if lc:
        lc.exclude = sim


def cycles(amostras, ruido=True):
    """Cycles na GPU quando houver (OptiX, CUDA, HIP, Metal ou oneAPI); senão, CPU. AgX, como no site."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = amostras
    sc.cycles.use_denoising = ruido
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    sc.display_settings.display_device = 'sRGB'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for tipo in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = tipo
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == tipo]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == tipo
                sc.cycles.device = 'GPU'
                print(f'Cycles na GPU ({tipo}: {", ".join(d.name for d in gpus)})')
                return
        except TypeError:
            continue
    sc.cycles.device = 'CPU'
    print('Cycles na CPU (nenhuma GPU compatível): vai demorar bem mais')


def png(caminho, rgba=False, bits='8'):
    sc = bpy.context.scene
    f = sc.render.image_settings
    f.file_format = 'PNG'
    f.color_mode = 'RGBA' if rgba else 'RGB'
    f.color_depth = bits
    f.compression = 15
    sc.render.filepath = caminho
    os.makedirs(os.path.dirname(caminho), exist_ok=True)


def resolucao(w, h, pct=100):
    r = bpy.context.scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, pct
    r.pixel_aspect_x = r.pixel_aspect_y = 1


def renderiza(caminho):
    bpy.context.scene.render.filepath = caminho
    bpy.ops.render.render(write_still=True)
    print('ok', caminho)


# ---------- câmera → pose do site (eixos do glTF: x, z, -y do Blender) ----------
def gltf(v):
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def alvo_de(cam):
    for c in cam.constraints:
        if c.type in ('TRACK_TO', 'DAMPED_TRACK', 'LOCKED_TRACK') and c.target:
            return c.target.matrix_world.translation.copy()
    return None


def pose(cam, ref=Matrix.Identity(4), dist=10.0):
    """{loc, alvo, lente, sx, sy} da câmera, no espaço de `ref` (a âncora da maquete; identidade = o mundo)"""
    d = cam.data
    if d.sensor_fit not in ('AUTO', 'HORIZONTAL') or abs(d.sensor_width - 36) > 1e-3:
        print(f'aviso: {cam.name} deveria ter sensor de 36 mm na largura (Sensor Fit: Auto)')
    inv = ref.inverted()
    mw = cam.matrix_world
    loc = mw.translation
    alvo = alvo_de(cam)
    if alvo is None:
        alvo = loc + (mw.to_quaternion() @ Vector((0, 0, -1))) * dist
    return {
        'loc': gltf(inv @ loc),
        'alvo': gltf(inv @ alvo),
        'lente': round(d.lens, 4),
        'sx': round(d.shift_x, 4),
        'sy': round(d.shift_y, 4),
    }


def avalia_restricoes():
    bpy.context.view_layer.update()
