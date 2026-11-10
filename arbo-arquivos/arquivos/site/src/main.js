import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './sections/abertura.css';
import './sections/nav.css';
import './sections/explorador.css';
import './sections/sobre.css';
import './sections/residencia.css';
import './sections/lazer.css';
import './sections/ficha.css';
import './sections/contato.css';
import './sections/rodape.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { smooth } from './motion/smooth.js';
import { explorador as criaExplorador } from './motion/explorador/index.js';
import { nav } from './motion/nav.js';
import { revela } from './motion/revela.js';
import { contato } from './motion/contato.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lenis = smooth();
lenis.stop();

const explorador = criaExplorador({ lenis, reduzido });
nav({ lenis, explorador });
contato();

const fontes = Promise.all([
  document.fonts.load('400 40px "Instrument Serif"', 'Arbo'),
  document.fonts.load('400 16px Inter'),
  document.fonts.load('500 16px Inter'),
]).catch(() => {});

await Promise.all([fontes, explorador.pronta.catch(() => {})]);
revela(reduzido);

const abertura = document.querySelector('.abertura');
gsap.to(abertura, { autoAlpha: 0, duration: reduzido ? 0.2 : 0.8, ease: 'power2.inOut', onComplete: () => abertura.remove() });
if (!reduzido) {
  explorador.introZoom();
  gsap.from('.nav, .fachada__texto, .fachada__dica, .fachada__pe', { autoAlpha: 0, y: 12, duration: 1, stagger: 0.08, delay: 0.5, ease: 'power3.out' });
}
lenis.start();
addEventListener('load', () => ScrollTrigger.refresh());
