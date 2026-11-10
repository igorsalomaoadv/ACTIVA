// Renders e fotos (fonte/render/) → as imagens do site em public/img/ e o public/img/assets.json.
// Cada peça é opcional: o que não estiver em fonte/render/ fica como está em public/ (e o site tem reserva para
// placa, clipe e modelo 3D ausentes). Nunca amplia: uma foto menor que o tamanho pedido sai no tamanho dela.
//
// fonte/render/                          → public/
//   hero/base.png, hero/acesa.png        → img/hero/base-2560|1280.webp, acesa-2560|1280.webp (2560×1440)
//   placa/regiao.json + Nx-base|acesa.png → img/placa/Nx-base|acesa-<faixa>.webp e img/hero/torre-*.webp (N = 2, 4, 8)
//   <tipologia>/corte.png               → img/<tipologia>/corte-2880|1440.webp (render de 3200×1800)
//   fotos/<tipologia>/<comodo>.png      → img/<tipologia>/<comodo>-1672|960.webp (tipologia = tipo, cobertura)
//   fotos/lazer/<nome>.png              → img/lazer/<nome>-1672|960.webp
//   fotos/predio/fachada.png            → img/predio/fachada-1920|960.webp
// Os ids (mapa dos andares) saem por `npm run andares`; o clipe, por `npm run clipe`.
// Uso: npm run otimiza
import fs from 'node:fs';
import path from 'node:path';
import { precisa, RENDER, PUBLIC } from './_deps.mjs';

const sharp = await precisa('sharp');
const QUALIDADE = 84;
const FAIXA = 240; // altura de cada faixa da placa, em pixels do hero
const SOBRA = 2; // pixels do hero repetidos embaixo de cada faixa (a emenda fica sob a faixa de cima)
const existe = (p) => fs.existsSync(p);
const IMG = `${PUBLIC}img/`;
const feitos = [];

async function webp(origem, destino, largura) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const { width } = await sharp(origem).metadata();
  await sharp(origem).resize({ width: Math.min(largura, width), kernel: 'lanczos3' }).webp({ quality: QUALIDADE, effort: 6 }).toFile(destino);
  feitos.push(path.relative(PUBLIC, destino));
}

// ---------- hero ----------
for (const passe of ['base', 'acesa']) {
  const o = `${RENDER}hero/${passe}.png`;
  if (!existe(o)) continue;
  for (const w of [2560, 1280]) await webp(o, `${IMG}hero/${passe}-${w}.webp`, w);
}

// ---------- placa (a torre em alta para o zoom do clique) ----------
const assetsArq = `${IMG}assets.json`;
const assets = existe(assetsArq) ? JSON.parse(fs.readFileSync(assetsArq, 'utf8')) : {};
if (existe(`${RENDER}placa/regiao.json`)) {
  const regiao = JSON.parse(fs.readFileSync(`${RENDER}placa/regiao.json`, 'utf8')).regiao; // [x0, y0, x1, y1] no hero
  const [x0, y0, x1, y1] = regiao;
  const niveis = {};
  for (const n of [2, 4, 8]) {
    const arqs = ['base', 'acesa'].map((p) => `${RENDER}placa/${n}x-${p}.png`);
    if (!arqs.every(existe)) continue;
    const faixas = [];
    for (let y = y0; y < y1; y += FAIXA) faixas.push({ x0, y0: y, y1: Math.min(y + FAIXA, y1) });
    for (const [k, passe] of ['base', 'acesa'].entries()) {
      const img = sharp(arqs[k]);
      const { width, height } = await img.metadata();
      if (width !== (x1 - x0) * n || height !== (y1 - y0) * n) throw new Error(`${arqs[k]}: ${width}×${height}, esperado ${(x1 - x0) * n}×${(y1 - y0) * n}`);
      for (const [i, f] of faixas.entries()) {
        const topo = (f.y0 - y0) * n;
        const alt = Math.min((f.y1 - f.y0 + SOBRA) * n, height - topo);
        const destino = `${IMG}placa/${n}x-${passe}-${i}.webp`;
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        await sharp(arqs[k]).extract({ left: 0, top: topo, width, height: alt }).webp({ quality: QUALIDADE, effort: 6 }).toFile(destino);
        feitos.push(path.relative(PUBLIC, destino));
      }
      // a torre inteira em 2×: a fachada parada em telas com mais pixels que o hero
      if (n === 2) {
        await sharp(arqs[k]).webp({ quality: QUALIDADE, effort: 6 }).toFile(`${IMG}hero/torre-${passe}.webp`);
        feitos.push(`img/hero/torre-${passe}.webp`);
      }
    }
    niveis[n] = { arquivo: `/img/placa/${n}x-{passe}-{i}.webp`, faixas };
  }
  if (Object.keys(niveis).length) {
    assets.placa = { regiao, niveis };
    if (niveis[2]) assets.torre = { regiao, base: '/img/hero/torre-base.webp', acesa: '/img/hero/torre-acesa.webp' };
  }
}

// ---------- cortes e fotos ----------
for (const tip of ['tipo', 'cobertura']) {
  const c = `${RENDER}${tip}/corte.png`;
  if (existe(c)) for (const w of [2880, 1440]) await webp(c, `${IMG}${tip}/corte-${w}.webp`, w);
  const dir = `${RENDER}fotos/${tip}/`;
  if (!existe(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
    const id = f.replace(/\.[^.]+$/, '');
    for (const w of [1672, 960]) await webp(dir + f, `${IMG}${tip}/${id}-${w}.webp`, w);
    ((assets.fotos ??= {})[tip] ??= {})[id] = 'foto';
  }
}
if (existe(`${RENDER}fotos/lazer/`)) {
  for (const f of fs.readdirSync(`${RENDER}fotos/lazer/`).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
    const id = f.replace(/\.[^.]+$/, '');
    for (const w of [1672, 960]) await webp(`${RENDER}fotos/lazer/${f}`, `${IMG}lazer/${id}-${w}.webp`, w);
    (assets.lazer ??= {})[id] = true;
  }
}
const fach = ['png', 'jpg', 'webp'].map((e) => `${RENDER}fotos/predio/fachada.${e}`).find(existe);
if (fach) for (const w of [1920, 960]) await webp(fach, `${IMG}predio/fachada-${w}.webp`, w);

// ---------- clipe ----------
for (const k of ['ida', 'volta']) {
  if (existe(`${PUBLIC}video/cobertura-${k}.mp4`)) (assets.video ??= {})[k] = `/video/cobertura-${k}.mp4`;
}

fs.writeFileSync(assetsArq, JSON.stringify(assets, null, 1));
console.log(feitos.length ? `${feitos.length} imagens:\n  ${feitos.join('\n  ')}` : 'nada em fonte/render/ para otimizar');
console.log('assets.json atualizado');
