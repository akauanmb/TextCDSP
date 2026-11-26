'use strict';

// Processo principal do TextCDSP: ícone na bandeja controlando o motor (Espanso portable),
// sincronizando os snippets oficiais da pasta compartilhada e abrindo a janela de configurações.

const path = require('node:path');
const { app, dialog, shell, Notification } = require('electron');
const { criarCaminhos } = require('./caminhos');
const { criarLog } = require('./log');
const configArquivo = require('./config');
const { criarMotor } = require('./motor');
const { criarSincronizador } = require('./sincronizacao');
const { criarBandeja } = require('./bandeja');
const { criarJanelaConfiguracoes } = require('./janelaConfiguracoes');
const { criarJanelaBiblioteca } = require('./janelaBiblioteca');
const { textoStatusSync } = require('../shared/statusSync');

const INTERVALO_VIGIA_MS = 30 * 1000;

// Os dados ficam em %APPDATA%\TextCDSP, também em desenvolvimento (sem isso viraria %APPDATA%\textcdsp).
app.setPath('userData', path.join(app.getPath('appData'), 'TextCDSP'));
// Necessário para as notificações do Windows. Em desenvolvimento, usa o executável do Electron.
app.setAppUserModelId(app.isPackaged ? 'textcdsp.cdsp' : process.execPath);

if (!app.requestSingleInstanceLock()) {
  // Já existe um TextCDSP rodando: este só encerra.
  app.quit();
} else {
  iniciarAplicativo();
}

function iniciarAplicativo() {
  const caminhos = criarCaminhos({
    empacotado: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
  });
  const log = criarLog(caminhos.logs);
  const motor = criarMotor({ caminhos, log });

  let configuracao = configArquivo.ler(caminhos.configJson, log);
  let bandeja = null;
  let janelaConfig = null;
  let janelaBiblioteca = null;
  let ultimoAplicadoEm = null; // para avisar a Biblioteca só quando uma versão nova foi aplicada
  let estado = 'iniciando'; // "iniciando" | "ativo" | "pausado" | "erro"
  let bloqueadoPorOutroEspanso = false;
  let tentouReiniciar = false;
  let ocupado = false; // uma ação do motor por vez
  let encerrando = false;
  let vigia = null;
  let agendaSync = null;
  const notificacoesAbertas = new Set(); // evita que o Windows descarte a notificação antes do clique

  // -----------------------------------------------------------------------
  // Sincronização
  // -----------------------------------------------------------------------

  function notificarErroNaFonte({ erros }) {
    if (!Notification.isSupported()) {
      log.aviso('Notificações não suportadas neste computador; o erro na pasta de snippets só aparece nas configurações');
      return;
    }
    const notificacao = new Notification({
      title: 'TextCDSP: erro na pasta de snippets',
      body: `A pasta tem ${erros.length} erro(s) e não foi aplicada. Os atalhos continuam na última versão válida. Clique para ver os detalhes.`,
    });
    notificacoesAbertas.add(notificacao);
    notificacao.on('click', () => janelaConfig.abrir());
    notificacao.on('close', () => notificacoesAbertas.delete(notificacao));
    notificacao.on('failed', (_evento, erro) => {
      log.aviso(`O Windows não mostrou a notificação: ${erro}`);
      notificacoesAbertas.delete(notificacao);
    });
    notificacao.show();
  }

  const sincronizador = criarSincronizador({
    caminhos,
    log,
    obterConfig: () => configuracao,
    aoErroNovo: notificarErroNaFonte,
    aoMudar: (resultado) => {
      const texto = textoStatusSync(resultado);
      log.info(`Menu: ${texto}`);
      if (bandeja) bandeja.atualizarSync(texto);
      // Uma versão nova dos snippets oficiais foi aplicada: a Biblioteca aberta relê a lista.
      if (resultado.aplicadoEm !== ultimoAplicadoEm) {
        ultimoAplicadoEm = resultado.aplicadoEm;
        if (janelaBiblioteca) janelaBiblioteca.notificarMudanca();
      }
    },
  });
  ultimoAplicadoEm = sincronizador.estadoAtual().aplicadoEm;

  const sincronizarEmSegundoPlano = () => sincronizador.sincronizar().catch((erro) => log.erro('Falha ao sincronizar', erro));

  // Sincroniza a cada `intervaloSyncMin` minutos. Chamada de novo quando o intervalo muda.
  function agendarSincronizacao() {
    if (agendaSync) clearInterval(agendaSync);
    agendaSync = setInterval(sincronizarEmSegundoPlano, configuracao.intervaloSyncMin * 60 * 1000);
  }

  // -----------------------------------------------------------------------
  // Configurações
  // -----------------------------------------------------------------------

  function aplicarInicioComWindows() {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: Boolean(configuracao.iniciarComWindows) });
    } else {
      // Em desenvolvimento isso registraria o electron.exe avulso para abrir com o Windows.
      log.info('Início com o Windows ignorado em desenvolvimento');
    }
  }

  // Chamada pela janela: valida, grava, aplica e sincroniza.
  async function salvarConfiguracao(entrada) {
    const { valor, erros } = configArquivo.validarEntrada(entrada);
    if (erros.length > 0) return { ok: false, erros };
    try {
      configuracao = configArquivo.gravar(caminhos.configJson, { ...configuracao, ...valor });
    } catch (erro) {
      log.erro('Não foi possível gravar o config.json', erro);
      return { ok: false, erros: ['Não foi possível salvar as configurações. Veja o log para detalhes.'] };
    }
    log.info('Configurações salvas');
    aplicarInicioComWindows();
    agendarSincronizacao();
    // Se já havia uma sincronização em andamento, ela pode ter lido a pasta antiga: roda outra com a nova.
    const jaEmAndamento = sincronizador.estadoAtual().sincronizando;
    await sincronizador.sincronizar();
    if (jaEmAndamento) await sincronizador.sincronizar();
    return { ok: true, config: configuracao };
  }

  janelaConfig = criarJanelaConfiguracoes({
    caminhos,
    log,
    obterConfig: () => configuracao,
    salvarConfig: salvarConfiguracao,
    sincronizador,
  });

  janelaBiblioteca = criarJanelaBiblioteca({
    caminhos,
    log,
    obterAplicadoEm: () => sincronizador.estadoAtual().aplicadoEm,
  });

  // -----------------------------------------------------------------------
  // Motor
  // -----------------------------------------------------------------------

  process.on('uncaughtException', (erro) => log.erro('Erro não tratado', erro));
  process.on('unhandledRejection', (erro) => log.erro('Promessa rejeitada sem tratamento', erro));

  // Sem janela principal: fechar a janela de configurações não encerra o aplicativo.
  app.on('window-all-closed', () => {});
  app.on('second-instance', () => log.info('Outra execução do TextCDSP foi bloqueada (já há uma aberta)'));

  function definirEstado(novo) {
    estado = novo;
    if (bandeja) bandeja.atualizar(novo);
  }

  // Executa `acao` se nenhuma outra ação do motor estiver em andamento.
  async function exclusivo(acao) {
    if (ocupado || encerrando) return;
    ocupado = true;
    try {
      await acao();
    } catch (erro) {
      log.erro('Falha em uma ação do motor', erro);
      definirEstado('erro');
    } finally {
      ocupado = false;
    }
  }

  function avisarOutroEspanso() {
    // Sem await: o aviso não deve segurar o resto do programa.
    dialog
      .showMessageBox({
        type: 'warning',
        title: 'TextCDSP',
        message: 'Já existe um Espanso em execução neste computador.',
        detail:
          'O TextCDSP traz o próprio Espanso e os dois não podem funcionar ao mesmo tempo. ' +
          'Feche ou desinstale o Espanso que já estava instalado e depois escolha "Retomar" no menu do ícone do TextCDSP.',
        buttons: ['OK'],
      })
      .catch((erro) => log.erro('Falha ao mostrar o aviso de outro Espanso', erro));
  }

  // Detecta outro Espanso e, se estiver livre, inicia o nosso.
  async function tentarIniciar() {
    if (await motor.detectarOutroEspanso()) {
      bloqueadoPorOutroEspanso = true;
      definirEstado('erro');
      log.erro('Há outro Espanso em execução; o motor do TextCDSP não foi iniciado');
      avisarOutroEspanso();
      return;
    }
    bloqueadoPorOutroEspanso = false;
    tentouReiniciar = false;
    definirEstado((await motor.iniciar()) === 'ativo' ? 'ativo' : 'erro');
  }

  async function arrancar() {
    await motor.encerrarOrfaos(); // antes do preparar(): um motor órfão trava a cópia dos arquivos
    motor.preparar();
    // Se match\oficial\ estiver vazia, volta a última versão válida antes de o motor iniciar.
    if (await sincronizador.restaurarDoCache()) log.info('Snippets oficiais restaurados a partir do cache');
    await tentarIniciar();
  }

  const alternar = () =>
    exclusivo(async () => {
      if (estado === 'ativo') {
        await motor.parar();
        definirEstado('pausado');
        log.info('Motor pausado pelo usuário');
      } else {
        log.info('Motor retomado pelo usuário');
        await tentarIniciar();
      }
    });

  async function abrir(caminho, descricao) {
    const erro = await shell.openPath(caminho);
    if (erro) {
      log.erro(`Não foi possível abrir ${descricao} (${caminho}): ${erro}`);
      dialog.showErrorBox('TextCDSP', `Não foi possível abrir ${descricao}.\n\n${caminho}`);
    }
  }

  // Verifica o motor a cada 30 s. Se caiu, tenta reiniciar uma vez; se não voltar, fica em "erro".
  async function vigiar() {
    if (ocupado || encerrando || estado === 'pausado' || estado === 'iniciando' || bloqueadoPorOutroEspanso) return;
    await exclusivo(async () => {
      if ((await motor.status()) === 'ativo') {
        tentouReiniciar = false;
        if (estado !== 'ativo') definirEstado('ativo');
        return;
      }
      if (tentouReiniciar) {
        definirEstado('erro');
        return;
      }
      tentouReiniciar = true;
      log.aviso('O motor parou sozinho; tentando reiniciar uma vez');
      if ((await motor.iniciar()) === 'ativo') {
        tentouReiniciar = false;
        definirEstado('ativo');
      } else {
        log.erro('O motor não voltou depois de uma tentativa de reinício');
        definirEstado('erro');
      }
    });
  }

  // Ao fechar o app, para o motor antes de sair.
  app.on('before-quit', (evento) => {
    if (encerrando) return;
    encerrando = true;
    evento.preventDefault();
    if (vigia) clearInterval(vigia);
    if (agendaSync) clearInterval(agendaSync);
    log.info('Encerrando o TextCDSP');
    motor
      .parar()
      .catch((erro) => log.erro('Falha ao parar o motor na saída', erro))
      .finally(() => {
        if (bandeja) bandeja.destruir();
        app.quit();
      });
  });

  app.whenReady().then(async () => {
    log.info(`TextCDSP ${app.getVersion()} iniciando (${app.isPackaged ? 'instalado' : 'desenvolvimento'}); dados em ${caminhos.dados}`);
    aplicarInicioComWindows();

    bandeja = criarBandeja({
      icone: caminhos.icone,
      log,
      aoAlternar: alternar,
      aoAtualizarSnippets: sincronizarEmSegundoPlano,
      aoAbrirBiblioteca: () => janelaBiblioteca.abrir(),
      aoAbrirConfiguracoes: () => janelaConfig.abrir(),
      aoAbrirPessoais: () => abrir(caminhos.pessoalYml, 'o arquivo de atalhos pessoais'),
      aoAbrirLogs: () => abrir(caminhos.logs, 'a pasta de logs'),
      aoSair: () => app.quit(),
    });
    bandeja.atualizarSync(textoStatusSync(sincronizador.estadoAtual()));

    // Primeira execução: sem pasta configurada, abre as configurações.
    if (!configuracao.fonteSnippets) janelaConfig.abrir();

    await exclusivo(arrancar);
    vigia = setInterval(() => vigiar().catch((erro) => log.erro('Falha na verificação periódica', erro)), INTERVALO_VIGIA_MS);

    // Sincroniza depois de o motor iniciar (não atrasa a partida); o motor recarrega sozinho.
    sincronizarEmSegundoPlano();
    agendarSincronizacao();
  });
}
