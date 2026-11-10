// Galeria: foto do cômodo em tela cheia, duas <img> que se alternam para o dissolve, legenda e abas.
import { gsap } from 'gsap';
import { TIPOLOGIAS } from '../../data/unidades.js';

// onde fica o assunto de cada foto (object-position), para o corte em telas mais estreitas que 16:9 não perder o essencial
// (em tela em pé a foto aparece inteira e isto não tem efeito)
const FOCO_X = {
  tipo: { living: 42, cozinha: 50, suite_master: 45, banho_master: 50, home_office: 50, varanda: 40 },
  cobertura: { living: 45, terraco: 50, cozinha: 50, suite_master: 50, banho_master: 50 },
};

export function criaGaleria(raiz, { reduzido }) {
  const palco = raiz.querySelector('.palco');
  const camada = raiz.querySelector('.galeria');
  const fotos = [...camada.querySelectorAll('.galeria__foto')];
  const onde = camada.querySelector('.galeria__onde');
  const nome = camada.querySelector('.galeria__nome');
  const abas = camada.querySelector('.galeria__abas');
  let atual = 0; // índice da <img> visível
  let tipologia = 'tipo';
  let andar = 14;
  let comodo = null;
  let ocupado = false;

  // as fotos saem do otimiza.mjs em 1672 e 960 de largura (o tamanho das fontes; nunca ampliadas)
  const largura = () => (palco.clientWidth * Math.min(devicePixelRatio || 1, 2) > 1000 ? 1672 : 960);
  const src = (tip, c) => `/img/${tip}/${c}-${largura()}.webp`;
  const rotulo = (c) => TIPOLOGIAS[tipologia].comodos.find(([id]) => id === c)?.[1] ?? c;

  function precarrega(tip) {
    for (const [c] of TIPOLOGIAS[tip].comodos) {
      const i = new Image();
      i.src = src(tip, c);
    }
  }

  function monta(tip, novoAndar) {
    tipologia = tip;
    andar = novoAndar;
    abas.innerHTML = '';
    for (const [id, n] of TIPOLOGIAS[tip].comodos) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.dataset.comodo = id;
      b.textContent = n;
      abas.append(b);
    }
    onde.textContent = `Andar ${andar} · ${TIPOLOGIAS[tip].nome}`;
  }

  function marca(c) {
    comodo = c;
    abas.querySelectorAll('button').forEach((b) => {
      const sim = b.dataset.comodo === c;
      b.classList.toggle('ativa', sim);
      b.setAttribute('aria-selected', sim);
    });
    nome.textContent = rotulo(c);
    const el = fotos[atual];
    el.alt = `${rotulo(c)} do ${TIPOLOGIAS[tipologia].nome.toLowerCase()}, ${andar}º andar`;
  }

  /** foto inicial, sem dissolve (a transição de entrada cuida do movimento) */
  async function abre(c) {
    const el = fotos[atual];
    el.style.objectPosition = `${FOCO_X[tipologia][c] ?? 50}% 50%`;
    el.src = src(tipologia, c);
    gsap.set(el, { autoAlpha: 1, scale: 1 });
    gsap.set(fotos[1 - atual], { autoAlpha: 0 });
    marca(c);
    await el.decode().catch(() => {});
    precarrega(tipologia);
  }

  /** troca de cômodo por dissolve */
  async function troca(c) {
    if (c === comodo || ocupado) return;
    ocupado = true;
    const prox = fotos[1 - atual];
    const ant = fotos[atual];
    prox.style.objectPosition = `${FOCO_X[tipologia][c] ?? 50}% 50%`;
    prox.src = src(tipologia, c);
    await prox.decode().catch(() => {});
    atual = 1 - atual;
    marca(c);
    gsap.set(prox, { zIndex: 2 });
    gsap.set(ant, { zIndex: 1 });
    const tl = gsap.timeline({ onComplete: () => { gsap.set(ant, { autoAlpha: 0 }); ocupado = false; } });
    if (reduzido) tl.fromTo(prox, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
    else tl.fromTo(prox, { autoAlpha: 0, scale: 1.04 }, { autoAlpha: 1, scale: 1, duration: 0.8, ease: 'power2.out' });
    gsap.fromTo(nome, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5, delay: 0.15, ease: 'power2.out' });
  }

  abas.addEventListener('click', (e) => {
    const b = e.target.closest('[data-comodo]');
    if (b) troca(b.dataset.comodo);
  });

  // setas do teclado trocam de cômodo enquanto a galeria está aberta
  addEventListener('keydown', (e) => {
    if (raiz.dataset.estado !== 'galeria' || !comodo) return;
    const ids = TIPOLOGIAS[tipologia].comodos.map(([id]) => id);
    const i = ids.indexOf(comodo);
    if (e.key === 'ArrowRight') troca(ids[(i + 1) % ids.length]);
    if (e.key === 'ArrowLeft') troca(ids[(i - 1 + ids.length) % ids.length]);
  });

  return {
    monta,
    abre,
    troca,
    precarrega,
    fotoAtual: () => fotos[atual],
    quadro: camada.querySelector('.galeria__fotos'),
    focoX: (c) => FOCO_X[tipologia][c] ?? 50,
    get comodo() { return comodo; },
    camada,
  };
}
