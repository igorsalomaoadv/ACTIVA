// Contas de enquadramento. Cada camada do palco (fachada, corte) é um bloco do tamanho natural da imagem,
// posicionado com uma transformação única {x, y, s} (origem no canto superior esquerdo). Tudo o que fica dentro
// dele (passes, máscaras, pontos) herda a mesma transformação e continua alinhado pixel a pixel.
import { gsap } from 'gsap';

export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/** object-fit: cover, com o ponto (fx, fy) da imagem o mais perto possível do centro sem mostrar borda */
export function cobre(iw, ih, W, H, fx = 0.5, fy = 0.5) {
  const s = Math.max(W / iw, H / ih);
  const x = clamp(W / 2 - fx * iw * s, W - iw * s, 0);
  const y = clamp(H / 2 - fy * ih * s, H - ih * s, 0);
  return { x, y, s };
}

/** encaixa o retângulo `foco` (em fração da imagem) dentro de `area` (px do palco), centrado */
export function encaixa(iw, ih, area, foco, sMax = Infinity) {
  const fw = (foco.x1 - foco.x0) * iw;
  const fh = (foco.y1 - foco.y0) * ih;
  const s = Math.min(area.w / fw, area.h / fh, sMax);
  const cx = ((foco.x0 + foco.x1) / 2) * iw;
  const cy = ((foco.y0 + foco.y1) / 2) * ih;
  return { x: area.x + area.w / 2 - cx * s, y: area.y + area.h / 2 - cy * s, s };
}

export const aplica = (el, t) => gsap.set(el, { x: t.x, y: t.y, scale: t.s, transformOrigin: '0 0' });

/** ponto da imagem → palco */
export const naTela = (t, px, py) => [t.x + px * t.s, t.y + py * t.s];
