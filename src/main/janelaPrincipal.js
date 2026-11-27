'use strict';

// Janela principal do TextCDSP (Marco 11): menu lateral com "Biblioteca" e "Configurações". Substitui as duas
// janelas separadas. Uma única janela: se já existir, só vem para a frente, na seção pedida.
//
// Canais IPC (só da própria janela; nada além disso existe):
//   biblioteca:listar, biblioteca:copiar, biblioteca:inserir, pessoal:salvar, pessoal:excluir, pessoal:abrir-arquivo
//   config:ler, config:salvar, fonte:escolher, fonte:testar, sync:estado, sync:agora
//   janela:minimizar-para-icone   (da página para o processo principal)
//   janela:secao                  (do processo principal para a página: abre numa seção)
//   biblioteca:mudou              (do processo principal para a página: a lista precisa ser relida)
// Não carrega conteúdo remoto, não navega, não abre outras janelas e nega qualquer permissão.

const { BrowserWindow, ipcMain, shell, dialog } = require('electron');
const areaTransferencia = require('./areaTransferencia');
const { carregarBiblioteca, prepararCopia, prepararInsercao, salvarPessoal, excluirPessoal } = require('./biblioteca');
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
 * @param {(pedido: {texto: string, trigger: string}) => Promise<object>} p.inserirTexto  o Inserir (src/main/inserir.js)
 * @param {() => void} [p.aoMostrar]            a janela apareceu (o ícone flutuante deve sumir)
 * @param {() => void} [p.aoEsconderParaIcone]  a janela foi escondida por "minimizar para ícone" (o ícone deve aparecer)
 * @param {() => void} [p.aoFechar]             a janela foi fechada (X)
 */
function criarJanelaPrincipal({ caminhos, log, obterConfig, salvarConfig, sincronizador, obterAplicadoEm, inserirTexto = async () => ({ ok: false }), aoMostrar = () => {}, aoEsconderParaIcone = () => {}, aoFechar = () => {} }) {
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

  // Inserir: o texto é montado AQUI, a partir do id, e podeInserir é conferida de novo. A inserção roda sem a página
  // esperar, porque ela própria minimiza a janela; falhas chegam à pessoa por notificação.
  ipcMain.handle('biblioteca:inserir', somenteDaJanela(async (pedido) => {
    const preparo = await prepararInsercao(caminhos, pedido);
    if (!preparo.ok) return preparo;
    inserirTexto({ texto: preparo.texto, trigger: preparo.trigger }).catch((erro) => log.erro('Falha ao inserir o texto', erro));
    return { ok: true };
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

  // Minimizar (botão da barra de título, botão do menu lateral, Esc ou o Inserir). A janela é SEMPRE minimizada de
  // verdade primeiro: assim o Windows devolve o foco à janela em que a pessoa estava. O hide() sozinho não devolve
  // (o foco fica na janela escondida por cerca de 4 s; docs/WINDOWS-NOTAS.md, W1). Com "minimizarParaIcone" ligado,
  // depois de minimizada ela é escondida e o ícone flutuante aparece (tratador do evento "minimize", mais abaixo);
  // desligado, fica minimizada na barra de tarefas.
  function minimizar() {
    if (existe()) janela.minimize();
  }

  // Depois que a janela minimiza, o Windows leva um instante para ativar a janela anterior; esconder logo antes disso
  // não atrapalha (a janela minimizada não tem o foco), mas esperar um pouco evita disputa com a troca de ativação.
  const ESPERA_ANTES_DE_ESCONDER_MS = 40;

  function esconderDepoisDeMinimizar() {
    setTimeout(() => {
      if (!existe() || !janela.isMinimized() || !obterConfig().minimizarParaIcone) return;
      janela.hide();
      aoEsconderParaIcone();
    }, ESPERA_ANTES_DE_ESCONDER_MS);
  }

  /**
   * Minimiza (e, com a opção ligada, esconde) e só devolve depois de o Windows ter tido tempo de passar o foco para a
   * janela anterior. Quem vai mandar teclas para outro programa (o Inserir) espera por isto. Tempo máximo: 1 s.
   */
  function minimizarEAguardar() {
    return new Promise((resolver) => {
      if (!existe() || janela.isMinimized() || !janela.isVisible()) {
        resolver();
        return;
      }
      const limite = setTimeout(resolver, 1000);
      janela.once('minimize', () => {
        // O tratador permanente (que esconde a janela) já agendou o esconder; espera um pouco mais que ele.
        setTimeout(() => {
          clearTimeout(limite);
          resolver();
        }, ESPERA_ANTES_DE_ESCONDER_MS + 20);
      });
      janela.minimize();
    });
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
    // Qualquer minimização (barra de título, botão, Esc, Inserir): a janela minimiza de verdade, o foco volta para a
    // janela anterior e, com a opção ligada, ela é escondida em seguida e o ícone flutuante aparece.
    propria.on('minimize', () => {
      if (obterConfig().minimizarParaIcone) esconderDepoisDeMinimizar();
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

  return { abrir, minimizar, minimizarEAguardar, notificarMudanca, obterJanela: () => (existe() ? janela : null), SECOES };
}

module.exports = { criarJanelaPrincipal, SECOES };
