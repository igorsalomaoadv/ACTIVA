// Entrada no scroll: fade com deslocamento curto, uma vez, quando o bloco passa 100 px da borda da tela.
// O bloco diz como entra no próprio HTML: data-revela="y:40,dur:0.8,atraso:0.1" (ou x para entrar de lado).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const le = (txt) => Object.fromEntries((txt || '').split(',').filter(Boolean).map((p) => {
  const [k, v] = p.split(':');
  return [k.trim(), parseFloat(v)];
}));

export function revela(reduzido) {
  gsap.utils.toArray('[data-revela]').forEach((el) => {
    const o = le(el.dataset.revela);
    gsap.from(el, {
      autoAlpha: 0,
      x: reduzido ? 0 : o.x ?? 0,
      y: reduzido ? 0 : o.y ?? 0,
      duration: reduzido ? 0.3 : o.dur ?? 0.7,
      delay: reduzido ? 0 : o.atraso ?? 0,
      ease: 'power1.out',
      clearProps: 'transform',
      scrollTrigger: { trigger: el, start: 'top bottom-=100', once: true },
    });
  });
  ScrollTrigger.refresh();
}
