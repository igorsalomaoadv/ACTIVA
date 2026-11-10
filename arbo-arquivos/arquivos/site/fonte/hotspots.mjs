// Pontos dos cômodos na imagem fixa do corte: public/img/hotspots.json, projetados pela câmera do corte.
// Entrada: public/modelos/<tipologia>.json (a câmera "corte" e os "hotspots" em 3D, saídos de modelos.py).
// A conta é a da câmera do Blender: sensor de 36 mm na largura, lente em mm, shift em fração da largura.
// Uso: npm run hotspots   (ou: node fonte/hotspots.mjs [largura altura] — o tamanho do render do corte, 3200 1800)
import fs from 'node:fs';
import { PUBLIC } from './_deps.mjs';

const [W, H] = process.argv[2] ? [+process.argv[2], +process.argv[3]] : [3200, 1800];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => { const n = Math.hypot(...a); return a.map((v) => v / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const r4 = (v) => Math.round(v * 1e4) / 1e4;

const saida = { res: {} };
for (const tip of ['tipo', 'cobertura']) {
  const arq = `${PUBLIC}modelos/${tip}.json`;
  if (!fs.existsSync(arq)) continue;
  const m = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const c = m.corte;
  const f = norm(sub(c.alvo, c.loc)); // eixos do glTF: y sobe
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const k = c.lente / m.sensor;
  saida.res[tip] = [W, H];
  saida[tip] = {};
  for (const [id, p] of Object.entries(m.hotspots)) {
    const d = sub(p, c.loc);
    const z = dot(d, f);
    saida[tip][id] = [r4(0.5 + (dot(d, r) / z) * k - c.sx), r4(0.5 - ((dot(d, u) / z) * k - c.sy) * (W / H))];
  }
}
fs.writeFileSync(`${PUBLIC}img/hotspots.json`, JSON.stringify(saida, null, 1));
console.log('hotspots.json:', Object.keys(saida).filter((k) => k !== 'res').map((k) => `${k} (${Object.keys(saida[k]).length})`).join(', '));
