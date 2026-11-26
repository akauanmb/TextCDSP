'use strict';

// Janela de configurações e seus canais IPC. Só os seis canais abaixo existem; nada além disso
// é exposto à página. A janela não carrega conteúdo remoto nem permite navegar para fora.

const { BrowserWindow, ipcMain, dialog } = require('electron');
const { textoStatusSync } = require('../shared/statusSync');

const LIMITE_PROBLEMAS = 200;

function criarJanelaConfiguracoes({ caminhos, log, obterConfig, salvarConfig, sincronizador }) {
  let janela = null;

  // Estado da sincronização como a página precisa: com o texto pronto e sem listas gigantes.
  function estadoParaPagina() {
    const estado = sincronizador.estadoAtual();
    return {
      ...estado,
      texto: textoStatusSync(estado),
      erros: estado.erros.slice(0, LIMITE_PROBLEMAS),
      avisos: estado.avisos.slice(0, LIMITE_PROBLEMAS),
    };
  }

  // Só aceita chamadas vindas da nossa janela.
  const somenteDaJanela = (tratador) => async (evento, ...argumentos) => {
    if (!janela || janela.isDestroyed() || evento.sender !== janela.webContents) {
      throw new Error('Chamada recusada: origem não autorizada.');
    }
    return tratador(...argumentos);
  };

  ipcMain.handle('config:ler', somenteDaJanela(() => obterConfig()));

  ipcMain.handle('config:salvar', somenteDaJanela(async (entrada) => {
    const resposta = await salvarConfig(entrada);
    return resposta.ok ? { ok: true, config: resposta.config, estado: estadoParaPagina() } : resposta;
  }));

  ipcMain.handle('fonte:escolher', somenteDaJanela(async () => {
    const escolha = await dialog.showOpenDialog(janela, { title: 'Escolher a pasta de snippets', properties: ['openDirectory'] });
    return escolha.canceled || escolha.filePaths.length === 0 ? null : escolha.filePaths[0];
  }));

  ipcMain.handle('fonte:testar', somenteDaJanela(async (pasta) => {
    const resultado = await sincronizador.testar(typeof pasta === 'string' ? pasta : '');
    return { ...resultado, erros: resultado.erros.slice(0, LIMITE_PROBLEMAS), avisos: resultado.avisos.slice(0, LIMITE_PROBLEMAS) };
  }));

  ipcMain.handle('sync:estado', somenteDaJanela(() => estadoParaPagina()));

  ipcMain.handle('sync:agora', somenteDaJanela(async () => {
    await sincronizador.sincronizar();
    return estadoParaPagina();
  }));

  // Abre a janela (ou traz a que já está aberta para frente).
  function abrir() {
    if (janela && !janela.isDestroyed()) {
      if (janela.isMinimized()) janela.restore();
      janela.show();
      janela.focus();
      return janela;
    }

    janela = new BrowserWindow({
      width: 700,
      height: 780,
      minWidth: 560,
      minHeight: 520,
      show: false,
      title: 'TextCDSP - Configurações',
      icon: caminhos.icone,
      autoHideMenuBar: true,
      webPreferences: {
        preload: caminhos.preloadConfiguracoes,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    janela.removeMenu();

    // Nada de conteúdo remoto: bloqueia navegação, novas janelas e pedidos de permissão.
    janela.webContents.on('will-navigate', (evento) => evento.preventDefault());
    janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    janela.webContents.session.setPermissionRequestHandler((_conteudo, _permissao, responder) => responder(false));

    janela.once('ready-to-show', () => janela && !janela.isDestroyed() && janela.show());
    janela.on('closed', () => {
      janela = null;
    });
    janela.loadFile(caminhos.paginaConfiguracoes).catch((erro) => log.erro('Não foi possível abrir a janela de configurações', erro));
    return janela;
  }

  return { abrir, obterJanela: () => janela };
}

module.exports = { criarJanelaConfiguracoes };
