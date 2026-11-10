// Maquete cortada em 3D de verdade: o .glb assado no Blender (fonte/exporta_glb.py), ao vivo no Three.js.
//
// Material sem luz: o atlas já traz a luz do Cycles e o tom (AgX), então o pixel é o que o render daria.
// Câmera igual à do Blender: lente e sensor de 36 mm (quadro virtual de 1600×900, 16:9) mais shift. Uma pose é
// { loc, alvo, lente, sx, sy, q }, em que q = { x, y, s } diz onde esse quadro virtual fica no palco; assim o corte
// em 3D cai exatamente no mesmo lugar da imagem fixa (planta.t), e a pose "de frente" encaixa a laje sobre a laje da
// fachada no fim do zoom. O canvas cobre o palco inteiro e o frustum é recortado do quadro virtual a cada desenho.
//
// O módulo é importado sob demanda (three não entra no carregamento inicial da página).
import { gsap } from 'gsap';
import {
  Color,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const QUADRO = [1600, 900];
const SENSOR = 36;
const ARRASTO = { az: 25, elMin: 20, elMax: 70 }; // limites do arrasto (graus)
const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** { loc, alvo } → azimute, elevação e distância em volta do alvo (eixos do glTF: y sobe, a frente é +z) */
function polar(loc, alvo) {
  const dx = loc[0] - alvo[0], dy = loc[1] - alvo[1], dz = loc[2] - alvo[2];
  const dist = Math.hypot(dx, dy, dz);
  return { az: Math.atan2(dx, dz), el: Math.asin(dy / dist), dist };
}

function deOrbita(alvo, az, el, dist) {
  return [
    alvo[0] + Math.sin(az) * Math.cos(el) * dist,
    alvo[1] + Math.sin(el) * dist,
    alvo[2] + Math.cos(az) * Math.cos(el) * dist,
  ];
}

/** arco entre duas poses: gira em volta do alvo em vez de cortar em linha reta */
export function arco(a, b, u) {
  const pa = polar(a.loc, a.alvo), pb = polar(b.loc, b.alvo);
  const alvo = lerp3(a.alvo, b.alvo, u);
  // o azimute dá a volta pelo lado curto
  let daz = pb.az - pa.az;
  if (daz > Math.PI) daz -= Math.PI * 2;
  if (daz < -Math.PI) daz += Math.PI * 2;
  return {
    loc: deOrbita(alvo, pa.az + daz * u, lerp(pa.el, pb.el, u), lerp(pa.dist, pb.dist, u)),
    alvo,
    lente: lerp(a.lente, b.lente, u),
    sx: lerp(a.sx, b.sx, u),
    sy: lerp(a.sy, b.sy, u),
    q: { x: lerp(a.q.x, b.q.x, u), y: lerp(a.q.y, b.q.y, u), s: lerp(a.q.s, b.q.s, u) },
  };
}

/**
 * mergulho no cômodo: a câmera anda por cima das paredes até ficar sobre o cômodo e desce pelo vão sem teto até a
 * altura dos olhos, no olhar exato da foto. O alvo só vira para o da foto na descida.
 */
function mergulho(a, b, u, topoY) {
  const p0 = a.loc, p3 = b.loc;
  const acima = [p3[0], Math.max(topoY + 3.2, p3[1] + 3.6), p3[2]];
  const p1 = [lerp(p0[0], p3[0], 0.55), lerp(p0[1], acima[1], 0.5), lerp(p0[2], p3[2], 0.55)];
  const v = 1 - u;
  const loc = [0, 1, 2].map((i) => v * v * v * p0[i] + 3 * v * v * u * p1[i] + 3 * v * u * u * acima[i] + u * u * u * p3[i]);
  const ua = smooth(0.1, 0.92, u);
  const us = smooth(0.25, 1, u);
  return {
    loc,
    alvo: lerp3(a.alvo, b.alvo, ua),
    lente: lerp(a.lente, b.lente, us),
    sx: lerp(a.sx, b.sx, us),
    sy: lerp(a.sy, b.sy, us),
    q: { x: lerp(a.q.x, b.q.x, us), y: lerp(a.q.y, b.q.y, us), s: lerp(a.q.s, b.q.s, us) },
  };
}

// sombra de contato: um retângulo de borda macia sob a maquete (no render era o shadow catcher)
function texturaSombra() {
  const n = 128;
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = Math.abs((x + 0.5) / n - 0.5) * 2;
      const dy = Math.abs((y + 0.5) / n - 0.5) * 2;
      const a = (1 - smooth(0.66, 1, dx)) * (1 - smooth(0.62, 1, dy));
      // alphaMap do three lê o canal verde
      px.fill(Math.round(a * 255), (y * n + x) * 4, (y * n + x) * 4 + 4);
    }
  }
  const t = new DataTexture(px, n, n, RGBAFormat);
  t.minFilter = t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

// vidro: quase invisível de frente, com a borda de fresnel que o render tinha; sem transmissão de verdade
function materialVidro() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { cor: { value: new Color('#9c8a64') }, a0: { value: 0.17 }, a1: { value: 0.5 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 cor; uniform float a0; uniform float a1;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(cor, mix(a0, a1, f * f * f));
        #include <colorspace_fragment>
      }`,
  });
}

export function criaMaquete({ palco, canvas, movel, base = '/modelos' }) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;

  const cena = new Scene();
  const camera = new PerspectiveCamera();
  camera.matrixAutoUpdate = true;
  const raiz = new Group();
  cena.add(raiz);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const carga = {}; // tipologia → Promise<{grupo, poses}>
  let atual = null;

  let W = 0, H = 0;
  function medeTela() {
    const w = palco.clientWidth, h = palco.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, movel() ? 1.5 : 2);
    if (w === W && h === H && renderer.getPixelRatio() === dpr) return;
    W = w;
    H = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
  }

  /** versão do modelo pelo tamanho da tela em pixels do aparelho */
  const versao = () => (!movel() && Math.max(palco.clientWidth, palco.clientHeight) * Math.min(devicePixelRatio || 1, 2) > 1400 ? '4096' : '2048');

  function preparaMateriais(raizGltf) {
    const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const malhas = [];
    raizGltf.traverse((o) => { if (o.isMesh) malhas.push(o); });
    for (const m of malhas) {
      const nome = (m.material?.name || m.name || '').toLowerCase();
      if (nome.startsWith('vidro')) {
        m.material = materialVidro();
        m.renderOrder = 3;
      } else if (nome.startsWith('agua')) {
        m.material = new MeshBasicMaterial({ color: 0x3f8583, transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide, toneMapped: false });
        m.renderOrder = 1;
      } else if (nome.startsWith('cortinas')) {
        m.material = new MeshBasicMaterial({ color: 0xd9c3a0, transparent: true, opacity: 0.45, depthWrite: false, side: DoubleSide, toneMapped: false });
        m.renderOrder = 2;
      } else if (nome.startsWith('folhas')) {
        m.material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false });
      } else {
        const map = m.material.map;
        if (map) {
          map.colorSpace = SRGBColorSpace;
          map.anisotropy = aniso;
          map.minFilter = LinearMipmapLinearFilter;
          map.magFilter = LinearFilter;
          map.needsUpdate = true;
        }
        m.material = new MeshBasicMaterial({ map, side: DoubleSide, toneMapped: false });
      }
    }
  }

  function carrega(tipologia) {
    return (carga[tipologia] ||= (async () => {
      const poses = await fetch(`${base}/${tipologia}.json`).then((r) => {
        if (!r.ok) throw new Error(`poses ${r.status}`);
        return r.json();
      });
      const gltf = await loader.loadAsync(`${base}/${tipologia}-${versao()}.glb`);
      const grupo = new Group();
      grupo.add(gltf.scene);
      preparaMateriais(gltf.scene);
      const { x: [x0, x1], z: [z0, z1], y: [y0] } = poses.caixa;
      const sombra = new Mesh(
        new PlaneGeometry((x1 - x0) * 1.42, (z1 - z0) * 1.5),
        new MeshBasicMaterial({ color: 0x03060a, alphaMap: texturaSombra(), transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }),
      );
      sombra.rotation.x = -Math.PI / 2;
      sombra.position.set((x0 + x1) / 2 + 0.5, y0 - 0.02, (z0 + z1) / 2 - 0.4);
      sombra.renderOrder = -1;
      grupo.add(sombra);
      grupo.visible = false;
      raiz.add(grupo);
      // sobe a textura para a GPU agora: o primeiro quadro da transição não engasga
      renderer.compile(cena, camera);
      gltf.scene.traverse((o) => { if (o.isMesh && o.material.map) renderer.initTexture(o.material.map); });
      return { grupo, poses };
    })());
  }

  // ---------- pose e desenho ----------
  let pose = null;
  const v = new Vector3();
  const alvoV = new Vector3();
  let hotspots = []; // { id, el, p: Vector3 }
  let aoDesenhar = null;

  function aplicaCamera(p) {
    medeTela();
    const k = SENSOR / p.lente; // largura do sensor na distância focal: tamanho do quadro em profundidade 1
    const fw = QUADRO[0] * p.q.s, fh = QUADRO[1] * p.q.s;
    const asp = QUADRO[1] / QUADRO[0];
    const u0 = (0 - p.q.x) / fw, u1 = (W - p.q.x) / fw;
    const v0 = (0 - p.q.y) / fh, v1 = (H - p.q.y) / fh;
    camera.position.set(p.loc[0], p.loc[1], p.loc[2]);
    alvoV.set(p.alvo[0], p.alvo[1], p.alvo[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(alvoV);
    camera.updateMatrixWorld();
    const dist = camera.position.distanceTo(alvoV);
    const near = Math.max(0.05, dist * 0.2);
    const far = dist + 120;
    camera.near = near;
    camera.far = far;
    const esq = (u0 - 0.5 + p.sx) * k * near;
    const dir = (u1 - 0.5 + p.sx) * k * near;
    const cima = ((0.5 - v0) * asp + p.sy) * k * near;
    const baixo = ((0.5 - v1) * asp + p.sy) * k * near;
    camera.projectionMatrix.makePerspective(esq, dir, cima, baixo, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function projeta(p3) {
    v.copy(p3).project(camera);
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z];
  }

  function desenha() {
    if (!pose || !atual) return;
    aplicaCamera(pose);
    renderer.render(cena, camera);
    aoDesenhar?.();
  }

  function setPose(p) {
    pose = p;
    desenha();
  }

  // ---------- parado: flutua; arrasto limitado com retorno suave ----------
  let laco = 0;
  let poseCorte = null;
  const orbita = { az: 0, el: 0, azAlvo: 0, elAlvo: 0, solto: true, t0: 0, flutua: 0 };

  function passo(agora) {
    laco = requestAnimationFrame(passo);
    if (!poseCorte) return;
    // amortece até o alvo do arrasto
    orbita.az += (orbita.azAlvo - orbita.az) * 0.12;
    orbita.el += (orbita.elAlvo - orbita.el) * 0.12;
    const t = (agora - orbita.t0) / 1000;
    const dz = orbita.flutua * Math.sin(t * 0.55) * 0.011;
    const de = orbita.flutua * Math.sin(t * 0.41 + 1.1) * 0.007;
    const pc = polar(poseCorte.loc, poseCorte.alvo);
    const el = Math.min(rad(ARRASTO.elMax), Math.max(rad(ARRASTO.elMin), pc.el + orbita.el + de));
    pose = { ...poseCorte, loc: deOrbita(poseCorte.alvo, pc.az + orbita.az + dz, el, pc.dist) };
    desenha();
  }
  const rad = (g) => (g * Math.PI) / 180;

  /** liga o laço de desenho na pose do corte (entrada terminada) */
  function assenta(p) {
    poseCorte = p;
    Object.assign(orbita, { az: 0, el: 0, azAlvo: 0, elAlvo: 0, t0: performance.now() });
    gsap.killTweensOf(orbita);
    gsap.to(orbita, { flutua: 1, duration: 1.2, ease: 'power1.inOut' });
    cancelAnimationFrame(laco);
    laco = requestAnimationFrame(passo);
  }

  function solta() {
    cancelAnimationFrame(laco);
    laco = 0;
    gsap.killTweensOf(orbita);
    orbita.flutua = 0;
    poseCorte = null;
  }

  // arrasto: 0,28° por pixel na horizontal e 0,2° na vertical; ao soltar, volta devagar
  let arrasto = null;
  function ligaArrasto(el, podeArrastar) {
    el.addEventListener('pointerdown', (e) => {
      if (!poseCorte || !podeArrastar(e) || e.target.closest('.ponto')) return;
      arrasto = { x: e.clientX, y: e.clientY, az: orbita.azAlvo, el: orbita.elAlvo };
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('arrastando');
      gsap.killTweensOf(orbita, 'azAlvo,elAlvo');
    });
    el.addEventListener('pointermove', (e) => {
      if (!arrasto) return;
      const pc = polar(poseCorte.loc, poseCorte.alvo);
      orbita.azAlvo = Math.max(-rad(ARRASTO.az), Math.min(rad(ARRASTO.az), arrasto.az - rad((e.clientX - arrasto.x) * 0.28)));
      orbita.elAlvo = Math.max(rad(ARRASTO.elMin) - pc.el, Math.min(rad(ARRASTO.elMax) - pc.el, arrasto.el + rad((e.clientY - arrasto.y) * 0.2)));
    });
    const fim = () => {
      if (!arrasto) return;
      arrasto = null;
      el.classList.remove('arrastando');
      gsap.to(orbita, { azAlvo: 0, elAlvo: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.5 });
    };
    el.addEventListener('pointerup', fim);
    el.addEventListener('pointercancel', fim);
  }

  // ---------- API ----------
  return {
    carrega,
    /** mostra a tipologia (já carregada) e monta as âncoras dos hotspots */
    async usa(tipologia) {
      const r = await carrega(tipologia);
      if (atual) atual.grupo.visible = false;
      atual = r;
      r.grupo.visible = true;
      hotspots = Object.entries(r.poses.hotspots).map(([id, p]) => ({ id, p: new Vector3(...p) }));
      return r.poses;
    },
    get poses() { return atual?.poses; },
    /** fim do desenho de cada quadro: { id: [x, y] } dos hotspots, em pixels do palco */
    aoDesenhar(fn) {
      aoDesenhar = () => fn(Object.fromEntries(hotspots.map((h) => [h.id, projeta(h.p)])));
    },
    /** pose de câmera do JSON + onde fica o quadro virtual no palco */
    pose(nome, q) {
      const d = nome === 'frente' || nome === 'corte' ? atual.poses[nome] : atual.poses.comodos[nome];
      return { loc: d.loc, alvo: d.alvo, lente: d.lente, sx: d.sx, sy: d.sy, q };
    },
    setPose,
    arco,
    mergulho: (a, b, u) => mergulho(a, b, u, atual.poses.caixa.y[1]),
    assenta,
    solta,
    ligaArrasto,
    ajusta: () => {
      medeTela();
      desenha();
    },
    get ligado() { return !!laco; },
    get poseAtual() { return pose; },
    QUADRO,
  };
}
