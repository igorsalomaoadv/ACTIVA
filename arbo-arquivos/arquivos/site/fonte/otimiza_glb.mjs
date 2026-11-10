// .glb assado no Blender (fonte/render/glb/<tipologia>.glb, saído de exporta_glb.py) → public/modelos/<tipologia>-4096.glb
// e -2048.glb: texturas em WebP no tamanho da versão, malha comprimida (meshopt) e quantizada.
// O site escolhe a versão pela tela (2048 no celular). Os materiais continuam sem luz (KHR_materials_unlit).
// Uso: npm run otimiza:glb
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { precisa, RENDER, PUBLIC } from './_deps.mjs';

// o pacote não exporta o bin: o caminho é direto em node_modules
const cli = fileURLToPath(new URL('../node_modules/@gltf-transform/cli/bin/cli.js', import.meta.url));
if (!fs.existsSync(cli)) await precisa('@gltf-transform/cli-ausente'); // explica como instalar e sai
const roda = (...a) => {
  const r = spawnSync(process.execPath, [cli, ...a], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
};
let algum = false;
for (const tip of ['tipo', 'cobertura']) {
  const o = `${RENDER}glb/${tip}.glb`;
  if (!fs.existsSync(o)) continue;
  algum = true;
  for (const lado of [4096, 2048]) {
    const d = `${PUBLIC}modelos/${tip}-${lado}.glb`;
    // sem simplificar nem soldar: a malha já sai limpa do Blender e o UV do atlas não pode mudar
    roda('optimize', o, d, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(lado), '--simplify', 'false', '--weld', 'false', '--instance', 'false', '--flatten', 'false', '--join', 'false');
    console.log(`${d}: ${(fs.statSync(d).size / 1024).toFixed(0)} KB`);
  }
}
if (!algum) console.log('nenhum .glb em fonte/render/glb/ (rode antes: npm run blender -- exporta_glb.py)');
