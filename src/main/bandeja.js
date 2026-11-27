'use strict';

// Ícone da bandeja do Windows: tooltip de estado e menu. Não decide nada: chama as ações recebidas.

const { Tray, Menu, nativeImage } = require('electron');
const { rotuloInstalar } = require('../shared/versaoInstalador');

function criarBandeja({ icone, aoAlternar, aoAtualizarSnippets, aoAbrirBiblioteca, aoAbrirConfiguracoes, aoAbrirPessoais, aoAbrirLogs, aoAbrirSobre, aoInstalarVersao, aoSair, log }) {
  const imagem = nativeImage.createFromPath(icone);
  if (imagem.isEmpty()) log.aviso(`Não foi possível carregar o ícone da bandeja em ${icone}`);
  const tray = new Tray(imagem);

  let estadoMotor = 'iniciando'; // "iniciando" | "ativo" | "pausado" | "erro"
  let textoSync = 'Sincronizando snippets...';
  let versaoDisponivel = null; // versão nova na pasta compartilhada (Marco 7), ou null

  function montarMenu() {
    return Menu.buildFromTemplate([
      { label: `Status: ${estadoMotor}`, enabled: false },
      { label: textoSync, enabled: false },
      ...(versaoDisponivel ? [{ label: rotuloInstalar(versaoDisponivel), click: aoInstalarVersao }] : []),
      { type: 'separator' },
      { label: estadoMotor === 'ativo' ? 'Pausar' : 'Retomar', enabled: estadoMotor !== 'iniciando', click: aoAlternar },
      { label: 'Atualizar snippets', click: aoAtualizarSnippets },
      { label: 'Abrir biblioteca', click: aoAbrirBiblioteca },
      { label: 'Configurações...', click: aoAbrirConfiguracoes },
      { label: 'Abrir meus snippets pessoais', click: aoAbrirPessoais },
      { label: 'Abrir pasta de logs', click: aoAbrirLogs },
      { label: 'Sobre o TextCDSP', click: aoAbrirSobre },
      { type: 'separator' },
      { label: 'Sair', click: aoSair },
    ]);
  }

  function reconstruir() {
    tray.setToolTip(`TextCDSP - ${estadoMotor}`);
    tray.setContextMenu(montarMenu());
  }

  // Clique duplo no ícone abre a Biblioteca.
  tray.on('double-click', aoAbrirBiblioteca);

  reconstruir();
  return {
    atualizar(estado) {
      estadoMotor = estado;
      reconstruir();
    },
    atualizarSync(texto) {
      textoSync = texto;
      reconstruir();
    },
    // `versao` = "0.2.0" quando há instalador novo; null quando não há (o item some do menu).
    atualizarVersaoDisponivel(versao) {
      versaoDisponivel = versao || null;
      reconstruir();
    },
    destruir: () => tray.destroy(),
  };
}

module.exports = { criarBandeja };
