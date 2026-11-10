// Fachada: passe base no <img>, um recorte do passe aceso por andar (máscara tirada do mapa de IDs) e o card com fio.
// O mapa de IDs (R = andar quando B = 255) é lido uma vez num canvas e vira um Uint8Array do tamanho da imagem:
// o hit-test é um acesso direto a esse array, com o cursor levado para as coordenadas da imagem pela inversa da
// transformação de enquadramento (o mesmo object-fit: cover da camada).
import { gsap } from 'gsap';
import { ANDARES, STATUS, TIPOLOGIAS } from '../../data/unidades.js';
import { aplica, clamp, cobre, naTela } from './enquadra.js';

const ORIGINAL = [2560, 1440];
const TORRE_X = 1300 / 2560; // centro da torre com a lâmina de pedra, em fração da largura
const CARD_MIN = 262; // largura mínima do card do andar no celular

const ESCALA_BORDA = 2; // o contorno do andar é desenhado com o dobro de pixels da cena

/** reduz uma linha a retas, sem sair mais que `tol` pixels dela (Douglas-Peucker) */
function simplifica(pts, tol) {
  const fica = new Uint8Array(pts.length);
  fica[0] = fica[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const [ax, ay] = pts[a];
    const dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const n = Math.hypot(dx, dy) || 1;
    let longe = 0, i = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / n;
      if (d > longe) { longe = d; i = k; }
    }
    if (longe > tol) {
      fica[i] = 1;
      pilha.push([a, i], [i, b]);
    }
  }
  return pts.filter((_, k) => fica[k]);
}

/** contornos de uma máscara binária, como um Path2D de retas (preencher com 'evenodd') */
function tracaContorno(m, w, h) {
  const saem = new Map(); // canto da grade → cantos seguintes, com o miolo da máscara sempre à direita
  const liga = (x0, y0, x1, y1) => {
    const k = y0 * (w + 1) + x0;
    if (saem.has(k)) saem.get(k).push([x1, y1]);
    else saem.set(k, [[x1, y1]]);
  };
  const dentro = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      if (!dentro(x, y - 1)) liga(x, y, x + 1, y);
      if (!dentro(x + 1, y)) liga(x + 1, y, x + 1, y + 1);
      if (!dentro(x, y + 1)) liga(x + 1, y + 1, x, y + 1);
      if (!dentro(x - 1, y)) liga(x, y + 1, x, y);
    }
  }
  const path = new Path2D();
  for (const [inicio, lista] of saem) {
    while (lista.length) {
      const pts = [[inicio % (w + 1), Math.floor(inicio / (w + 1))]];
      let prox = lista.pop();
      let voltas = 0;
      while (prox && voltas++ < 200000) {
        pts.push(prox);
        const k = prox[1] * (w + 1) + prox[0];
        if (k === inicio) break;
        prox = saem.get(k)?.pop();
      }
      if (pts.length < 12) continue; // pixels soltos
      // o laço fechado é partido no ponto mais longe do início, para as duas metades serem simplificadas
      let meio = 1, longe = -1;
      pts.forEach(([x, y], i) => {
        const d = Math.hypot(x - pts[0][0], y - pts[0][1]);
        if (d > longe) { longe = d; meio = i; }
      });
      const a = simplifica(pts.slice(0, meio + 1), 1.25);
      const b = simplifica(pts.slice(meio), 1.25);
      path.moveTo(a[0][0], a[0][1]);
      for (const [x, y] of [...a.slice(1), ...b.slice(1, -1)]) path.lineTo(x, y);
      path.closePath();
    }
  }
  return path;
}

const carregaBitmap = async (url, cru = false) => {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.blob();
  });
  // o mapa de IDs não pode passar por conversão de cor: R tem de chegar intacto
  return createImageBitmap(blob, cru ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : {});
};

export function criaFachada(raiz, { movel }) {
  const palco = raiz.querySelector('.palco');
  const camada = raiz.querySelector('.fachada');
  const cena = raiz.querySelector('.fachada__cena');
  const base = raiz.querySelector('.fachada__base');
  const andaresEl = raiz.querySelector('.fachada__andares');
  const card = raiz.querySelector('.card-andar');
  const fio = raiz.querySelector('.fio');
  const fioLinha = fio.querySelector('.fio__linha');
  const fioPonto = fio.querySelector('.fio__ponto');
  const lista = raiz.querySelector('.fachada__lista');
  const numeros = raiz.querySelector('.fachada__numeros');

  // 2560 quando a tela tem pixels para isso (retina, celular de 3x); 1280 no resto
  const escala = Math.max(innerWidth / ORIGINAL[0], innerHeight / ORIGINAL[1]) * Math.min(devicePixelRatio || 1, 3);
  const RW = escala > 0.62 ? 2560 : 1280;
  const RH = (RW * ORIGINAL[1]) / ORIGINAL[0];
  const f = RW / ORIGINAL[0];
  cena.style.width = `${RW}px`;
  cena.style.height = `${RH}px`;

  let t = { x: 0, y: 0, s: 1 };
  let info = null;
  let mapa = null;
  const camadas = {}; // andar → div com o aceso e o contorno
  const luzes = {}; // andar → o recorte aceso (canvas) e onde ele fica na cena
  let ativo = 0;
  const pos = { ax: 0, ay: 0, left: 0, top: 0, lado: 1 };
  let cardVisivel = false;

  const W = () => palco.clientWidth;
  const H = () => palco.clientHeight;
  const navH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 70;

  function enquadra() {
    t = cobre(RW, RH, W(), H(), TORRE_X, 0.5);
    return t;
  }

  function ajusta() {
    enquadra();
    aplica(cena, t);
    posicionaNumeros();
    if (ativo && cardVisivel) posiciona(ativo, false);
  }

  // ---------- carga ----------
  const pronta = (async () => {
    info = await fetch('/img/hero/andares.json').then((r) => r.json());
    base.src = `/img/hero/base-${RW}.webp`;
    base.width = RW;
    base.height = RH;
    await base.decode();
    ajusta();
  })();

  const mascaras = pronta.then(async () => {
    const [acesa, ids] = await Promise.all([carregaBitmap(`/img/hero/acesa-${RW}.webp`), carregaBitmap(`/img/hero/ids-${RW}.png`, true)]);
    const c = document.createElement('canvas');
    c.width = RW;
    c.height = RH;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ids, 0, 0);
    const d = g.getImageData(0, 0, RW, RH).data;
    mapa = new Uint8Array(RW * RH);
    for (let i = 0, j = 0; i < mapa.length; i++, j += 4) if (d[j + 2] === 255 && d[j + 1] === 0) mapa[i] = d[j];
    ids.close?.();

    const ga = c.getContext('2d', { willReadFrequently: true });
    ga.clearRect(0, 0, RW, RH);
    ga.drawImage(acesa, 0, 0);
    for (let andar = 2; andar <= 21; andar++) camadas[andar] = recorta(andar, ga);
    acesa.close?.();
    mede();
    criaNumeros();
    camada.classList.add('fachada--pronta');
  });

  // ---------- torre em alta na fachada parada (telas com mais pixels que o hero) ----------
  let torreNitida = null;
  async function nitida(torre) {
    if (!torre || escala <= 1.05 || RW < 2560) return;
    const [x0, y0, x1, y1] = torre.regiao;
    const img = new Image();
    img.className = 'fachada__torre';
    img.alt = '';
    img.src = torre.base;
    await img.decode();
    img.style.cssText = `left:${x0 * f}px;top:${y0 * f}px;width:${(x1 - x0) * f}px;height:${(y1 - y0) * f}px`;
    cena.insertBefore(img, andaresEl);
    torreNitida = { img, x: x0 * f, y: y0 * f, w: (x1 - x0) * f, h: (y1 - y0) * f };
    // o hover também: o recorte do passe aceso passa a sair da torre em 2×, com a mesma máscara
    await mascaras;
    const acesa = await carregaBitmap(torre.acesa);
    const K = acesa.width / ((x1 - x0) * f);
    for (const luz of Object.values(luzes)) {
      luz.canvas.width = Math.round(luz.w * K);
      luz.canvas.height = Math.round(luz.h * K);
      const g = luz.canvas.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.scale(K, K);
      g.clip(luz.path, 'evenodd');
      g.drawImage(acesa, x0 * f - luz.x, y0 * f - luz.y, (x1 - x0) * f, (y1 - y0) * f);
    }
    acesa.close?.();
  }

  /** recorte do passe aceso pela máscara do andar, e o contorno fino em volta dela */
  function recorta(andar, ga) {
    const [x0, y0, x1, y1] = info.andares[andar].caixa;
    const pad = 4;
    const bx = Math.max(0, Math.floor(x0 * f) - pad);
    const by = Math.max(0, Math.floor(y0 * f) - pad);
    const bw = Math.min(RW, Math.ceil(x1 * f) + pad) - bx;
    const bh = Math.min(RH, Math.ceil(y1 * f) + pad) - by;

    // máscara crua e uma passada de limpeza 3×3 (tira pixels soltos, fecha furinhos)
    const cru = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) cru[y * bw + x] = mapa[(by + y) * RW + bx + x] === andar ? 1 : 0;
    const m = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) n += cru[yy * bw + xx];
        }
        const i = y * bw + x;
        m[i] = cru[i] ? (n >= 3 ? 1 : 0) : n >= 7 ? 1 : 0;
      }
    }

    // o mapa de IDs não tem antialias: o recorte e o contorno saem de um traçado vetorial dele, para as linhas ficarem retas
    const path = tracaContorno(m, bw, bh);

    const luz = document.createElement('canvas');
    luz.width = bw;
    luz.height = bh;
    const gl = luz.getContext('2d');
    gl.clip(path, 'evenodd');
    gl.drawImage(ga.canvas, -bx, -by);

    const borda = document.createElement('canvas');
    borda.width = bw * ESCALA_BORDA;
    borda.height = bh * ESCALA_BORDA;
    const gb = borda.getContext('2d');
    gb.scale(ESCALA_BORDA, ESCALA_BORDA);
    gb.strokeStyle = 'rgba(241, 236, 227, 0.92)';
    gb.lineWidth = RW >= 2560 ? 2.2 : 1.2; // ≈ 1 px de tela
    gb.lineJoin = 'round';
    gb.stroke(path);

    const el = document.createElement('div');
    el.className = 'andar';
    el.style.cssText = `left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px`;
    luz.className = 'andar__luz';
    borda.className = 'andar__borda';
    el.append(luz, borda);
    andaresEl.append(el);
    luzes[andar] = { canvas: luz, x: bx, y: by, w: bw, h: bh, path };
    return el;
  }

  // ---------- geometria real de cada andar (do mapa de IDs) ----------
  // As caixas do andares.json se sobrepõem por causa da perspectiva; aqui sai a caixa exata da máscara e as duas
  // linhas que a limitam (borda de cima e de baixo da faixa do andar, retas y = a + b·x ajustadas por mínimos
  // quadrados no miolo da faixa). Tudo em pixels da cena (RW × RH).
  const geo = {};
  function mede() {
    const cx = {};
    for (let y = 0; y < RH; y++) {
      const lin = y * RW;
      for (let x = 0; x < RW; x++) {
        const v = mapa[lin + x];
        if (v < 2 || v > 21) continue;
        const c = (cx[v] ||= [x, y, x, y]);
        if (x < c[0]) c[0] = x;
        if (x > c[2]) c[2] = x;
        if (y < c[1]) c[1] = y;
        if (y > c[3]) c[3] = y;
      }
    }
    const reta = (pts) => {
      const n = pts.length;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const d = n * sxx - sx * sx;
      const b = d ? (n * sxy - sx * sy) / d : 0;
      return [(sy - b * sx) / n, b];
    };
    for (const [k, [x0, y0, x1, y1]] of Object.entries(cx)) {
      const andar = +k;
      const w = x1 - x0 + 1;
      const topo = [], base = [];
      const passo = Math.max(1, Math.round(w / 64));
      for (let x = Math.round(x0 + w * 0.12); x <= x1 - w * 0.12; x += passo) {
        let a = -1, b = -1;
        for (let y = y0; y <= y1; y++) if (mapa[y * RW + x] === andar) { if (a < 0) a = y; b = y; }
        if (a >= 0) { topo.push([x, a]); base.push([x, b + 1]); }
      }
      let rt = reta(topo);
      const rb = reta(base);
      // planta em L (cobertura): a borda de cima não é uma linha. Fica paralela à de baixo, acima do ponto mais alto.
      if (Math.abs(rt[1] - rb[1]) > 0.03) rt = [Math.min(...topo.map(([x, y]) => y - rb[1] * x)), rb[1]];
      const meio = (x0 + x1 + 1) / 2;
      // onde o olho lê o andar perto da ponta esquerda: o meio da máscara na coluna a 15% da largura
      // (na ponta em si a perspectiva derruba a laje, e o número pareceria do andar de baixo)
      const xl = Math.round(x0 + w * 0.15);
      let la = -1, lb = -1;
      for (let y = y0; y <= y1; y++) if (mapa[y * RW + xl] === andar) { if (la < 0) la = y; lb = y + 1; }
      geo[andar] = { x0, y0, x1: x1 + 1, y1: y1 + 1, yEsq: (la + lb) / 2, cx: meio, cy: (rt[0] + rt[1] * meio + rb[0] + rb[1] * meio) / 2, topo: rt, base: rb };
    }
  }

  /** transformação da cena que põe a laje do andar com `frac` da largura do palco, centrada (sem mostrar borda) */
  function zoomPara(andar, frac) {
    const g = geo[andar];
    const w = W(), h = H();
    const s = (frac * w) / (g.x1 - g.x0);
    const x = clamp(w / 2 - g.cx * s, w - RW * s, 0);
    const y = clamp(h / 2 - g.cy * s, h - RH * s, 0);
    return { x, y, s };
  }

  // ---------- números dos andares (sem hover, é o que diz qual andar é qual; só aparecem no CSS de toque e no celular) ----------
  const rotulos = {};
  function criaNumeros() {
    for (let andar = 2; andar <= 21; andar++) {
      const el = document.createElement('span');
      el.className = 'numero-andar';
      el.dataset.andar = andar;
      el.style.setProperty('--ordem', andar - 2);
      el.textContent = `${andar}º`;
      numeros.append(el);
      rotulos[andar] = el;
    }
    posicionaNumeros();
  }

  /** cada número fica à esquerda da torre, na altura em que o andar é lido */
  function posicionaNumeros() {
    for (const [k, el] of Object.entries(rotulos)) {
      const g = geo[k];
      // o 2º, o 3º e o 21º têm outro desenho (embasamento, cobertura): a régua sai do 4º e do 20º, e o passo é constante
      const passo = (geo[20].yEsq - geo[4].yEsq) / 16;
      const [x, y] = naTela(t, g.x0, geo[4].yEsq + (k - 4) * passo);
      el.style.height = `${Math.abs(passo) * t.s}px`;
      el.style.transform = `translate(${x}px, ${y}px) translate(-100%, -50%)`;
    }
  }

  function marcaNumero(andar) {
    for (const [k, el] of Object.entries(rotulos)) el.classList.toggle('ativo', +k === andar);
  }

  /** chamado quando a fachada assenta no quadro normal (depois do zoom de abertura) */
  function mostraNumeros() {
    mascaras.then(() => numeros.classList.add('fachada__numeros--on'));
  }

  // ---------- hit-test ----------
  function andarEm(clientX, clientY) {
    if (!mapa) return 0;
    const r = palco.getBoundingClientRect();
    const ix = Math.floor((clientX - r.left - t.x) / t.s);
    const iy = Math.floor((clientY - r.top - t.y) / t.s);
    const le = (x, y) => (x >= 0 && y >= 0 && x < RW && y < RH ? mapa[y * RW + x] : 0);
    let v = le(ix, iy);
    // tolerância de 3 px da imagem: o cursor não "cai" entre um andar e outro
    for (let k = 1; !v && k <= 3; k++) v = le(ix, iy - k) || le(ix, iy + k) || le(ix - k, iy) || le(ix + k, iy);
    return v >= 2 && v <= 21 ? v : 0;
  }

  // ---------- acender ----------
  function acende(andar) {
    if (andar === ativo) return;
    if (ativo && camadas[ativo]) camadas[ativo].classList.remove('andar--on');
    ativo = andar;
    marcaNumero(andar);
    if (andar && camadas[andar]) camadas[andar].classList.add('andar--on');
    raiz.classList.toggle('explorador--sobre', !!andar);
    if (andar) mostraCard(andar);
    else escondeCard();
  }

  // ---------- card ----------
  const sel = (s) => card.querySelector(s);
  function preencheCard(andar) {
    const u = ANDARES[andar];
    const tip = TIPOLOGIAS[u.tipologia];
    sel('.card-andar__num').innerHTML = `${andar}<span>º</span>`;
    sel('.card-andar__tipo').textContent = tip.resumo;
    sel('.card-andar__preco').textContent = u.status === 'vendido' ? 'Unidade vendida' : u.preco;
    const selo = sel('.selo');
    selo.dataset.status = u.status;
    selo.querySelector('b').textContent = STATUS[u.status];
    card.dataset.andar = andar;
  }

  /** onde a coluna de números termina, em pixels do palco */
  const fimDosNumeros = () => t.x + Math.max(...Object.values(geo).map((g) => g.x0)) * t.s;

  function alvoCard(andar) {
    const a = info.andares[andar];
    const w = W(), h = H();
    const margem = movel() ? 16 : 28;
    // celular: o card começa depois da coluna de números, para todos seguirem tocáveis com ele aberto
    // (em tela muito estreita a largura mínima manda, e ele avança um pouco sobre os números)
    const esq = movel() ? Math.max(margem, Math.min(fimDosNumeros() + 6, w - margem - CARD_MIN)) : 0;
    card.style.width = movel() ? `${w - esq - margem}px` : '';
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (movel()) {
      // celular: na metade oposta à do andar
      const [ax, ay] = naTela(t, a.caixa[2] * f, a.centro[1] * f);
      const emCima = ay > h * 0.5;
      const top = emCima ? navH() + 10 : h - ch - 16;
      return { ax: Math.min(ax, w - 24), ay, left: esq, top, lado: emCima ? -1 : 1 };
    }
    let [ax, ay] = naTela(t, a.caixa[2] * f + 4, a.centro[1] * f);
    let left = ax + 72;
    let lado = 1;
    if (left + cw > w - margem) {
      [ax, ay] = naTela(t, a.caixa[0] * f - 4, a.centro[1] * f);
      left = ax - 72 - cw;
      lado = -1;
    }
    const top = clamp(ay - ch / 2, navH() + 12, h - ch - 20);
    return { ax, ay, left, top, lado };
  }

  function desenha() {
    gsap.set(card, { x: pos.left, y: pos.top });
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let d;
    if (movel()) {
      const xs = pos.ax + 14;
      const yCard = pos.lado < 0 ? pos.top + ch : pos.top;
      d = `M${pos.ax} ${pos.ay} H${xs} V${yCard}`;
    } else {
      const xs = pos.ax + 26 * pos.lado;
      const xCard = pos.lado > 0 ? pos.left : pos.left + cw;
      const yCard = clamp(pos.ay, pos.top + 18, pos.top + ch - 18);
      d = `M${pos.ax} ${pos.ay} H${xs} L${xCard} ${yCard}`;
    }
    fioLinha.setAttribute('d', d);
    fioPonto.setAttribute('cx', pos.ax);
    fioPonto.setAttribute('cy', pos.ay);
  }

  function posiciona(andar, anima = true) {
    const alvo = alvoCard(andar);
    gsap.killTweensOf(pos);
    if (!anima) {
      Object.assign(pos, alvo);
      desenha();
      return;
    }
    pos.lado = alvo.lado;
    gsap.to(pos, { ...alvo, duration: 0.42, ease: 'power3.out', onUpdate: desenha });
  }

  function mostraCard(andar) {
    preencheCard(andar);
    if (!cardVisivel) {
      cardVisivel = true;
      posiciona(andar, false);
      gsap.killTweensOf([card, fio]);
      gsap.fromTo(card, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power2.out' });
      gsap.fromTo(fio, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
    } else {
      posiciona(andar);
    }
  }

  function escondeCard(imediato = false) {
    cardVisivel = false;
    gsap.killTweensOf([card, fio]);
    gsap.to([card, fio], { autoAlpha: 0, duration: imediato ? 0 : 0.25, ease: 'power2.out' });
  }

  // ---------- lista acessível (teclado e leitor de tela) ----------
  for (let andar = 21; andar >= 2; andar--) {
    const u = ANDARES[andar];
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.andar = andar;
    b.textContent = `${andar}º andar, ${TIPOLOGIAS[u.tipologia].resumo}, ${STATUS[u.status]}`;
    li.append(b);
    lista.append(li);
  }
  lista.addEventListener('focusin', (e) => {
    const a = +e.target.dataset.andar;
    if (a) acende(a);
  });
  lista.addEventListener('focusout', () => setTimeout(() => !lista.contains(document.activeElement) && acende(0)));

  return {
    pronta,
    mascaras,
    ajusta,
    andarEm,
    mostraNumeros,
    acende,
    escondeCard,
    get ativo() { return ativo; },
    get t() { return t; },
    get res() { return [RW, RH]; },
    geo: (andar) => geo[andar],
    zoomPara,
    base,
    nitida,
    get torreNitida() { return torreNitida; },
    luzDe: (andar) => luzes[andar],
    /** enquadramento da fachada com o tamanho de outra mídia de mesma câmera (o clipe da cobertura) */
    enquadraPara(iw, ih) {
      return cobre(iw, ih, W(), H(), TORRE_X, 0.5);
    },
    /** marca o andar como ativo sem mostrar o card (volta da planta: o andar segue aceso sob o canvas) */
    ativaSemCard(andar) {
      if (ativo && camadas[ativo]) camadas[ativo].classList.remove('andar--on');
      ativo = andar;
      marcaNumero(andar);
      camadas[andar]?.classList.add('andar--on');
    },
  };
}
