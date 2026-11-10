# O voo da cobertura: 78 quadros a 60 fps (1,3 s), da fachada (Cam_Hero) até a cobertura vista de cima, na
# mesma câmera do corte (Ancora_cobertura + Cam_cobertura_corte), com o teto. O site toca esse clipe quando o
# visitante clica no 21º andar e dissolve o último quadro na maquete 3D sem teto.
# Câmera parada do quadro 1 ao 8, andando do 8 ao 74 e parada até o 78 (CLIPE_T0/T1 em src/motion/explorador/index.js).
# Se a cena tiver uma câmera animada Cam_Clipe, ela é usada como está; senão, este script cria o voo.
# Uso (da pasta do site):
#   npm run blender -- clipe.py                     os 78 quadros, 1920×1080, 256 amostras
#   opções: --amostras 256  --de 1 --ate 78  --cena outra.blend
# Quadros que já existem são pulados: se o render parar no meio, rode de novo e ele continua de onde parou.
# Saída em fonte/render/clipe/0001.png …; depois: npm run clipe && npm run otimiza.
import math
import os
import sys

import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _blender as B

o = B.args({'amostras': 256, 'de': 1, 'ate': 78})
sc = bpy.context.scene
B.avalia_restricoes()
cam = B.obj('Cam_Clipe', obrigatorio=False)
if cam is None:
    hero = B.obj('Cam_Hero')
    fim_cam = B.obj('Cam_cobertura_corte')
    ancora = B.obj('Ancora_cobertura')
    # a pose final no mundo: a câmera do corte (no espaço da maquete) levada para a âncora na torre
    m_fim = ancora.matrix_world @ fim_cam.matrix_world
    m_ini = hero.matrix_world.copy()
    dados = hero.data.copy()
    cam = bpy.data.objects.new('Cam_Clipe', dados)
    sc.collection.objects.link(cam)
    l0, r0, _ = m_ini.decompose()
    l1, r1, _ = m_fim.decompose()
    suave = lambda u: u * u * u * (u * (6 * u - 15) + 10)  # sem tranco no começo e no fim
    for f in range(1, 79):
        u = suave(min(max((f - 8) / (74 - 8), 0), 1))
        loc = l0.lerp(l1, u)
        loc.z += math.sin(u * math.pi) * 0.12 * (l1 - l0).length  # arco: sobe por cima, não corta em linha reta
        cam.matrix_world = Matrix.LocRotScale(loc, r0.slerp(r1, u), None)
        cam.data.lens = hero.data.lens + (fim_cam.data.lens - hero.data.lens) * u
        cam.data.shift_x = hero.data.shift_x + (fim_cam.data.shift_x - hero.data.shift_x) * u
        cam.keyframe_insert('location', frame=f)
        cam.keyframe_insert('rotation_euler', frame=f)
        cam.data.keyframe_insert('lens', frame=f)
        cam.data.keyframe_insert('shift_x', frame=f)
    print('Cam_Clipe criada (voo automático da fachada até a cobertura)')

sc.camera = cam
B.exclui('Acesas', True)  # o clipe parte do quadro do hero (passe base)
B.exclui('Mascaras', True)  # as máscaras dos andares só servem para o passe ids
for nome in B.TIPOLOGIAS.values():  # as maquetes cortadas não aparecem na torre
    B.exclui(nome, True)
B.cycles(o['amostras'])
B.resolucao(1920, 1080)
sc.render.fps = 60
sc.frame_start, sc.frame_end = o['de'], o['ate']
pasta = os.path.join(B.RENDER, 'clipe')
os.makedirs(pasta, exist_ok=True)
B.png(os.path.join(pasta, '####'))
sc.render.use_overwrite = False  # continua de onde parou
sc.render.use_placeholder = True
bpy.ops.render.render(animation=True)
print('ok', pasta)
