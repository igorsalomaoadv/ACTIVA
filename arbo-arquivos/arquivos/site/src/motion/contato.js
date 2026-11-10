// Formulário sem backend: valida, simula o envio e avisa. Para ligar num serviço real, troque o setTimeout por um fetch.
export function contato() {
  const form = document.querySelector('.form');
  const aviso = form.querySelector('.form__aviso');
  const botao = form.querySelector('.form__enviar');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    for (const campo of form.querySelectorAll('input[required]')) {
      const valido = campo.value.trim() && campo.checkValidity();
      campo.setAttribute('aria-invalid', !valido);
      if (!valido && ok) {
        campo.focus();
        ok = false;
      }
    }
    if (!ok) {
      aviso.textContent = 'Confira os campos marcados.';
      return;
    }
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    setTimeout(() => {
      const nome = form.nome.value.trim().split(' ')[0];
      aviso.textContent = `Obrigado, ${nome}. Um consultor liga em até um dia útil para marcar o horário. (Envio simulado nesta demonstração.)`;
      botao.textContent = 'Pedido enviado';
      form.reset();
    }, 900);
  });
}
