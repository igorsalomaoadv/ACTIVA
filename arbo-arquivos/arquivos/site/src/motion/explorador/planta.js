// Planta: o corte da tipologia enquadrado à esquerda (ou em cima, no celular), os pontos dos cômodos projetados do
// Blender (hotspots.json, em fração da imagem) e o card com os dados da unidade.
import { ANDARES, STATUS, TIPOLOGIAS } from '../../data/unidades.js';
import { aplica, encaixa } from './enquadra.js';

// tamanho lógico do corte (o bloco da cena): os pontos e o FOCO são frações dele. A imagem pode ter mais pixels
// (os cortes saem em 2880 e 1440 do otimiza.mjs) e é escolhida pela densidade da tela.
export const CORTE = [1600, 900];
// retângulo que a maquete ocupa no corte (fração da imagem): é o que tem de caber na área livre do palco
const FOCO = {
  tipo: { x0: 0.07, y0: 0.16, x1: 0.715, y1: 0.84 },
  cobertura: { x0: 0.08, y0: 0.15, x1: 0.695, y1: 0.84 },
};

export function criaPlanta(raiz, { movel, onComodo }) {
  const palco = raiz.querySelector('.palco');
  const camada = raiz.querySelector('.planta');
  const vista = raiz.querySelector('.planta__vista');
  const zoom = raiz.querySelector('.planta__zoom');
  const cena = raiz.querySelector('.planta__cena');
  const corte = raiz.querySelector('.planta__corte');
  const pontos = raiz.querySelector('.planta__pontos');
  const card = raiz.querySelector('.planta__card');
  const lista = card.querySelector('.planta__comodos');

  cena.style.width = `${CORTE[0]}px`;
  cena.style.height = `${CORTE[1]}px`;

  let hotspots = null;
  const carregaHotspots = fetch('/img/hotspots.json').then((r) => r.json()).then((j) => (hotspots = j)).catch(() => (hotspots = {}));

  let t = { x: 0, y: 0, s: 1 };
  let tipologia = 'tipo';
  let andar = 14;
  // a largura do corte em pixels do aparelho decide a versão: acima de ~1600, a de 2880
  const largura = () => (CORTE[0] * t.s * Math.min(devicePixelRatio || 1, 3) > 1600 ? 2880 : 1440);

  function area() {
    const w = palco.clientWidth;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 70;
    if (movel()) {
      const vh = vista.clientHeight;
      return { x: 6, y: navH + 4, w: w - 12, h: vh - navH - 10 };
    }
    const m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--margem')) || 32;
    const cw = card.offsetWidth || 360;
    return { x: m, y: navH + 24, w: w - cw - m * 3.2, h: palco.clientHeight - navH - m * 1.6 - 24 };
  }

  function ajusta() {
    t = encaixa(CORTE[0], CORTE[1], area(), FOCO[tipologia], movel() ? 0.6 : 1.2);
    aplica(cena, t);
    cena.style.setProperty('--inv', 1 / t.s);
  }

  function preenche(novoAndar) {
    andar = novoAndar;
    const u = ANDARES[andar];
    tipologia = u.tipologia;
    const tip = TIPOLOGIAS[tipologia];
    camada.dataset.tipologia = tipologia;
    palco.style.setProperty('--fundo-corte', tip.corte.fundo);
    corte.alt = `Maquete cortada: ${tip.nome.toLowerCase()} do ${andar}º andar, sem teto, com os móveis`;

    const q = (s) => card.querySelector(s);
    q('.planta__andar').innerHTML = `${andar}º andar <span class="selo" data-status="${u.status}"><i></i><b>${STATUS[u.status]}</b></span>`;
    q('.planta__nome').textContent = tip.titulo(andar);
    q('.planta__numeros').innerHTML = tip.numeros.map(([n, r]) => `<div><dt>${r}</dt><dd>${n}</dd></div>`).join('');
    q('.planta__preco').textContent = u.status === 'vendido' ? 'Unidade vendida' : u.preco;
    q('.planta__texto').textContent = tip.texto;

    lista.innerHTML = '';
    pontos.innerHTML = '';
    const hs = hotspots?.[tipologia] ?? {};
    tip.comodos.forEach(([id, nome], i) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" data-comodo="${id}"><span class="planta__n">${String(i + 1).padStart(2, '0')}</span>${nome}<span class="planta__seta" aria-hidden="true">→</span></button>`;
      lista.append(li);
      const p = hs[id];
      if (!p) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ponto';
      b.dataset.comodo = id;
      b.style.left = `${p[0] * CORTE[0]}px`;
      b.style.top = `${p[1] * CORTE[1]}px`;
      b.setAttribute('aria-label', `Ver fotos: ${nome}`);
      b.innerHTML = `<span class="ponto__alvo"><i></i></span><span class="ponto__rotulo">${nome}</span>`;
      pontos.append(b);
    });
    ajusta();
    const src = `${tip.corte.img}-${largura()}.webp`;
    if (!corte.src.endsWith(src)) corte.src = src;
    return corte.decode().catch(() => {});
  }

  // destaque cruzado: ponto ↔ item da lista
  const destaca = (id) => {
    raiz.querySelectorAll('.ponto, .planta__comodos button').forEach((el) => el.classList.toggle('ativo', el.dataset.comodo === id));
  };
  const sobre = (e) => {
    const el = e.target.closest('[data-comodo]');
    destaca(el ? el.dataset.comodo : null);
  };
  for (const alvo of [pontos, lista]) {
    alvo.addEventListener('pointerover', sobre);
    alvo.addEventListener('pointerleave', () => destaca(null));
    alvo.addEventListener('focusin', sobre);
    alvo.addEventListener('click', (e) => {
      const el = e.target.closest('[data-comodo]');
      if (el) onComodo(el.dataset.comodo);
    });
  }

  /** âncoras 3D projetadas a cada quadro: { id: [x, y] } em pixels do palco → posição dentro do bloco da cena */
  function moveAncoras(ps) {
    for (const b of pontos.children) {
      const p = ps[b.dataset.comodo];
      if (!p) continue;
      b.style.left = `${((p[0] - t.x) / t.s).toFixed(1)}px`;
      b.style.top = `${((p[1] - t.y) / t.s).toFixed(1)}px`;
    }
  }

  /** a vinheta do fundo, centrada na maquete (na imagem fixa ela vinha do render, em volta do mesmo ponto) */
  function poeVinheta() {
    const fo = FOCO[tipologia];
    const cx = t.x + ((fo.x0 + fo.x1) / 2) * CORTE[0] * t.s;
    const cy = t.y + ((fo.y0 + fo.y1) / 2) * CORTE[1] * t.s;
    camada.style.setProperty('--vx', `${cx.toFixed(0)}px`);
    camada.style.setProperty('--vy', `${cy.toFixed(0)}px`);
    camada.style.setProperty('--vr', `${(855 * t.s).toFixed(0)}px`);
  }

  return {
    moveAncoras,
    poeVinheta,
    carregaHotspots,
    preenche,
    ajusta,
    get t() { return t; },
    get tipologia() { return tipologia; },
    get andar() { return andar; },
    /** centro da maquete, em fração do quadro do corte */
    focoFrac(tip = tipologia) {
      const fo = FOCO[tip];
      return [(fo.x0 + fo.x1) / 2, (fo.y0 + fo.y1) / 2];
    },
    /** centro da maquete no palco (para onde a fachada aproxima) */
    centroFoco() {
      const fo = FOCO[tipologia];
      return [t.x + ((fo.x0 + fo.x1) / 2) * CORTE[0] * t.s, t.y + ((fo.y0 + fo.y1) / 2) * CORTE[1] * t.s];
    },
    /** a maquete no palco: centro e largura (onde a transição encaixa a laje do andar) */
    focoTela() {
      const fo = FOCO[tipologia];
      const [fx, fy] = this.centroFoco();
      return { fx, fy, mw: (fo.x1 - fo.x0) * CORTE[0] * t.s, mh: (fo.y1 - fo.y0) * CORTE[1] * t.s };
    },
    pontos,
    /** posição do hotspot no palco (o centro da tela se o cômodo não tiver ponto) */
    pontoDe(id) {
      const p = hotspots?.[tipologia]?.[id];
      if (!p) return [palco.clientWidth / 2, palco.clientHeight / 2];
      return [t.x + p[0] * CORTE[0] * t.s, t.y + p[1] * CORTE[1] * t.s];
    },
    zoom,
    card,
    camada,
  };
}
