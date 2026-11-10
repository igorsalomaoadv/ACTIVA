// O zoom do clique no andar: pintado num canvas do tamanho da tela, quadro a quadro, com a placa da torre em alta.
//
// A placa é um render da região da torre com a MESMA câmera do hero em resolução 4× (fonte/hero.py --placa; passes
// base e acesa, cortados em faixas pelo otimiza.mjs). Casa pixel a pixel com o hero multiplicado por 4, então entra
// sobre ele sem deslocar nada, assim que a escala passa do que o hero sustenta. Em canvas, e não em CSS, porque um
// bloco com will-change: transform é rasterizado uma vez só pelo navegador: aumentar com scale() estica essa textura,
// por melhor que seja a imagem dentro dele.
//
// Sem placa (ainda não carregou, ou assets.json não a traz), o canvas pinta o hero normal: fica macio, mas funciona.
const suave = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function criaZoom({ palco, canvas, fachada, movel }) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let manifesto = null;
  let dpr = 1;
  const cache = new Map(); // url → ImageBitmap | Promise

  function mede() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(palco.clientWidth * dpr), h = Math.round(palco.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /** o nível que a laje final pede em pixels de tela: 8× em retina grande (se existir), 4×, ou 2× (celular, tela de 1x) */
  function nivelPara() {
    const fr = movel() ? 0.92 : 0.72;
    const g = fachada.geo(14);
    const f = fachada.res[0] / 2560;
    const largura2560 = g ? (g.x1 - g.x0) / f : 366;
    const pxPorHero = (fr * palco.clientWidth * Math.min(devicePixelRatio || 1, 2)) / largura2560;
    if (pxPorHero >= 5.2 && manifesto?.niveis?.[8]) return 8;
    return pxPorHero >= 2.6 ? 4 : 2;
  }

  function faixasDe(andar, nivel) {
    if (!manifesto) return [];
    const n = manifesto.niveis?.[nivel];
    if (!n) return [];
    const g = fachada.geo(andar);
    if (!g) return [];
    const f = fachada.res[0] / 2560;
    // janela vertical que a tela mostra com o andar centrado (em coordenadas do hero 2560), com folga
    const fr = movel() ? 0.92 : 0.72;
    const s = (fr * palco.clientWidth) / ((g.x1 - g.x0) / f);
    const meia = (palco.clientHeight / s) * 0.62;
    const cy = g.cy / f;
    return n.faixas.map((fx, i) => ({ ...fx, i })).filter((fx) => fx.y1 > cy - meia && fx.y0 < cy + meia);
  }

  function bitmap(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.blob();
      })
      .then((b) => createImageBitmap(b))
      .then((im) => {
        cache.set(url, im);
        return im;
      })
      .catch(() => {
        cache.set(url, null);
        return null;
      });
    cache.set(url, p);
    return p;
  }

  /** busca as faixas que o andar vai precisar (no hover e no clique); resolve quando todas chegaram */
  function prepara(andar) {
    const nivel = nivelPara();
    const fx = faixasDe(andar, nivel);
    if (!fx.length) return Promise.resolve(false);
    const g = fachada.geo(andar);
    const f = fachada.res[0] / 2560;
    const lista = [];
    for (const x of fx) {
      lista.push(bitmap(manifesto.niveis[nivel].arquivo.replace('{passe}', 'base').replace('{i}', x.i)));
      // a versão acesa só nas faixas que o andar toca
      if (x.y1 > g.y0 / f && x.y0 < g.y1 / f) lista.push(bitmap(manifesto.niveis[nivel].arquivo.replace('{passe}', 'acesa').replace('{i}', x.i)));
    }
    return Promise.all(lista).then(() => true);
  }

  // ---------- pintura ----------
  function desenhaPlaca(passe, nivel, faixas, f, alfa) {
    if (alfa <= 0) return;
    const n = manifesto.niveis[nivel];
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alfa;
    for (const fx of faixas) {
      const im = cache.get(n.arquivo.replace('{passe}', passe).replace('{i}', fx.i));
      if (im && !(im instanceof Promise)) {
        // a faixa tem alguns pixels de sobra embaixo: a emenda antisserrilhada fica sobre a faixa de cima
        ctx.drawImage(im, fx.x0 * f, fx.y0 * f, im.width / nivel * f, im.height / nivel * f);
      }
    }
    ctx.globalAlpha = a0;
  }

  // a placa acesa recortada pela máscara do andar, montada uma vez quando as faixas chegam
  const altas = new Map();
  function luzAlta(andar, nivel, faixas, f, luz) {
    const chave = `${andar}-${nivel}`;
    if (altas.has(chave)) return altas.get(chave);
    const n = manifesto.niveis[nivel];
    const y0 = luz.y / f, y1 = (luz.y + luz.h) / f;
    const tocam = faixas.filter((fx) => fx.y1 > y0 && fx.y0 < y1);
    const imgs = tocam.map((fx) => cache.get(n.arquivo.replace('{passe}', 'acesa').replace('{i}', fx.i)));
    if (!tocam.length || imgs.some((im) => !im || im instanceof Promise)) return null;
    const c = document.createElement('canvas');
    c.width = Math.round((luz.w / f) * nivel);
    c.height = Math.round((luz.h / f) * nivel);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    tocam.forEach((fx, i) => g.drawImage(imgs[i], (fx.x0 - luz.x / f) * nivel, (fx.y0 - y0) * nivel));
    g.globalCompositeOperation = 'destination-in';
    g.scale(c.width / luz.w, c.height / luz.h);
    g.fill(luz.path, 'evenodd');
    altas.set(chave, c);
    return c;
  }

  function poligonoFaixa(g) {
    const p = new Path2D();
    const yt = (x) => g.topo[0] + g.topo[1] * x;
    const yb = (x) => g.base[0] + g.base[1] * x;
    p.moveTo(g.x0, yt(g.x0));
    p.lineTo(g.x1, yt(g.x1));
    p.lineTo(g.x1, yb(g.x1));
    p.lineTo(g.x0, yb(g.x0));
    p.closePath();
    return p;
  }

  /**
   * e: { x, y, s (transformação da cena), andar, escurece (0..1), mira (0..1 do contorno), opacidade (opacidade da fachada),
   * blur (px de tela), faixa (opacidade do andar) }
   */
  function pinta(e) {
    mede();
    const [RW, RH] = fachada.res;
    const f = RW / 2560;
    const g = fachada.geo(e.andar);
    const nivel = nivelPara();
    const faixas = manifesto ? faixasDe(e.andar, nivel) : [];
    // a placa entra quando o pixel dela fica perto do tamanho do pixel da tela (antes disso seria reduzida demais,
    // e no canvas não há mipmap para reduzir sem serrilhar)
    const pxTela = ((e.s / f) * dpr) / nivel;
    const alfaPlaca = faixas.length ? suave(0.3, 0.55, pxTela) : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high'; // reduzir a placa sem serrilhar a borda da torre
    const cena = () => ctx.setTransform(dpr * e.s, 0, 0, dpr * e.s, dpr * e.x, dpr * e.y);

    const fachadaInteira = () => {
      ctx.drawImage(fachada.base, 0, 0, RW, RH);
      const tn = fachada.torreNitida;
      if (tn) ctx.drawImage(tn.img, tn.x, tn.y, tn.w, tn.h);
      if (alfaPlaca > 0) desenhaPlaca('base', nivel, faixas, f, alfaPlaca);
      if (e.escurece > 0) {
        ctx.fillStyle = `rgba(4,7,12,${e.escurece})`;
        ctx.fillRect(0, 0, RW, RH);
      }
    };

    // a fachada some inteira, desfocando no lugar; a maquete, por baixo, aparece conforme ela fica transparente
    if (e.opacidade > 0) {
      ctx.save();
      cena();
      ctx.globalAlpha = e.opacidade;
      if (e.blur > 0 && 'filter' in ctx) ctx.filter = `blur(${(e.blur * dpr).toFixed(1)}px)`;
      fachadaInteira();
      ctx.restore();
    }

    // o andar aceso por cima
    if (g && e.faixa > 0) {
      ctx.save();
      cena();
      const poli = poligonoFaixa(g);
      ctx.globalAlpha = e.faixa;
      const luz = fachada.luzDe(e.andar);
      if (luz) {
        // de longe, o recorte da máscara (o mesmo do hover); de perto, a placa acesa recortada pela mesma máscara
        ctx.drawImage(luz.canvas, luz.x, luz.y, luz.w, luz.h);
        const alta = alfaPlaca > 0 ? luzAlta(e.andar, nivel, faixas, f, luz) : null;
        if (alta) {
          ctx.globalAlpha = e.faixa * alfaPlaca;
          ctx.drawImage(alta, luz.x, luz.y, luz.w, luz.h);
        }
      }
      if (e.mira > 0) {
        ctx.globalAlpha = e.faixa * e.mira;
        ctx.strokeStyle = 'rgba(241,236,227,0.95)';
        ctx.lineWidth = 1.5 / e.s;
        ctx.lineJoin = 'round';
        // o mesmo traçado do hover, colado no andar; a faixa reta só serve de reserva
        if (luz) {
          ctx.translate(luz.x, luz.y);
          ctx.stroke(luz.path);
        } else ctx.stroke(poli);
      }
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return {
    set manifesto(m) { manifesto = m; },
    prepara,
    pinta,
    canvas,
    limpa() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
