'use strict';

// Página do ícone flutuante. Arrastar usa pointerdown/pointermove/pointerup com setPointerCapture e manda a posição
// de tela ao processo principal, que move a janela. NÃO usa -webkit-app-region: drag, porque ele engole o clique.
// Um movimento de menos de 4 px conta como clique.
//
// A janela anda debaixo do ponteiro enquanto se arrasta, então o ponteiro sai de cima da imagem logo no primeiro
// movimento. Por isso o movimento e o soltar são ouvidos no document (além do setPointerCapture): ouvir só na
// imagem perderia o resto do arrasto.

(function () {
  const api = window.textcdspIcone;
  const alvo = document.getElementById('icone');
  const LIMITE_DO_CLIQUE_PX = 4;

  let arrasto = null; // { id, pontoX, pontoY, janelaX, janelaY, moveu }

  // Posição desejada para o canto da janela: onde ela estava + quanto o ponteiro andou na tela.
  const destino = (base, evento) => ({
    x: base.janelaX + (evento.screenX - base.pontoX),
    y: base.janelaY + (evento.screenY - base.pontoY),
  });

  alvo.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0) return; // o botão direito abre o menu (evento contextmenu)
    try {
      alvo.setPointerCapture(evento.pointerId);
    } catch {
      // sem captura, o document ainda recebe o resto do arrasto
    }
    arrasto = { id: evento.pointerId, pontoX: evento.screenX, pontoY: evento.screenY, janelaX: window.screenX, janelaY: window.screenY, moveu: false };
  });

  document.addEventListener('pointermove', (evento) => {
    if (!arrasto || evento.pointerId !== arrasto.id) return;
    const andou = Math.hypot(evento.screenX - arrasto.pontoX, evento.screenY - arrasto.pontoY);
    if (!arrasto.moveu && andou < LIMITE_DO_CLIQUE_PX) return;
    if (!arrasto.moveu) {
      arrasto.moveu = true;
      alvo.classList.add('arrastando');
    }
    const { x, y } = destino(arrasto, evento);
    api.mover(x, y, false);
  });

  function terminar(evento, cancelado) {
    if (!arrasto || evento.pointerId !== arrasto.id) return;
    const atual = arrasto;
    arrasto = null;
    alvo.classList.remove('arrastando');
    if (alvo.hasPointerCapture(evento.pointerId)) alvo.releasePointerCapture(evento.pointerId);
    if (atual.moveu) {
      const { x, y } = destino(atual, evento);
      api.mover(x, y, true); // soltou: o processo principal guarda a posição
    } else if (!cancelado) {
      api.abrir();
    }
  }

  document.addEventListener('pointerup', (evento) => terminar(evento, false));
  document.addEventListener('pointercancel', (evento) => terminar(evento, true));

  alvo.addEventListener('contextmenu', (evento) => {
    evento.preventDefault();
    api.menu();
  });
})();
