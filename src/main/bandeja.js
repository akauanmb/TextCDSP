'use strict';

// Ícone da bandeja do Windows: tooltip de estado e menu. Não decide nada: chama as ações recebidas.

const { Tray, Menu, nativeImage } = require('electron');

// estado: "iniciando" | "ativo" | "pausado" | "erro"
function criarBandeja({ icone, aoAlternar, aoAbrirPessoais, aoAbrirLogs, aoSair, log }) {
  const imagem = nativeImage.createFromPath(icone);
  if (imagem.isEmpty()) log.aviso(`Não foi possível carregar o ícone da bandeja em ${icone}`);
  const tray = new Tray(imagem);

  function montarMenu(estado) {
    return Menu.buildFromTemplate([
      { label: `Status: ${estado}`, enabled: false },
      { label: estado === 'ativo' ? 'Pausar' : 'Retomar', enabled: estado !== 'iniciando', click: aoAlternar },
      { label: 'Atualizar snippets (em breve)', enabled: false },
      { label: 'Abrir biblioteca (em breve)', enabled: false },
      { label: 'Abrir meus snippets pessoais', click: aoAbrirPessoais },
      { label: 'Abrir pasta de logs', click: aoAbrirLogs },
      { type: 'separator' },
      { label: 'Sair', click: aoSair },
    ]);
  }

  function atualizar(estado) {
    tray.setToolTip(`TextCDSP - ${estado}`);
    tray.setContextMenu(montarMenu(estado));
  }

  atualizar('iniciando');
  return { atualizar, destruir: () => tray.destroy() };
}

module.exports = { criarBandeja };
