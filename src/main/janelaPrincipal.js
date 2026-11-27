'use strict';

// Janela principal do TextCDSP (Marco 11): menu lateral com "Biblioteca" e "Configurações". Substitui as duas
// janelas separadas. Uma única janela: se já existir, só vem para a frente, na seção pedida.
//
// Canais IPC (só da própria janela; nada além disso existe):
//   biblioteca:listar, biblioteca:copiar, pessoal:salvar, pessoal:excluir, pessoal:abrir-arquivo
//   config:ler, config:salvar, fonte:escolher, fonte:testar, sync:estado, sync:agora
//   janela:minimizar-para-icone   (da página para o processo principal)
//   janela:secao                  (do processo principal para a página: abre numa seção)
//   biblioteca:mudou              (do processo principal para a página: a lista precisa ser relida)
// Não carrega conteúdo remoto, não navega, não abre outras janelas e nega qualquer permissão.

const { BrowserWindow, ipcMain, shell, dialog } = require('electron');
const areaTransferencia = require('./areaTransferencia');
const { carregarBiblioteca, prepararCopia, salvarPessoal, excluirPessoal } = require('./biblioteca');
const { textoStatusSync } = require('../shared/statusSync');

const LIMITE_PROBLEMAS = 200;
const SECOES = Object.freeze(['biblioteca', 'configuracoes']);

/**
 * @param {object} p
 * @param {object} p.caminhos
 * @param {object} p.log
 * @param {() => object} p.obterConfig                 configuração atual (usa `minimizarParaIcone`)
 * @param {(entrada: object) => Promise<object>} p.salvarConfig
 * @param {object} p.sincronizador
 * @param {() => string|null} p.obterAplicadoEm
 * @param {() => void} [p.aoMostrar]            a janela apareceu (o ícone flutuante deve sumir)
 * @param {() => void} [p.aoEsconderParaIcone]  a janela foi escondida por "minimizar para ícone" (o ícone deve aparecer)
 * @param {() => void} [p.aoFechar]             a janela foi fechada (X)
 */
function criarJanelaPrincipal({ caminhos, log, obterConfig, salvarConfig, sincronizador, obterAplicadoEm, aoMostrar = () => {}, aoEsconderParaIcone = () => {}, aoFechar = () => {} }) {
  let janela = null;
  let paginaPronta = false;
  let ultimaSecao = 'biblioteca'; // a seção pedida por último; é onde uma janela nova abre

  const existe = () => janela && !janela.isDestroyed();

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
    if (!existe() || evento.sender !== janela.webContents) {
      throw new Error('Chamada recusada: origem não autorizada.');
    }
    return tratador(...argumentos);
  };

  // Avisa a página (se estiver aberta) de que a lista da Biblioteca precisa ser relida.
  function notificarMudanca() {
    if (existe()) janela.webContents.send('biblioteca:mudou');
  }

  // ---- Biblioteca ----

  ipcMain.handle('biblioteca:listar', somenteDaJanela(() => carregarBiblioteca(caminhos, { aplicadoEm: obterAplicadoEm() })));

  ipcMain.handle('biblioteca:copiar', somenteDaJanela(async (pedido) => {
    const preparo = await prepararCopia(caminhos, pedido);
    if (!preparo.ok) return preparo;
    // Para html, vai o html e o texto puro: o Google Docs usa o html e mantém negrito, listas etc.
    if (preparo.html) await areaTransferencia.escreverFormatado({ texto: preparo.texto, html: preparo.html });
    else await areaTransferencia.escreverTexto(preparo.texto);
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

  // ---- Configurações ----

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

  // ---- Janela ----

  // Minimizar (botão da barra de título, botão do menu lateral ou Esc). Com "minimizarParaIcone" ligado, a janela
  // é escondida e o ícone flutuante aparece; desligado, minimiza para a barra de tarefas como qualquer janela.
  function minimizar() {
    if (!existe()) return;
    if (obterConfig().minimizarParaIcone) {
      janela.hide();
      aoEsconderParaIcone();
    } else {
      janela.minimize();
    }
  }

  ipcMain.handle('janela:minimizar-para-icone', somenteDaJanela(() => {
    minimizar();
    return { ok: true };
  }));

  // Pede à página que abra numa seção. Valores desconhecidos são ignorados.
  function pedirSecao(secao) {
    if (!SECOES.includes(secao)) return;
    ultimaSecao = secao;
    if (existe() && paginaPronta) janela.webContents.send('janela:secao', secao);
  }

  /**
   * Abre a janela, ou traz a que já existe para a frente (nunca há duas). `secao` = "biblioteca" ou
   * "configuracoes"; sem ela, a janela fica na seção em que já estava (ou na última pedida, se for nova).
   */
  function abrir(secao) {
    if (existe()) {
      if (janela.isMinimized()) janela.restore();
      janela.show(); // o evento "show" esconde o ícone flutuante
      janela.focus();
      pedirSecao(secao);
      return janela;
    }

    if (SECOES.includes(secao)) ultimaSecao = secao;
    paginaPronta = false;
    janela = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 860,
      minHeight: 560,
      show: false,
      title: 'TextCDSP',
      icon: caminhos.icone,
      autoHideMenuBar: true,
      webPreferences: {
        preload: caminhos.preloadPrincipal,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const propria = janela;
    propria.removeMenu();

    // Nada de conteúdo remoto: bloqueia navegação, novas janelas e pedidos de permissão.
    propria.webContents.on('will-navigate', (evento) => evento.preventDefault());
    propria.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    propria.webContents.session.setPermissionRequestHandler((_conteudo, _permissao, responder) => responder(false));

    propria.webContents.once('did-finish-load', () => {
      paginaPronta = true;
      if (!propria.isDestroyed()) propria.webContents.send('janela:secao', ultimaSecao);
    });
    propria.once('ready-to-show', () => !propria.isDestroyed() && propria.show());
    propria.on('show', () => aoMostrar());
    // O botão de minimizar da barra de título: com a opção ligada, vira o ícone flutuante.
    propria.on('minimize', (evento) => {
      if (obterConfig().minimizarParaIcone) {
        evento.preventDefault();
        minimizar();
      }
    });
    propria.on('closed', () => {
      if (janela === propria) {
        janela = null;
        paginaPronta = false;
      }
      aoFechar();
    });
    propria.loadFile(caminhos.paginaPrincipal).catch((erro) => log.erro('Não foi possível abrir a janela principal', erro));
    return propria;
  }

  return { abrir, minimizar, notificarMudanca, obterJanela: () => (existe() ? janela : null), SECOES };
}

module.exports = { criarJanelaPrincipal, SECOES };
