// Mapa de IDs → public/img/hero/andares.json e os ids-2560.png / ids-1280.png que o site lê.
// Entrada: fonte/render/hero/ids.png (2560×1440), saído de `npm run blender -- hero.py --passe ids`.
// Cor de cada andar: R = número do andar (2 a 21), G = 0, B = 255; preto = fora das unidades. Sem antisserrilhado.
// Uso: npm run andares   (ou: node fonte/andares.mjs [ids.png])
import fs from 'node:fs';
import { precisa, RENDER, PUBLIC } from './_deps.mjs';

const sharp = await precisa('sharp');
const entrada = process.argv[2] ?? `${RENDER}hero/ids.png`;
const { data, info } = await sharp(entrada).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
if (W !== 2560 || H !== 1440) console.warn(`aviso: o mapa tem ${W}×${H}; o site espera 2560×1440`);

const acc = new Map();
let sujos = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r === 0 && g === 0 && b === 0) continue;
    if (g !== 0 || b !== 255 || r < 1) { sujos++; continue; }
    let a = acc.get(r);
    if (!a) acc.set(r, (a = { x0: W, y0: H, x1: 0, y1: 0, sx: 0, sy: 0, n: 0 }));
    if (x < a.x0) a.x0 = x;
    if (y < a.y0) a.y0 = y;
    if (x + 1 > a.x1) a.x1 = x + 1;
    if (y + 1 > a.y1) a.y1 = y + 1;
    a.sx += x; a.sy += y; a.n++;
  }
}
if (sujos) console.warn(`aviso: ${sujos} pixels com cor fora do código (borda antisserrilhada?). Renderize o passe ids com 1 amostra e filtro 0.`);

const r1 = (v) => Math.round(v * 10) / 10;
const andares = {};
for (const [andar, a] of [...acc].sort((p, q) => p[0] - q[0])) {
  andares[andar] = { caixa: [a.x0, a.y0, a.x1, a.y1], centro: [r1(a.sx / a.n), r1(a.sy / a.n)], area: a.n };
}
const json = {
  res: [W, H],
  origem: 'canto superior esquerdo; x1 e y1 exclusivos',
  cor: 'R = andar, G = 0, B = 255; preto = fora das unidades',
  andares,
};
const destino = `${PUBLIC}img/hero/`;
fs.mkdirSync(destino, { recursive: true });
// o centro sempre com uma casa decimal (849.0), como no arquivo original
const texto = JSON.stringify(json, (k, v) => (k === 'centro' ? v.map((n) => `#${n.toFixed(1)}#`) : v), 1).replace(/"#([\d.]+)#"/g, '$1');
fs.writeFileSync(`${destino}andares.json`, texto);
// a cópia em 2560 e a metade em 1280 (vizinho mais próximo: nenhuma cor nova na borda)
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(`${destino}ids-2560.png`);
await sharp(data, { raw: info }).resize(W / 2, H / 2, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toFile(`${destino}ids-1280.png`);
console.log(`andares.json: ${acc.size} andares (${[...acc.keys()].sort((p, q) => p - q).join(', ')})`);
