'use strict';

// Processo principal do TextCDSP: sem janela, só ícone na bandeja controlando o motor (Espanso portable).

const path = require('node:path');
const { app, dialog, shell } = require('electron');
const { criarCaminhos } = require('./caminhos');
const { criarLog } = require('./log');
const config = require('./config');
const { criarMotor } = require('./motor');
const { criarBandeja } = require('./bandeja');

const INTERVALO_VIGIA_MS = 30 * 1000;

// Os dados ficam em %APPDATA%\TextCDSP, também em desenvolvimento (sem isso viraria %APPDATA%\textcdsp).
app.setPath('userData', path.join(app.getPath('appData'), 'TextCDSP'));

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

  let bandeja = null;
  let estado = 'iniciando'; // "iniciando" | "ativo" | "pausado" | "erro"
  let bloqueadoPorOutroEspanso = false;
  let tentouReiniciar = false;
  let ocupado = false; // uma ação do motor por vez
  let encerrando = false;
  let vigia = null;

  process.on('uncaughtException', (erro) => log.erro('Erro não tratado', erro));
  process.on('unhandledRejection', (erro) => log.erro('Promessa rejeitada sem tratamento', erro));

  // Sem janelas: fechar uma janela (se um dia houver) não encerra o aplicativo.
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

    const configuracao = config.ler(caminhos.configJson, log);
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: Boolean(configuracao.iniciarComWindows) });
    } else {
      // Em desenvolvimento isso registraria o electron.exe avulso para abrir com o Windows.
      log.info('Início com o Windows ignorado em desenvolvimento');
    }

    bandeja = criarBandeja({
      icone: caminhos.icone,
      log,
      aoAlternar: alternar,
      aoAbrirPessoais: () => abrir(caminhos.pessoalYml, 'o arquivo de atalhos pessoais'),
      aoAbrirLogs: () => abrir(caminhos.logs, 'a pasta de logs'),
      aoSair: () => app.quit(),
    });

    await exclusivo(arrancar);
    vigia = setInterval(() => vigiar().catch((erro) => log.erro('Falha na verificação periódica', erro)), INTERVALO_VIGIA_MS);
  });
}
