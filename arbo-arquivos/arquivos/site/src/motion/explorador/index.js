// Explorador do prédio: três estados no mesmo palco (fachada → planta → galeria, e de volta).
//
// Tipo (2º ao 20º), o "mergulho":
//   1. mira (0,6 s): a fachada aproxima até a laje do andar ocupar 72% da largura (92% no celular), centrada, com o
//      andar aceso e contornado e o resto escurecido. É pintada em canvas, com a placa da torre em alta (zoom.js);
//   2. o andar sai (0,4 s): a fachada desfoca no lugar e fica transparente, e o andar dissolve na maquete 3D, de frente,
//      no mesmo lugar;
//   3. a câmera sobe até a vista do corte (Three.js, maquete3d.js) e o card entra pela direita. Parada, a maquete
//      flutua e pode ser arrastada, com limites. A volta faz o caminho inverso.
// Cobertura (21º): um clipe do Blender parte do quadro do hero, a câmera sobe e termina vendo a cobertura de cima, com o
// teto e o terraço, na mesma câmera do corte; o último quadro dissolve na maquete 3D sem teto. Sem o clipe, o mergulho.
// Abertura do site: um zoom bem leve perto do hall, que recua até o quadro normal da fachada (só CSS, sem vídeo).
// Ver fotos: a câmera mergulha pelo vão sem teto até o olhar exato da foto do cômodo e dissolve nela.
// Reserva sem WebGL, com o modelo ainda carregando ou com prefers-reduced-motion: a imagem fixa do corte, inclinada
// em CSS 3D (só fades no movimento reduzido). Se o modelo chega depois, entra por dissolve sobre a imagem.
import { gsap } from 'gsap';
import { criaFachada } from './fachada.js';
import { CORTE, criaPlanta } from './planta.js';
import { criaGaleria } from './galeria.js';
import { criaZoom } from './zoom.js';
import { aplica, clamp, cobre } from './enquadra.js';
import { ANDARES } from '../../data/unidades.js';

const ZOOM = 2.6; // mergulho na sala sem 3D (a imagem fixa aproxima do ponto do cômodo)
const INCLINA = 55; // graus do corte na reserva em CSS 3D
const HALL = [1270, 1235]; // o hall do prédio, em pixels do hero de 2560
const INTRO_ZOOM = 1.1; // de quanto a fachada recua quando o site abre
// o clipe tem 78 quadros a 60 fps (1,3 s); a câmera começa a andar no quadro 8 e assenta no 74 (medido no vídeo pronto,
// fonte/monta_clipe_video.mjs)
const CLIPE_T0 = 8 / 78;
const CLIPE_T1 = 74 / 78;
const LARGURA_FRENTE = 0.72; // a pose "de frente" do .glb: a frente da laje ocupa essa fração do quadro virtual

const temWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

export function explorador({ lenis, reduzido }) {
  const raiz = document.querySelector('.explorador');
  const palco = raiz.querySelector('.palco');
  const html = document.documentElement;
  const mqMovel = matchMedia('(max-width: 760px)');
  const movel = () => mqMovel.matches;
  const mqFotoInteira = matchMedia('(max-aspect-ratio: 1/1)'); // a mesma regra do layout da galeria em explorador.css

  const elFachada = raiz.querySelector('.fachada');
  const cenaFachada = raiz.querySelector('.fachada__cena');
  const veu = raiz.querySelector('.fachada__veu');
  const fachada = criaFachada(raiz, { movel });
  if (reduzido) fachada.mostraNumeros(); // sem o zoom de abertura, a fachada já nasce no quadro normal
  const planta = criaPlanta(raiz, { movel, onComodo: (c) => irGaleria(c) });
  const galeria = criaGaleria(raiz, { reduzido });
  const legenda = raiz.querySelector('.galeria__legenda');
  const uiFachada = raiz.querySelectorAll('.fachada__texto, .fachada__dica, .fachada__pe, .fachada__numeros');
  const abas = raiz.querySelector('.galeria__abas');
  const canvas3d = raiz.querySelector('.planta__maquete');
  const zoom = criaZoom({ palco, canvas: raiz.querySelector('.fachada__zoom'), fachada, movel });

  let estado = 'fachada';
  let ocupado = false;

  function poeEstado(e) {
    estado = e;
    raiz.dataset.estado = e;
    for (const [nome, el] of [['fachada', elFachada], ['planta', planta.camada], ['galeria', galeria.camada]]) {
      el.toggleAttribute('inert', nome !== e);
      el.setAttribute('aria-hidden', nome !== e);
    }
  }
  poeEstado('fachada');
  gsap.set([planta.camada, galeria.camada], { autoAlpha: 0 });
  gsap.set(planta.zoom, { transformOrigin: '0 0' });

  function trava(sim) {
    if (sim) {
      lenis?.stop();
      html.classList.add('travado');
    } else {
      html.classList.remove('travado');
      lenis?.start();
    }
  }

  const rolaTopo = () =>
    new Promise((res) => {
      if (scrollY < 2) return res();
      if (!lenis) { scrollTo(0, 0); return res(); }
      lenis.scrollTo(0, { duration: Math.min(1.6, 0.6 + scrollY / 2500), force: true, onComplete: res });
    });

  // ---------- clipe da cobertura ----------
  // um <video> para a ida e outro para a volta; assets.json diz se existem e se a placa da torre existe
  let assets = {};
  const modelo = raiz.querySelector('.clipe');
  const videos = { ida: modelo, volta: modelo.cloneNode() };
  modelo.after(videos.volta);
  gsap.set(Object.values(videos), { autoAlpha: 0, transformOrigin: '0 0' });
  const temClipe = (k) => !reduzido && !!assets.video?.[k];
  const clipePronto = (k) => temClipe(k) && videos[k].readyState >= 3 && !videos[k].error;

  function preparaClipe() {
    for (const k of Object.keys(videos)) {
      const v = videos[k];
      if (!temClipe(k) || v.getAttribute('src')) continue;
      v.preload = 'auto';
      v.src = assets.video[k];
      v.load();
    }
  }
  fetch('/img/assets.json')
    .then((r) => r.json())
    .then((j) => {
      assets = j;
      zoom.manifesto = j.placa ?? null;
      fachada.nitida(j.torre).catch(() => {});
    })
    .catch(() => {});

  /** resolve true quando o vídeo pode tocar sem travar, false se não der em `ms` */
  const esperaVideo = (v, ms) =>
    new Promise((res) => {
      if (!v.getAttribute('src')) return res(false);
      if (v.readyState >= 3) return res(true);
      const ok = () => { clearTimeout(id); res(true); };
      const id = setTimeout(() => { v.removeEventListener('canplay', ok); res(v.readyState >= 3); }, ms);
      v.addEventListener('canplay', ok, { once: true });
    });

  const umQuadro = (v) => new Promise((r) => ('requestVideoFrameCallback' in v ? v.requestVideoFrameCallback(() => r()) : setTimeout(r, 60)));

  /** o enquadramento anda junto com a câmera do clipe, em fração do clipe */
  const curvaClipe = (u) => {
    let f = clamp((u - CLIPE_T0) / (CLIPE_T1 - CLIPE_T0), 0, 1);
    f **= 0.82;
    return f * f * f * (f * (6 * f - 15) + 10);
  };

  /**
   * o bloco do vídeo cobre a tela do começo ao fim: no primeiro quadro, centrado na torre, como a fachada; no último,
   * centrado na cobertura. A maquete 3D recebe esse mesmo enquadramento (poseFimClipe) e só depois vai para o da planta.
   */
  function quadrosClipe(v) {
    const vw = v.videoWidth || 1920;
    const vh = v.videoHeight || 1080;
    v.style.width = `${vw}px`;
    v.style.height = `${vh}px`;
    const [fx, fy] = planta.focoFrac('cobertura');
    return { tf: fachada.enquadraPara(vw, vh), tp: cobre(vw, vh, W(), H(), fx, fy), vw };
  }
  const poseFimClipe = (v) => {
    const { tp, vw } = quadrosClipe(v);
    return maquete.pose('corte', { x: tp.x, y: tp.y, s: (tp.s * vw) / CORTE[0] });
  };

  /**
   * toca o vídeo com a transformação presa ao quadro mostrado (não ao relógio): se ele engasga, o enquadramento espera.
   * `volta` percorre a curva ao contrário, porque o clipe da volta é o da ida invertido.
   */
  function acompanha(v, tf, tp, volta) {
    return new Promise((res) => {
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1.3;
      let fim = false;
      const aplicaU = (u) => {
        const e = curvaClipe(u);
        aplica(v, { x: tf.x + (tp.x - tf.x) * e, y: tf.y + (tp.y - tf.y) * e, s: tf.s + (tp.s - tf.s) * e });
      };
      const acaba = () => {
        if (fim) return;
        fim = true;
        aplicaU(volta ? 0 : 1);
        res();
      };
      const rvfc = 'requestVideoFrameCallback' in v;
      const passo = (_, meta) => {
        if (fim) return;
        const u = clamp((meta?.mediaTime ?? v.currentTime) / dur, 0, 1);
        aplicaU(volta ? 1 - u : u);
        if (v.ended) return acaba();
        if (rvfc) v.requestVideoFrameCallback(passo);
        else requestAnimationFrame(passo);
      };
      v.addEventListener('ended', acaba, { once: true });
      setTimeout(acaba, dur * 1000 + 2500); // garantia se o 'ended' não vier
      passo();
    });
  }

  // ---------- abertura do site: um zoom bem leve perto do hall, que recua até o quadro normal da fachada ----------
  function introZoom() {
    fachada.ajusta();
    const t0 = fachada.t;
    const f = fachada.res[0] / 2560;
    const hx = HALL[0] * f, hy = HALL[1] * f;
    const s = t0.s * INTRO_ZOOM;
    // o hall mantém o lugar na tela, puxado um pouco para o centro; a imagem nunca deixa borda à mostra
    const px = t0.x + hx * t0.s, py = t0.y + hy * t0.s;
    const alvoX = px + (W() / 2 - px) * 0.2, alvoY = py + (H() / 2 - py) * 0.2;
    const e = {
      x: clamp(alvoX - hx * s, W() - fachada.res[0] * s, 0),
      y: clamp(alvoY - hy * s, H() - fachada.res[1] * s, 0),
      s,
    };
    ocupado = true;
    aplica(cenaFachada, e);
    return gsap.to(e, {
      x: t0.x,
      y: t0.y,
      s: t0.s,
      duration: 1.3,
      delay: 0.35, // começa quando a tela de abertura já está saindo
      ease: 'sine.inOut',
      onUpdate: () => aplica(cenaFachada, e),
      onComplete: () => {
        fachada.ajusta();
        fachada.mostraNumeros();
        ocupado = false;
      },
    }).then();
  }

  async function clipeIda() {
    const v = videos.ida;
    const { tf, tp } = quadrosClipe(v);
    fachada.escondeCard(true);
    gsap.set([planta.camada, planta.card, planta.pontos], { autoAlpha: 0 });
    gsap.set(planta.zoom, { x: 0, y: 0, scale: 1 });
    v.currentTime = 0;
    aplica(v, tf);
    try {
      await v.play();
      await umQuadro(v);
    } catch (e) {
      gsap.set(v, { autoAlpha: 0 });
      throw e;
    }
    // os primeiros quadros são o hero parado: é quando o título e o véu saem e o vídeo entra por cima
    gsap.to(v, { autoAlpha: 1, duration: 0.08, ease: 'none' });
    gsap.to([...uiFachada, veu], { autoAlpha: 0, duration: 0.14 });
    await acompanha(v, tf, tp, false);

    // a câmera do último quadro é a do corte: por baixo do vídeo, a maquete sem teto no mesmo enquadramento; ela dissolve
    // sobre o vídeo e só então desliza para o lugar da planta
    gsap.set(elFachada, { autoAlpha: 0 });
    gsap.set(planta.camada, { autoAlpha: 1 });
    const usa3d = await espera3d('cobertura', 300);
    const tl = gsap.timeline();
    let B = null;
    if (usa3d) {
      await maquete.usa('cobertura');
      const A = poseFimClipe(v);
      B = maquete.pose('corte', { ...planta.t });
      maquete.setPose(A);
      modoMaquete(true);
      gsap.set(canvas3d, { autoAlpha: 1 });
      const p = { u: 0 };
      tl.to(p, { u: 1, duration: 0.6, ease: 'sine.inOut', onUpdate: () => maquete.setPose(maquete.arco(A, B, p.u)) }, 0.04);
    }
    tl.to(v, { autoAlpha: 0, duration: 0.3, ease: 'power1.inOut' }, 0).add(entradaCard(), 0.25);
    await tl.then();
    v.pause();
    if (B) maquete.assenta(B);
    return true;
  }

  async function clipeVolta() {
    const v = videos.volta;
    const { tf, tp } = quadrosClipe(v);
    fachada.ajusta();
    gsap.to(planta.card, { autoAlpha: 0, duration: 0.25 });
    gsap.to(planta.pontos, { autoAlpha: 0, duration: 0.25 });
    // a maquete volta ao enquadramento do fim do clipe, e o vídeo entra por cima dela
    if (modo3d) {
      maquete.solta();
      const A = maquete.poseAtual;
      const B = poseFimClipe(v);
      const p = { u: 0 };
      await gsap.to(p, { u: 1, duration: 0.45, ease: 'sine.inOut', onUpdate: () => maquete.setPose(maquete.arco(A, B, p.u)) }).then();
    }
    v.currentTime = 0;
    aplica(v, tp);
    await gsap.to(v, { autoAlpha: 1, duration: 0.2, ease: 'power1.inOut' }).then();
    gsap.set(planta.camada, { autoAlpha: 0 });
    fachada.ativaSemCard(21);
    gsap.set(elFachada, { autoAlpha: 1 });
    gsap.set([...uiFachada, veu], { autoAlpha: 0 });
    await v.play();
    await acompanha(v, tf, tp, true);
    gsap.fromTo(veu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 });
    gsap.fromTo(uiFachada, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out' });
    await gsap.to(v, { autoAlpha: 0, duration: 0.15 }).then();
    v.pause();
    return true;
  }

  // ---------- maquete 3D ----------
  // o módulo (e o three) só é importado no primeiro hover, junto com o .glb da tipologia
  const pode3d = !reduzido && temWebGL();
  let maquete = null;
  let maqueteP = null;
  let modo3d = false; // a planta está mostrando o canvas (e não a imagem fixa)
  const carregadas = {};

  function pegaMaquete() {
    if (!pode3d) return Promise.resolve(null);
    return (maqueteP ||= import('./maquete3d.js')
      .then((m) => {
        maquete = m.criaMaquete({ palco, canvas: canvas3d, movel });
        maquete.aoDesenhar((ps) => planta.moveAncoras(ps));
        maquete.ligaArrasto(raiz.querySelector('.planta__vista'), () => estado === 'planta' && !ocupado);
        return maquete;
      })
      .catch(() => null));
  }

  function carrega3d(tipologia) {
    return pegaMaquete()
      .then((m) => (m ? m.carrega(tipologia) : null))
      .then((r) => {
        if (r) carregadas[tipologia] = true;
        return !!r;
      })
      .catch(() => false);
  }

  /** o que o clique vai precisar (placa e modelo): chamado no hover parado e no primeiro toque */
  function precarrega(andar) {
    if (andar === 21) preparaClipe();
    zoom.prepara(andar);
    carrega3d(ANDARES[andar].tipologia);
  }

  /** espera o modelo por no máximo `ms`; resolve se ele pode ser usado agora */
  function espera3d(tipologia, ms) {
    if (carregadas[tipologia]) return Promise.resolve(true);
    if (!pode3d) return Promise.resolve(false);
    return Promise.race([carrega3d(tipologia), new Promise((res) => setTimeout(() => res(false), ms))]);
  }

  function qFrente(alvo) {
    const s = alvo.w / (LARGURA_FRENTE * CORTE[0]);
    return { x: alvo.x - 0.5 * CORTE[0] * s, y: alvo.y - 0.5 * CORTE[1] * s, s };
  }

  /** o canvas passa a ser a maquete da planta (a imagem fixa some por CSS); a vinheta acompanha o enquadramento */
  function modoMaquete(sim) {
    modo3d = sim;
    planta.camada.dataset.modo = sim ? '3d' : 'imagem';
    if (sim) planta.poeVinheta();
    else gsap.set(canvas3d, { autoAlpha: 0 });
  }

  /** dissolve da imagem fixa para o canvas, com a câmera na pose do corte (o modelo chegou depois da transição) */
  async function assenta3d(dur = 0.5) {
    await maquete.usa(planta.tipologia);
    const pc = maquete.pose('corte', { ...planta.t });
    maquete.setPose(pc);
    maquete.assenta(pc);
    planta.poeVinheta();
    gsap.set(canvas3d, { autoAlpha: 0 });
    modo3d = true;
    await gsap.to(canvas3d, { autoAlpha: 1, duration: dur, ease: 'power1.inOut' }).then();
    planta.camada.dataset.modo = '3d';
  }

  // ---------- fachada: hover, clique e toque ----------
  let ponteiro = 'mouse';
  let parado = 0;
  palco.addEventListener('pointerdown', (e) => (ponteiro = e.pointerType));
  // o andar sob o ponteiro: o número ao lado da torre vale tanto quanto a própria faixa do andar
  const andarDoAlvo = (e) => +e.target.closest?.('.numero-andar')?.dataset.andar || fachada.andarEm(e.clientX, e.clientY);
  palco.addEventListener('pointermove', (e) => {
    if (estado !== 'fachada' || ocupado || e.pointerType !== 'mouse') return;
    const a = andarDoAlvo(e);
    fachada.acende(a);
    elFachada.style.cursor = a ? 'pointer' : '';
    // o mouse parou num andar: já busca a placa e o modelo, para o clique não esperar
    clearTimeout(parado);
    if (a) parado = setTimeout(() => precarrega(a), 160);
  });
  palco.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && estado === 'fachada' && !ocupado) fachada.acende(0);
  });
  elFachada.addEventListener('click', (e) => {
    if (estado !== 'fachada' || ocupado) return;
    if (e.target.closest('.card-andar__ver')) return abrir(fachada.ativo);
    if (e.target.closest('.card-andar, .fachada__lista')) return;
    const a = andarDoAlvo(e);
    if (ponteiro === 'mouse') return a && abrir(a);
    // toque: o primeiro toque seleciona (card com "Ver planta"); tocar de novo no mesmo andar abre
    if (a && a === fachada.ativo) return abrir(a);
    fachada.acende(a);
    if (a) precarrega(a);
  });
  raiz.querySelector('.fachada__lista').addEventListener('click', (e) => {
    const a = +e.target.closest('[data-andar]')?.dataset.andar;
    if (a) abrir(a);
  });

  // ---------- planta ----------
  planta.card.addEventListener('click', (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'fotos') irGaleria('living'); // a galeria abre sempre pelo living
    if (acao === 'fachada') voltarFachada();
  });
  raiz.querySelector('.galeria__voltar').addEventListener('click', () => voltarPlanta());
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || ocupado) return;
    if (estado === 'galeria') voltarPlanta();
    else if (estado === 'planta') voltarFachada();
  });

  // ---------- transições ----------
  const W = () => palco.clientWidth;
  const H = () => palco.clientHeight;
  const fracLaje = () => (movel() ? 0.92 : 0.72);

  function entradaCard() {
    const tl = gsap.timeline();
    tl.fromTo(planta.card, { autoAlpha: 0, x: movel() ? 0 : 56, y: movel() ? 24 : 0 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.55, ease: 'power3.out' }, 0)
      .fromTo(planta.pontos, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' }, 0.1);
    return tl;
  }

  async function abrir(andar) {
    if (ocupado || !andar || estado !== 'fachada') return;
    ocupado = true;
    await rolaTopo();
    trava(true);
    await fachada.pronta;
    await fachada.mascaras;
    await planta.carregaHotspots;
    fachada.acende(andar);
    modoMaquete(false);
    if (!reduzido) precarrega(andar);
    // a mira não depende da planta: o corte decodifica enquanto a fachada aproxima
    const preenchida = planta.preenche(andar);
    if (reduzido) await preenchida;
    new Image().src = `/img/${ANDARES[andar].tipologia}/living-${W() * Math.min(devicePixelRatio || 1, 2) > 1000 ? 1672 : 960}.webp`;
    if (reduzido) await fadeIda();
    else {
      let foi = false;
      if (andar === 21) {
        await preenchida;
        foi = (clipePronto('ida') || (await esperaVideo(videos.ida, 900))) && (await clipeIda().catch(() => false));
      }
      if (!foi) await mergulhoIda(andar, preenchida);
    }
    poeEstado('planta');
    planta.card.querySelector('.planta__nome').focus({ preventScroll: true });
    ocupado = false;
    // o modelo não chegou a tempo da transição: entra por dissolve quando chegar
    if (pode3d && !modo3d) {
      const tip = planta.tipologia;
      carrega3d(tip).then((ok) => {
        if (ok && !modo3d && !ocupado && estado === 'planta' && planta.tipologia === tip) assenta3d();
      });
    }
  }

  async function voltarFachada() {
    if (ocupado || estado !== 'planta') return;
    ocupado = true;
    const andar = planta.andar;
    if (reduzido) await fadeVolta();
    else {
      const foi = andar === 21 && clipePronto('volta') && (await clipeVolta().catch(() => false));
      if (!foi) await mergulhoVolta(andar);
    }
    if (maquete) maquete.solta();
    modoMaquete(false);
    poeEstado('fachada');
    trava(false);
    fachada.acende(0);
    ocupado = false;
  }

  // ---------- movimento reduzido: só fades ----------
  function fadeIda() {
    fachada.escondeCard();
    gsap.set(planta.zoom, { x: 0, y: 0, scale: 1 });
    gsap.set([planta.card, planta.pontos], { autoAlpha: 1 });
    const tl = gsap.timeline();
    tl.to(elFachada, { autoAlpha: 0, duration: 0.45 }, 0).fromTo(planta.camada, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45 }, 0);
    return tl.then();
  }

  function fadeVolta() {
    fachada.ajusta();
    gsap.set([...uiFachada, veu], { autoAlpha: 1, y: 0 });
    const tl = gsap.timeline();
    tl.to(planta.camada, { autoAlpha: 0, duration: 0.45 }, 0).to(elFachada, { autoAlpha: 1, duration: 0.45 }, 0);
    return tl.then();
  }

  // ---------- mira, fenda e maquete 3D (ou corte em CSS 3D) ----------
  /** onde a laje do andar fica na tela no fim da mira */
  function alvoMira(andar) {
    const t1 = fachada.zoomPara(andar, fracLaje());
    const g = fachada.geo(andar);
    return { t1, alvo: { x: t1.x + g.cx * t1.s, y: t1.y + g.cy * t1.s, w: (g.x1 - g.x0) * t1.s } };
  }

  /** reserva: o corte inclinado (quase de frente), com o centro da maquete sobre a laje do andar */
  function inclinado(alvo) {
    const { fx, fy, mw } = planta.focoTela();
    return {
      origem: `${fx}px ${fy}px`,
      inclinado: { rotationX: INCLINA, x: alvo.x - fx, y: alvo.y - fy, scale: alvo.w / mw },
      deitado: { rotationX: 0, x: 0, y: 0, scale: 1 },
    };
  }
  // no celular a vista do corte é uma faixa com overflow escondido: inclinado, o corte fica sobre o andar, fora dela
  const vista = raiz.querySelector('.planta__vista');
  function preparaInclinacao(origem) {
    vista.style.overflow = 'visible';
    gsap.set(planta.zoom, { transformOrigin: origem, transformPerspective: Math.max(W(), H()) * 0.85 });
  }
  function soltaInclinacao() {
    vista.style.overflow = '';
    gsap.set(planta.zoom, { clearProps: 'transform,transformOrigin' });
    gsap.set(planta.zoom, { x: 0, y: 0, scale: 1, transformOrigin: '0 0' });
  }

  // a pintura do zoom acompanha o relógio da GSAP enquanto a fachada está no canvas
  let pintando = null;
  function pintaZoom(e) {
    if (pintando) gsap.ticker.remove(pintando);
    pintando = e ? () => zoom.pinta(e) : null;
    if (pintando) gsap.ticker.add(pintando);
  }

  async function mergulhoIda(andar, preenchida) {
    fachada.ajusta();
    const { t1, alvo } = alvoMira(andar);
    fachada.escondeCard(true);
    gsap.set([planta.camada, planta.card, planta.pontos], { autoAlpha: 0 });
    gsap.set(planta.zoom, { x: 0, y: 0, scale: 1 });
    zoom.prepara(andar);

    // a fachada passa da pilha de camadas para o canvas: mesmo quadro, sem salto
    const e = { ...fachada.t, andar, escurece: 0, mira: 0, opacidade: 1, blur: 0, faixa: 1 };
    zoom.pinta(e);
    gsap.set(zoom.canvas, { autoAlpha: 1 });
    gsap.set(cenaFachada, { visibility: 'hidden' });
    pintaZoom(e);

    // 1. mira
    const tl = gsap.timeline();
    tl.to([...uiFachada, veu], { autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, 0)
      .to(e, { x: t1.x, y: t1.y, s: t1.s, duration: 0.6, ease: 'power3.inOut' }, 0)
      .to(e, { escurece: 0.42, duration: 0.4, ease: 'power1.out' }, 0.06)
      .to(e, { mira: 1, duration: 0.2, ease: 'power1.out' }, 0.16);
    // o andar sai no fim da desaceleração
    await gsap.delayedCall(0.54, () => {}).then();
    await preenchida; // o enquadramento final (planta.t) só existe depois disso
    const tipologia = ANDARES[andar].tipologia;
    const usa3d = await espera3d(tipologia, 500);

    // por baixo da fachada: a maquete de frente, ou o corte inclinado
    palco.style.backgroundColor = 'var(--fundo-corte)';
    gsap.set(elFachada, { zIndex: 3 });
    const ci = inclinado(alvo);
    let A, B;
    if (usa3d) {
      await maquete.usa(tipologia);
      A = maquete.pose('frente', qFrente(alvo));
      B = maquete.pose('corte', { ...planta.t });
      maquete.setPose(A);
      modoMaquete(true);
      gsap.set(canvas3d, { autoAlpha: 1 });
    } else {
      preparaInclinacao(ci.origem);
      gsap.set(planta.zoom, ci.inclinado);
    }
    gsap.set(planta.camada, { autoAlpha: 1 });

    // 2. o andar sai
    const tl2 = gsap.timeline();
    tl2.to(e, { opacidade: 0, blur: 16, duration: 0.4, ease: 'power2.in' }, 0)
      .to(e, { faixa: 0, duration: 0.28, ease: 'power1.inOut' }, 0.08);

    // 3. a câmera sobe até a vista do corte
    await gsap.delayedCall(0.1, () => {}).then();
    const tl3 = gsap.timeline();
    if (usa3d) {
      const p = { u: 0 };
      tl3.to(p, { u: 1, duration: 1.3, ease: 'power2.inOut', onUpdate: () => maquete.setPose(maquete.arco(A, B, p.u)) }, 0).add(entradaCard(), 0.8);
    } else {
      tl3.to(planta.zoom, { ...ci.deitado, duration: 1.1, ease: 'power2.inOut' }, 0).add(entradaCard(), 0.7);
    }
    await tl2.then();
    pintaZoom(null);
    zoom.limpa();
    gsap.set(zoom.canvas, { autoAlpha: 0 });
    await tl3.then();
    if (usa3d) maquete.assenta(B);
    else soltaInclinacao();
    gsap.set(elFachada, { autoAlpha: 0, zIndex: '' });
    gsap.set(cenaFachada, { clearProps: 'visibility' });
    palco.style.backgroundColor = '';
  }

  async function mergulhoVolta(andar) {
    fachada.ajusta(); // a cena some sob a planta: aqui só recalcula o quadro normal (t0)
    const t0 = fachada.t;
    const { t1, alvo } = alvoMira(andar);
    const ci = inclinado(alvo);
    palco.style.backgroundColor = 'var(--fundo-corte)';
    gsap.to(planta.card, { autoAlpha: 0, x: movel() ? 0 : 32, duration: 0.3, ease: 'power2.in' });
    gsap.to(planta.pontos, { autoAlpha: 0, duration: 0.25 });

    // 1. a câmera desce do corte até o apartamento de frente
    if (modo3d) {
      maquete.solta();
      const A = maquete.poseAtual;
      const B = maquete.pose('frente', qFrente(alvo));
      const p = { u: 0 };
      gsap.to(p, { u: 1, duration: 1.05, ease: 'power2.inOut', onUpdate: () => maquete.setPose(maquete.arco(A, B, p.u)) });
      await gsap.delayedCall(0.9, () => {}).then();
    } else {
      preparaInclinacao(ci.origem);
      gsap.set(planta.zoom, ci.deitado);
      gsap.to(planta.zoom, { ...ci.inclinado, duration: 0.9, ease: 'power2.inOut', delay: 0.05 });
      await gsap.delayedCall(0.9, () => {}).then(); // a fachada começa a fechar no fim da inclinação
    }

    // 2. a fachada fecha o vão, no canvas
    const e = { x: t1.x, y: t1.y, s: t1.s, andar, escurece: 0.42, mira: 1, opacidade: 0, blur: 16, faixa: 0 };
    zoom.prepara(andar);
    fachada.ativaSemCard(andar);
    gsap.set([...uiFachada, veu], { autoAlpha: 0 });
    gsap.set(cenaFachada, { visibility: 'hidden' });
    zoom.pinta(e);
    gsap.set(zoom.canvas, { autoAlpha: 1 });
    pintaZoom(e);
    gsap.set(elFachada, { autoAlpha: 1, zIndex: 3 });
    const tl = gsap.timeline();
    tl.to(e, { faixa: 1, duration: 0.25, ease: 'power1.inOut' }, 0)
      .to(e, { opacidade: 1, blur: 0, duration: 0.36, ease: 'power2.out' }, 0.04)
      .call(() => {
        gsap.set(planta.camada, { autoAlpha: 0 });
        if (!modo3d) soltaInclinacao();
        gsap.set(elFachada, { zIndex: '' });
        palco.style.backgroundColor = '';
      }, null, 0.4)
      // 3. o zoom sai até o quadro normal, já emendado no fechamento
      .to(e, { x: t0.x, y: t0.y, s: t0.s, duration: 0.65, ease: 'power3.inOut' }, 0.36)
      .to(e, { escurece: 0, duration: 0.5, ease: 'power1.inOut' }, 0.46)
      .to(e, { mira: 0, duration: 0.3 }, 0.52)
      .to(veu, { autoAlpha: 1, duration: 0.4 }, 0.65)
      .fromTo(uiFachada, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out' }, 0.75);
    await tl.then();
    pintaZoom(null);
    gsap.set(cenaFachada, { clearProps: 'visibility' });
    gsap.set(zoom.canvas, { autoAlpha: 0 });
    zoom.limpa();
  }

  // ---------- galeria ----------
  /** onde o quadro virtual fica para coincidir com a foto: no retângulo dela em tela em pé, em object-fit: cover no resto */
  function qFoto(comodo) {
    if (mqFotoInteira.matches) {
      const r = galeria.quadro.getBoundingClientRect();
      const p = palco.getBoundingClientRect();
      return { x: r.left - p.left, y: r.top - p.top, s: r.width / CORTE[0] };
    }
    const fx = galeria.focoX(comodo) / 100;
    const s = Math.max(W() / CORTE[0], H() / CORTE[1]);
    return { x: (W() - CORTE[0] * s) * fx, y: (H() - CORTE[1] * s) * 0.5, s };
  }

  let posesGaleria = null; // de onde o mergulho partiu e aonde chegou

  async function irGaleria(comodo) {
    if (ocupado || estado !== 'planta') return;
    ocupado = true;
    galeria.monta(planta.tipologia, planta.andar);
    await galeria.abre(comodo);
    const foto = galeria.fotoAtual();
    gsap.set(galeria.camada, { autoAlpha: 0 });
    gsap.set([legenda, abas], { autoAlpha: 0 });
    const tl = gsap.timeline();
    if (reduzido) {
      tl.to(galeria.camada, { autoAlpha: 1, duration: 0.45 }).set([legenda, abas], { autoAlpha: 1 });
    } else if (modo3d) {
      // a câmera entra pelo vão sem teto e termina no olhar da foto; a foto dissolve quando os quadros coincidem
      maquete.solta();
      const A = maquete.poseAtual;
      const B = maquete.pose(comodo, qFoto(comodo));
      posesGaleria = { A: maquete.pose('corte', { ...planta.t }), B };
      const p = { u: 0 };
      gsap.set(foto, { scale: 1, transformOrigin: '50% 50%' });
      tl.to(planta.card, { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 0)
        .to(planta.pontos, { autoAlpha: 0, duration: 0.25 }, 0)
        .to(p, { u: 1, duration: 1.8, ease: 'power2.inOut', onUpdate: () => maquete.setPose(maquete.mergulho(A, B, p.u)) }, 0)
        .to(galeria.camada, { autoAlpha: 1, duration: 0.5, ease: 'power1.inOut' }, 1.3)
        .fromTo([legenda, abas], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 1.6);
    } else {
      const [hx, hy] = planta.pontoDe(comodo);
      const cx = W() / 2, cy = H() / 2;
      gsap.set(foto, { scale: 1.08, transformOrigin: '50% 50%' });
      tl.to(planta.card, { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 0)
        .to(planta.zoom, { x: cx - hx * ZOOM, y: cy - hy * ZOOM, scale: ZOOM, duration: 1.0, ease: 'power2.inOut' }, 0)
        .to(planta.zoom, { filter: 'blur(4px)', duration: 0.4, ease: 'power1.in' }, 0.5)
        .to(galeria.camada, { autoAlpha: 1, duration: 0.55, ease: 'power1.inOut' }, 0.5)
        .to(foto, { scale: 1, duration: 1.2, ease: 'power3.out' }, 0.5)
        .fromTo([legenda, abas], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0.95);
    }
    await tl.then();
    gsap.set(planta.camada, { autoAlpha: 0 });
    poeEstado('galeria');
    galeria.camada.querySelector('.galeria__abas .ativa')?.focus({ preventScroll: true });
    ocupado = false;
  }

  async function voltarPlanta() {
    if (ocupado || estado !== 'galeria') return;
    ocupado = true;
    const foto = galeria.fotoAtual();
    const tl = gsap.timeline();
    gsap.set(planta.camada, { autoAlpha: 1 });
    if (reduzido) {
      gsap.set(planta.zoom, { x: 0, y: 0, scale: 1 });
      tl.to(galeria.camada, { autoAlpha: 0, duration: 0.45 }).set(planta.card, { autoAlpha: 1 });
    } else if (modo3d) {
      // o cômodo pode ter mudado nas abas: a volta parte do olhar do cômodo que está na tela
      const A = maquete.pose('corte', { ...planta.t });
      const B = maquete.pose(galeria.comodo, qFoto(galeria.comodo));
      posesGaleria = { A, B };
      const p = { u: 1 };
      gsap.set(planta.card, { autoAlpha: 0 });
      maquete.setPose(maquete.mergulho(A, B, 1));
      tl.to([legenda, abas], { autoAlpha: 0, duration: 0.25 }, 0)
        .to(galeria.camada, { autoAlpha: 0, duration: 0.45, ease: 'power1.inOut' }, 0.05)
        .to(p, { u: 0, duration: 1.7, ease: 'power2.inOut', onUpdate: () => maquete.setPose(maquete.mergulho(A, B, p.u)) }, 0.1)
        .add(entradaCard(), 1.15);
      await tl.then();
      maquete.assenta(A);
    } else {
      const [hx, hy] = planta.pontoDe(galeria.comodo);
      const cx = W() / 2, cy = H() / 2;
      gsap.set(planta.zoom, { x: cx - hx * ZOOM, y: cy - hy * ZOOM, scale: ZOOM, filter: 'blur(4px)' });
      gsap.set(planta.card, { autoAlpha: 0 });
      tl.to([legenda, abas], { autoAlpha: 0, duration: 0.25 }, 0)
        .to(foto, { scale: 1.08, duration: 0.7, ease: 'power2.in' }, 0)
        .to(galeria.camada, { autoAlpha: 0, duration: 0.5, ease: 'power1.inOut' }, 0.25)
        .to(planta.zoom, { x: 0, y: 0, scale: 1, duration: 1.05, ease: 'power3.out' }, 0.25)
        .to(planta.zoom, { filter: 'blur(0px)', duration: 0.5 }, 0.3)
        .add(entradaCard(), 0.7);
    }
    await tl.then();
    gsap.set(planta.zoom, { clearProps: 'filter' });
    gsap.set(foto, { scale: 1 });
    poeEstado('planta');
    ocupado = false;
  }

  /** volta à fachada sem animação (link da nav enquanto a planta ou a galeria estão abertas) */
  function fechaJa() {
    if (estado === 'fachada') return;
    const vs = Object.values(videos);
    gsap.killTweensOf([cenaFachada, elFachada, planta.camada, planta.zoom, planta.card, planta.pontos, galeria.camada, veu, ...uiFachada, ...vs]);
    vs.forEach((v) => v.pause());
    gsap.set([planta.camada, galeria.camada, ...vs], { autoAlpha: 0 });
    gsap.set(elFachada, { autoAlpha: 1, zIndex: '' });
    gsap.set([...uiFachada, veu], { autoAlpha: 1, y: 0 });
    gsap.set(planta.pontos, { autoAlpha: 1 });
    gsap.set(planta.zoom, { clearProps: 'filter' });
    soltaInclinacao();
    pintaZoom(null);
    gsap.set(zoom.canvas, { autoAlpha: 0 });
    gsap.set(cenaFachada, { clearProps: 'visibility' });
    if (maquete) maquete.solta();
    modoMaquete(false);
    palco.style.backgroundColor = '';
    fachada.ajusta();
    fachada.acende(0);
    poeEstado('fachada');
    trava(false);
    ocupado = false;
  }

  // ---------- redimensionar ----------
  let rz = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => {
      if (ocupado) return;
      fachada.ajusta();
      planta.ajusta();
      if (modo3d && maquete) {
        planta.poeVinheta();
        if (estado === 'planta') maquete.assenta(maquete.pose('corte', { ...planta.t }));
      }
    });
  });

  return {
    pronta: fachada.pronta,
    introZoom,
    abrir,
    fechaJa,
    get estado() { return estado; },
  };
}
