# Refazer o prédio (o caminho do Blender)

Este é o caminho para trocar o **prédio** da Arbo por outro: a fachada do hero, o mapa dos andares, a torre em alta do zoom, as maquetes cortadas em 3D, as fotos dos cômodos e o voo até a cobertura. Tudo isso é render de uma cena 3D; não se edita por prompt nem por cima da imagem. Para trocar só textos, preços, status dos andares ou fotos, este arquivo não é necessário (ver "Antes de começar").

## Como a demo foi feita (e o que estes scripts refazem)

Conferido nos próprios arquivos da demo:

| peça do site | como foi feita | arquivos |
|---|---|---|
| Fachada do hero | render do Blender (Cycles, tom AgX), 2560×1440, em dois passes: **base** (alguns andares acesos) e **acesa** (todos acesos; o site recorta o andar do hover dela) | `public/img/hero/base-*.webp`, `acesa-*.webp` |
| Mapa dos andares | o mesmo quadro, com cada andar pintado de uma cor chapada (R = número do andar, G = 0, B = 255), sem luz e sem antisserrilhado | `public/img/hero/ids-*.png`, `andares.json` |
| Torre em alta (zoom do clique) | a região da torre renderizada 2×, 4× e 8× maior, com a mesma câmera, cortada em 5 faixas | `public/img/placa/`, `hero/torre-*.webp`, `assets.json` |
| Maquete 3D | cada tipologia assada no Cycles em dois atlas de 4096 (casco e itens), com material sem luz, comprimida com glTF-Transform (meshopt e WebP) em duas versões, 4096 e 2048 | `public/modelos/*.glb` |
| Câmeras da maquete | a vista de frente (a mesma câmera do hero, vista do andar), a do corte e uma por cômodo: lente em mm, sensor de 36 mm, shift | `public/modelos/*.json` |
| Pontos da planta | os pontos dos cômodos projetados pela câmera do corte | `public/img/hotspots.json` |
| Planta fixa (reserva sem 3D) | o corte renderizado em 3200×1800 | `public/img/<tipologia>/corte-*.webp` |
| Fotos dos cômodos | render do Blender no olhar de cada cômodo, refeito como fotografia num gerador de imagem (saída de 1672×941), sem ampliar | `public/img/<tipologia>/<comodo>-*.webp` |
| Voo da cobertura | 78 quadros a 60 fps (1,3 s) renderizados no Blender, da fachada até a cobertura vista de cima, em H.264; a volta é o mesmo voo de trás para a frente | `public/video/cobertura-*.mp4` |

Os scripts desta pasta refazem cada passo e geram os arquivos **no mesmo formato** que o site lê. Foram conferidos contra os arquivos da demo: `andares.mjs` e `hotspots.mjs` refazem `andares.json`, `ids-1280.png` e `hotspots.json` idênticos, byte a byte; `otimiza.mjs` corta a placa nas mesmas faixas e escreve o mesmo manifesto; `clipe.mjs` monta a ida e a volta com os mesmos 78 quadros; `otimiza_glb.mjs` sai com as mesmas extensões e praticamente o mesmo peso. O arquivo `.blend` da demo não vem no pacote: o prédio novo é o seu (ou o do seu arquiteto).

## Antes de começar: é pesado

**Renderizar é pesado.** Dependendo do computador, o conjunto inteiro leva **horas**, e num notebook sem placa de vídeo pode passar de um dia. O que mais pesa:

| passo | tamanho | peso relativo |
|---|---|---|
| hero (base + acesa) | 2 × 2560×1440 | 2 |
| placa 2×, 4× e 8× (base + acesa) | 6 imagens; só a de 8× tem 4160×9600 por passe | ~28 |
| voo da cobertura | 78 quadros de 1920×1080 | ~44 |
| corte e cômodos | 2 × 3200×1800 + 11 × 1672×941 | ~8 |
| maquete 3D (assar os atlas) | 4 atlas de 4096×4096 | ~18 |

**A conta que vale para o seu computador:** renderize primeiro só o passe base do hero com as amostras finais e anote o tempo (T). O conjunto inteiro custa perto de **100 × T**. Exemplo: se o passe base levou 3 minutos numa placa de vídeo, conte umas 5 horas; se levou 40 minutos no processador, conte uns 3 dias. Por isso:

- Use **placa de vídeo** (NVIDIA, AMD ou Apple Silicon). Os scripts escolhem a GPU sozinhos; no processador, avisam que vai demorar.
- Faça tudo primeiro com **poucas amostras** (`--amostras 16`) para acertar câmera, luz e enquadramento. Só no fim rode com as amostras finais.
- Deixe o computador ligado na tomada, sem suspender. No Mac, ponha `caffeinate -i` na frente do comando (`caffeinate -i npm run blender -- hero.py`); no Windows, em Configurações › Sistema › Energia, ponha "Suspender" em "Nunca" enquanto renderiza. Um render parado no meio pode ser retomado: o `clipe.py` pula os quadros que já existem.
- Memória: com 16 GB de RAM ou mais, tudo cabe. Com 8 GB, a placa de 8× (4160×9600) e os atlas de 4096 podem travar: faça a placa só em 2× e 4× (`--placa 2,4`) e a maquete com `--lado 2048`.
- Para ter uma ideia: num computador de nuvem fraco (4 núcleos de processador, sem placa de vídeo), com a cena de exemplo e pouquíssimas amostras, o passe base do hero levou 0,5 min, a placa de 8× levou 6 a 8 min por passe e os 78 quadros do voo, uns 16 min. Uma cena de verdade, com as amostras finais, leva muitas vezes mais.
- Cada passo é independente. Dá para refazer só a fachada hoje e o voo outro dia.

**Caminhos sem Blender** (o site já tem reserva para cada peça que faltar):

| quero… | sem Blender | o que o site faz |
|---|---|---|
| a fachada do meu prédio | uma imagem 2560×1440 do prédio (render do arquiteto) em `fonte/render/hero/base.png` e `acesa.png` (a mesma imagem, ou uma com todos os andares acesos), e o mapa dos andares **pintado à mão** num editor de imagem: cada andar preenchido com a cor `rgb(<andar>, 0, 255)`, o resto preto, sem suavizar a borda; salve em `fonte/render/hero/ids.png` | hover e clique por andar funcionam iguais |
| sem a torre em alta | não gerar a placa (apague `placa` e `torre` do `assets.json`) | o zoom do clique fica um pouco macio |
| sem o voo da cobertura | apague `video` do `assets.json` | a cobertura abre com o mesmo mergulho dos outros andares |
| sem maquete 3D | apague `public/modelos/*.glb` e mantenha os `.json` | a planta mostra a imagem fixa do corte inclinada (a mesma de quem não tem WebGL) |
| fotos dos cômodos | renders ou fotos do decorado em 16:9, 1672 px de largura ou mais, em `fonte/render/fotos/<tipologia>/<comodo>.png` | a galeria usa as suas |

Depois de qualquer troca: `npm run andares` (se mudou o mapa) e `npm run otimiza`.

## 0. Instalar

1. **Blender 5.2 LTS** (gratuito): baixe em <https://www.blender.org/download/lts/5-2/>.
   - Mac: abra o `.dmg` e arraste o Blender para Aplicativos.
   - Windows: rode o instalador `.msi` (fica em `C:\Program Files\Blender Foundation\Blender 5.2\`).
   - Linux: descompacte o `.tar.xz` e aponte o caminho: `export BLENDER_BIN=/caminho/blender-5.2.x-linux-x64/blender`.
   - Em outro lugar? Diga onde: `BLENDER_BIN="/caminho/do/blender" npm run blender -- ...`.
   - Placa de vídeo: os scripts tentam OptiX, CUDA, HIP, Metal e oneAPI, nessa ordem. No Windows e no Linux, mantenha o driver da placa atualizado.
2. **As ferramentas do pipeline** (uma vez, na pasta do site; o site em si não precisa delas):
   ```bash
   npm i -D -E sharp@0.35.5 @gltf-transform/cli@4.5.1 ffmpeg-static@5.3.0
   ```
3. **Teste a instalação** com a cena de exemplo (um prédio simples que segue a convenção, montado por script em segundos):
   ```bash
   npm run blender -- cena_exemplo.py
   ```
   ```bash
   npm run blender -- hero.py --cena fonte/predio-exemplo.blend --amostras 8
   ```
   Se aparecerem `fonte/render/hero/base.png`, `acesa.png` e `ids.png`, está tudo certo. Abra o `fonte/predio-exemplo.blend` no Blender para ver como a cena precisa estar organizada.
4. **Um gerador de imagem que aceite imagem de referência** (ChatGPT, Codex, Gemini, Midjourney com referência ou outro) para as fotos dos cômodos.

## 1. O modelo do prédio

- **Tem o 3D do arquiteto?** Importe no Blender (Arquivo › Importar: FBX, OBJ, glTF, ou IFC com o complemento Bonsai). SketchUp e Revit exportam FBX. Confira a escala (1 unidade = 1 metro).
- **Não tem?** Modele no Blender a partir da planta, ou peça a um modelador 3D. Para a maquete cortada, o que importa é o andar tipo e a cobertura mobiliados; para a fachada, a torre, a rua e o entorno.
- Salve como `fonte/predio.blend` (ou use `--cena outro.blend` em cada comando, ou a variável `ARBO_BLEND`).

**A convenção da cena** (o que os scripts procuram; detalhes no topo de `fonte/_blender.py`):

| nome no Blender | o que é |
|---|---|
| câmera `Cam_Hero` | a câmera da fachada (o quadro do hero) |
| coleção `Acesas` | as luzes e janelas que acendem todos os andares (fica fora do passe base) |
| coleção `Mascaras` | um objeto por andar, com a propriedade personalizada `andar` (2 a 21): o volume da unidade visto da `Cam_Hero` |
| coleções `Tipo` e `Cobertura` | a maquete cortada de cada tipologia, sem teto, com a origem no meio da laje; cada objeto pode ter a propriedade `grupo`: `casco`, `itens` (o padrão), `vidro`, `cortinas`, `folhas` ou `agua` |
| vazios `Ancora_tipo`, `Ancora_cobertura` | onde a maquete encaixa na torre (o 14º andar e a cobertura) |
| câmeras `Cam_tipo_corte`, `Cam_cobertura_corte` | a vista da planta no site |
| câmeras `Cam_<tipologia>_<comodo>` | o olhar de cada foto (`living`, `cozinha`, `suite_master`, `banho_master`, `home_office`, `varanda`, `terraco`), na altura dos olhos (1,55 m) |
| vazios `Ponto_<tipologia>_<comodo>` | o ponto clicável de cada cômodo na planta |
| câmera `Cam_Clipe` (opcional) | o voo animado até a cobertura; sem ela, `clipe.py` cria um voo suave da `Cam_Hero` até a câmera do corte da cobertura |

As câmeras usam sensor de 36 mm (Sensor Fit: Auto) e podem mirar com a restrição **Track To**; o alvo vira o ponto para onde a câmera olha no site.

## 2. A fachada

```bash
npm run blender -- hero.py --amostras 16
```
Confira `fonte/render/hero/` (enquadramento, luz, o mapa cobrindo cada andar). Com tudo certo, as amostras finais:
```bash
npm run blender -- hero.py --amostras 512
```
```bash
npm run andares
```
A torre em alta para o zoom (o render mais pesado de todos; a região é a caixa da torre no hero, em pixels: `x0,y0,x1,y1`, com uma folga em volta do prédio inteiro):
```bash
npm run blender -- hero.py --placa todas --regiao 1030,120,1550,1320 --amostras 512
```
Para ir aos poucos: `--placa 2`, depois `--placa 4`, depois `--placa 8`.

## 3. As maquetes cortadas

```bash
npm run blender -- modelos.py --amostras 256
```
```bash
npm run hotspots
```
Gera `public/modelos/tipo.json` e `cobertura.json` (as câmeras), o corte em `fonte/render/<tipologia>/corte.png` e um render por cômodo em `fonte/render/fotos-base/<tipologia>/`. O script imprime o **FOCO** de cada tipologia: copie para `FOCO` em `src/motion/explorador/planta.js`.

## 4. As fotos dos cômodos

Para cada render em `fonte/render/fotos-base/<tipologia>/<comodo>.png`:

1. Abra o gerador de imagem, anexe o render e cole o prompt de `fonte/fotos.prompt.txt`, trocando a linha dos materiais pelo que aquele cômodo tem.
2. Confira: o mesmo ângulo, os mesmos móveis nos mesmos lugares, a mesma janela. Se o gerador mudou a planta, gere de novo; a foto precisa bater com o mergulho da câmera no site, que termina exatamente nesse olhar.
3. Salve a melhor em `fonte/render/fotos/<tipologia>/<comodo>.png` (16:9, 1672 px de largura ou mais).

Áreas comuns e o destaque da fachada: `fonte/render/fotos/lazer/lobby.png` e `terraco.png`, `fonte/render/fotos/predio/fachada.png` (um render de perto da fachada, refeito da mesma forma).

```bash
npm run otimiza
```

## 5. A maquete 3D

```bash
npm run blender -- exporta_glb.py --amostras 256
```
```bash
npm run otimiza:glb
```
Assa a luz de cada tipologia em dois atlas (casco e itens) e gera `public/modelos/<tipologia>-4096.glb` e `-2048.glb`. É lento: comece com `--lado 1024 --amostras 32` para conferir e só depois rode o definitivo.

## 6. O voo da cobertura

```bash
npm run blender -- clipe.py --amostras 16
```
```bash
npm run clipe
```
Confira o voo em `public/video/cobertura-ida.mp4`. Com tudo certo, apague `fonte/render/clipe/` e rode de novo com `--amostras 256`, depois `npm run clipe` e `npm run otimiza`. O site espera 78 quadros: câmera parada do 1 ao 8, andando do 8 ao 74, parada até o 78. Outro ritmo? Ajuste `CLIPE_T0` e `CLIPE_T1` em `src/motion/explorador/index.js`.

## 7. O que ajustar no código quando o prédio muda

| quando | onde |
|---|---|
| a torre ficou em outro lugar do quadro | `TORRE_X` em `src/motion/explorador/fachada.js` (centro da torre, em fração da largura) e `HALL` em `src/motion/explorador/index.js` (o hall, em pixels do hero de 2560: é para onde a abertura aproxima) |
| outro número de andares | o laço `for (let andar = 2; andar <= 21; …)` e a cobertura (`andar === 21`) em `src/data/unidades.js`, os textos do `index.html` e as máscaras da cena |
| a maquete ocupa outra área do corte | `FOCO` em `src/motion/explorador/planta.js` (o `modelos.py` imprime os valores) |
| outra largura da laje na vista de frente | `LARGURA_FRENTE` em `src/motion/explorador/index.js` |
| outros cômodos | `comodos` em `src/data/unidades.js` (o nome do arquivo de cada foto é o id do cômodo), as câmeras e os pontos da cena, e `FOCO_X` em `src/motion/explorador/galeria.js` |
| outro fundo do corte | `corte.fundo` em `src/data/unidades.js` e `FUNDO` em `fonte/modelos.py` |

## 8. Conferir

`npm run dev` e, no navegador: passe o mouse nos andares (o recorte aceso cobre o andar certo, sem vazar), clique no 14º (o zoom fica nítido até perto, a laje dissolve na maquete na mesma posição), arraste a maquete, abra as fotos (o mergulho termina no mesmo olhar da foto), volte e clique no 21º (o voo sai do quadro do hero e termina na cobertura vista de cima, e dissolve na maquete sem salto). Repita no celular.
