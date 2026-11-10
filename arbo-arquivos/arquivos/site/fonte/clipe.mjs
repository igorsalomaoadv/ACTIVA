// Quadros do voo da cobertura (fonte/render/clipe/0001.png …, saídos de clipe.py) → public/video/cobertura-ida.mp4
// e cobertura-volta.mp4 (os mesmos quadros de trás para a frente). H.264, 1920×1080, 60 fps, sem áudio.
// O site espera 78 quadros: a câmera parada do 1 ao 8, andando do 8 ao 74 e parada de novo até o 78
// (CLIPE_T0 e CLIPE_T1 em src/motion/explorador/index.js; mude lá se o seu voo tiver outros marcos).
// Uso: npm run clipe
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { precisa, RENDER, PUBLIC } from './_deps.mjs';

const ffmpeg = await precisa('ffmpeg-static');
const dir = `${RENDER}clipe/`;
const quadros = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort() : [];
if (!quadros.length) {
  console.error('nenhum quadro em fonte/render/clipe/ (rode antes: npm run blender -- clipe.py)');
  process.exit(1);
}
if (quadros.length !== 78) console.warn(`aviso: ${quadros.length} quadros; o site foi acertado para 78 (ver CLIPE_T0/CLIPE_T1)`);
const primeiro = parseInt(quadros[0], 10);
const digitos = quadros[0].replace(/\.png$/, '').length;
fs.mkdirSync(`${PUBLIC}video`, { recursive: true });
for (const [nome, filtro] of [['ida', 'null'], ['volta', 'reverse']]) {
  const saida = `${PUBLIC}video/cobertura-${nome}.mp4`;
  const r = spawnSync(ffmpeg, ['-y', '-v', 'error', '-framerate', '60', '-start_number', String(primeiro), '-i', `${dir}%0${digitos}d.png`,
    '-vf', `scale=1920:1080:flags=lanczos,${filtro}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-g', '600', '-r', '60', '-an', '-movflags', '+faststart', saida], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
  console.log(`${saida}: ${(fs.statSync(saida).size / 1024).toFixed(0)} KB`);
}
console.log('depois: npm run otimiza (o assets.json passa a apontar o clipe)');
