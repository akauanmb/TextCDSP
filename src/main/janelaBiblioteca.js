'use strict';

// Janela Biblioteca e seus canais IPC: biblioteca:listar, biblioteca:copiar, pessoal:salvar,
// pessoal:excluir e pessoal:abrir-arquivo (mais o aviso biblioteca:mudou, do processo principal para a página).
// Uma única janela: se já estiver aberta, só vem para a frente. Não carrega conteúdo remoto.

const { BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const { carregarBiblioteca, prepararCopia, salvarPessoal, excluirPessoal } = require('./biblioteca');

function criarJanelaBiblioteca({ caminhos, log, obterAplicadoEm }) {
  let janela = null;

  // Só aceita chamadas vindas da nossa janela.
  const somenteDaJanela = (tratador) => async (evento, ...argumentos) => {
    if (!janela || janela.isDestroyed() || evento.sender !== janela.webContents) {
      throw new Error('Chamada recusada: origem não autorizada.');
    }
    return tratador(...argumentos);
  };

  // Avisa a janela (se estiver aberta) de que a lista precisa ser relida.
  function notificarMudanca() {
    if (janela && !janela.isDestroyed()) janela.webContents.send('biblioteca:mudou');
  }

  ipcMain.handle('biblioteca:listar', somenteDaJanela(() => carregarBiblioteca(caminhos, { aplicadoEm: obterAplicadoEm() })));

  ipcMain.handle('biblioteca:copiar', somenteDaJanela(async (pedido) => {
    const preparo = await prepararCopia(caminhos, pedido);
    if (!preparo.ok) return preparo;
    // Para html, vai o html e o texto puro: o Google Docs usa o html e mantém negrito, listas etc.
    if (preparo.html) clipboard.write({ text: preparo.texto, html: preparo.html });
    else clipboard.writeText(preparo.texto);
    return { ok: true, comFormatacao: Boolean(preparo.html) };
  }));

  ipcMain.handle('pessoal:salvar', somenteDaJanela(async (entrada) => {
    const resposta = await salvarPessoal(caminhos, entrada);
    if (resposta.ok) {
      log.info(`Atalho pessoal salvo: ${resposta.trigger}`);
      notificarMudanca();
    }
    return resposta;
  }));

  ipcMain.handle('pessoal:excluir', somenteDaJanela(async (pedido) => {
    const resposta = await excluirPessoal(caminhos, pedido);
    if (resposta.ok) {
      log.info(`Atalho pessoal excluído: ${resposta.trigger}`);
      notificarMudanca();
    }
    return resposta;
  }));

  ipcMain.handle('pessoal:abrir-arquivo', somenteDaJanela(async () => {
    const erro = await shell.openPath(caminhos.pessoalYml);
    if (erro) log.erro(`Não foi possível abrir o arquivo de atalhos pessoais: ${erro}`);
    return { ok: !erro, mensagem: erro ? 'Não foi possível abrir o arquivo no editor padrão.' : '' };
  }));

  function abrir() {
    if (janela && !janela.isDestroyed()) {
      if (janela.isMinimized()) janela.restore();
      janela.show();
      janela.focus();
      return janela;
    }

    janela = new BrowserWindow({
      width: 1040,
      height: 720,
      minWidth: 760,
      minHeight: 520,
      show: false,
      title: 'TextCDSP - Biblioteca',
      icon: caminhos.icone,
      autoHideMenuBar: true,
      webPreferences: {
        preload: caminhos.preloadBiblioteca,
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
    janela.loadFile(caminhos.paginaBiblioteca).catch((erro) => log.erro('Não foi possível abrir a janela Biblioteca', erro));
    return janela;
  }

  return { abrir, notificarMudanca, obterJanela: () => janela };
}

module.exports = { criarJanelaBiblioteca };
