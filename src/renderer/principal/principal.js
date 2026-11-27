'use strict';

// Menu lateral e comportamento da janela como um todo: troca de seção, texto de status da sincronização,
// "Minimizar para ícone" e as teclas que valem em qualquer seção.

(function () {
  const { api, $, SECOES, irParaSecao, secaoAtiva, aoEstado, publicarEstado } = window.CDSPComum;
  const INTERVALO_ESTADO_MS = 3000;

  // ---- Menu ----
  for (const secao of SECOES) $(`menu-${secao}`).addEventListener('click', () => irParaSecao(secao));

  // O processo principal pede para abrir numa seção (menu da bandeja, notificação, primeira execução...).
  api.aoAbrirSecao((secao) => irParaSecao(secao));

  // ---- Minimizar ----
  const minimizar = () => api.minimizarParaIcone().catch(() => {});
  $('minimizar').addEventListener('click', minimizar);

  // Esc minimiza, salvo na Biblioteca, onde ele primeiro fecha o formulário ou a confirmação que estiver aberta
  // (biblioteca.js cuida disso e chama minimizar() quando não há nada a fechar).
  window.CDSPComum.minimizar = minimizar;
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && secaoAtiva() !== 'biblioteca') {
      evento.preventDefault();
      minimizar();
    }
  });

  // ---- Status da sincronização (o mesmo texto da bandeja), no rodapé do menu ----
  aoEstado((estado) => {
    const texto = $('status-sync');
    texto.textContent = estado.texto || '';
    texto.className = `status-menu ${estado.status || ''}`;
  });

  async function atualizarEstado() {
    try {
      publicarEstado(await api.estadoSync());
    } catch {
      // a janela pode estar fechando
    }
  }

  atualizarEstado();
  // Mantém o estado em dia enquanto a janela existe (o app sincroniza sozinho a cada ciclo).
  setInterval(atualizarEstado, INTERVALO_ESTADO_MS);
  window.CDSPComum.atualizarEstado = atualizarEstado;

  // Começa na Biblioteca; o processo principal manda a seção certa assim que a página carrega.
  irParaSecao('biblioteca');
})();
