// Âncoras da página e nav em vidro claro depois do explorador. Com a planta ou a galeria abertas, um link da nav
// primeiro devolve o explorador à fachada (sem animação) e só então rola.
export function nav({ lenis, explorador }) {
  const el = document.querySelector('.nav');
  const solida = () => el.classList.toggle('nav--clara', scrollY > document.querySelector('.explorador').offsetHeight - 60);
  lenis?.on('scroll', solida);
  addEventListener('scroll', solida, { passive: true });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const alvo = document.querySelector(a.getAttribute('href'));
    if (!alvo) return;
    e.preventDefault();
    const andar = +a.dataset.andar;
    if (andar) {
      explorador.fechaJa();
      explorador.abrir(andar);
      return;
    }
    explorador.fechaJa();
    if (lenis) lenis.scrollTo(alvo, { duration: 1.4, offset: alvo.id === 'explorador' ? 0 : -10 });
    else alvo.scrollIntoView({ behavior: 'smooth' });
  });

  // "Ver em 3D" das seções do apartamento e da cobertura: sobe e abre o explorador já na planta
  document.querySelectorAll('[data-explorar]').forEach((b) =>
    b.addEventListener('click', () => {
      explorador.fechaJa();
      explorador.abrir(+b.dataset.explorar);
    }),
  );
}
