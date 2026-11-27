'use strict';

// Ícone flutuante (Marco 11): uma janela de 48x48, sem moldura, redonda, sempre por cima, fora da barra de
// tarefas e do Alt+Tab e que NÃO tira o foco do programa em que a pessoa está digitando (focusable: false,
// mostrada com showInactive). Aparece quando a janela principal é minimizada; um clique reabre a janela.
//
// Canais IPC (só da janela do ícone; os números recebidos são validados):
//   icone:mover  { x, y, fim }  posição de tela desejada para o canto do ícone; `fim` = soltou o botão
//   icone:abrir                 clique (sem arrasto): abre a janela principal
//   icone:menu                  botão direito: menu "Abrir TextCDSP" / "Esconder ícone"
// A posição é gravada só ao soltar (aoPosicionar), e a lógica de posição (limites, monitor desconectado)
// está em src/shared/posicaoIcone.js.

const { BrowserWindow, ipcMain, Menu, screen } = require('electron');
const { TAMANHO_ICONE, MARGEM_PADRAO, validarPosicaoRecebida, posicaoInicial, limitarPosicao } = require('../shared/posicaoIcone');

/**
 * @param {object} p
 * @param {object} p.caminhos
 * @param {object} p.log
 * @param {() => ({x: number, y: number}|null)} p.obterPosicaoSalva
 * @param {(posicao: {x: number, y: number}) => void} p.aoPosicionar  chamada ao soltar o ícone, para guardar a posição
 * @param {() => void} p.aoAbrir                                       pedido de abrir a janela principal
 */
function criarIconeFlutuante({ caminhos, log, obterPosicaoSalva, aoPosicionar, aoAbrir }) {
  let janela = null;

  const existe = () => janela && !janela.isDestroyed();
  const areasDeTrabalho = () => screen.getAllDisplays().map((d) => d.workArea);

  // Só aceita mensagens vindas da página do próprio ícone.
  const doIcone = (evento) => existe() && evento.sender === janela.webContents;

  function colocar(posicao) {
    janela.setBounds({ x: posicao.x, y: posicao.y, width: TAMANHO_ICONE, height: TAMANHO_ICONE });
  }

  ipcMain.on('icone:mover', (evento, pedido) => {
    if (!doIcone(evento)) return;
    const posicao = validarPosicaoRecebida(pedido);
    if (!posicao) return;
    const limitada = limitarPosicao(posicao, areasDeTrabalho(), TAMANHO_ICONE);
    colocar(limitada);
    if (pedido.fim === true) aoPosicionar(limitada);
  });

  ipcMain.on('icone:abrir', (evento) => {
    if (doIcone(evento)) aoAbrir();
  });

  ipcMain.on('icone:menu', (evento) => {
    if (!doIcone(evento)) return;
    Menu.buildFromTemplate([
      { label: 'Abrir TextCDSP', click: () => aoAbrir() },
      { label: 'Esconder ícone', click: () => esconder() },
    ]).popup({ window: janela });
  });

  function criar() {
    janela = new BrowserWindow({
      width: TAMANHO_ICONE,
      height: TAMANHO_ICONE,
      minWidth: TAMANHO_ICONE,
      minHeight: TAMANHO_ICONE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true, // fora da barra de tarefas e do Alt+Tab
      alwaysOnTop: true,
      focusable: false, // não tira o foco do programa em que a pessoa está digitando
      title: 'TextCDSP',
      icon: caminhos.icone,
      webPreferences: {
        preload: caminhos.preloadIcone,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const propria = janela;
    // Acima das outras janelas, inclusive de programas em tela cheia "janelada".
    propria.setAlwaysOnTop(true, 'screen-saver');
    propria.removeMenu();

    // Nada de conteúdo remoto: bloqueia navegação, novas janelas e pedidos de permissão.
    propria.webContents.on('will-navigate', (evento) => evento.preventDefault());
    propria.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    propria.webContents.session.setPermissionRequestHandler((_conteudo, _permissao, responder) => responder(false));
    propria.on('closed', () => {
      if (janela === propria) janela = null;
    });
    propria.loadFile(caminhos.paginaIcone).catch((erro) => log.erro('Não foi possível abrir o ícone flutuante', erro));
    return propria;
  }

  // Mostra o ícone sem tirar o foco de quem está digitando. Na posição salva se ela estiver na área de trabalho de
  // algum monitor; senão, no canto inferior direito do monitor principal, com margem.
  function mostrar() {
    if (!existe()) criar();
    const posicao = posicaoInicial(obterPosicaoSalva(), areasDeTrabalho(), screen.getPrimaryDisplay().workArea, TAMANHO_ICONE, MARGEM_PADRAO);
    colocar(posicao);
    janela.showInactive();
  }

  function esconder() {
    if (existe() && janela.isVisible()) janela.hide();
  }

  function destruir() {
    if (existe()) janela.destroy();
    janela = null;
  }

  return { mostrar, esconder, destruir, estaVisivel: () => Boolean(existe() && janela.isVisible()), obterJanela: () => (existe() ? janela : null) };
}

module.exports = { criarIconeFlutuante };
