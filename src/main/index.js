'use strict';

// Processo principal do TextCDSP: ícone na bandeja controlando o motor (Espanso portable),
// sincronizando os snippets oficiais da pasta compartilhada e abrindo a janela principal (Biblioteca e
// Configurações), que minimizada vira um ícone flutuante.

const fs = require('node:fs');
const path = require('node:path');
const { app, dialog, shell, Notification } = require('electron');
const { criarCaminhos } = require('./caminhos');
const { criarLog } = require('./log');
const configArquivo = require('./config');
const { criarMotor } = require('./motor');
const { criarSincronizador } = require('./sincronizacao');
const { criarAtualizador } = require('./atualizacao');
const { criarBandeja } = require('./bandeja');
const { criarJanelaPrincipal } = require('./janelaPrincipal');
const { criarIconeFlutuante } = require('./iconeFlutuante');
const { criarInseridor } = require('./inserir');
const areaTransferencia = require('./areaTransferencia');
const { textoStatusSync } = require('../shared/statusSync');
const { TITULO_NOTIFICACAO, corpoNotificacao } = require('../shared/versaoInstalador');

const INTERVALO_VIGIA_MS = 30 * 1000;
const NOME_DA_ENTRADA_DE_INICIO = 'TextCDSP';

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
  let janelaPrincipal = null;
  let iconeFlutuante = null;
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
    notificacao.on('click', () => janelaPrincipal.abrir('configuracoes'));
    notificacao.on('close', () => notificacoesAbertas.delete(notificacao));
    notificacao.on('failed', (_evento, erro) => {
      log.aviso(`O Windows não mostrou a notificação: ${erro}`);
      notificacoesAbertas.delete(notificacao);
    });
    notificacao.show();
  }

  // -----------------------------------------------------------------------
  // Nova versão do aplicativo (Marco 7): só avisa e, se a pessoa pedir, executa o instalador da pasta
  // compartilhada. Nunca atualiza sozinho.
  // -----------------------------------------------------------------------

  let instalando = false; // uma instalação por vez

  function notificarNovaVersao(info) {
    // Lembra da versão ANTES de mostrar: se a gravação ou a notificação falharem, não repete a cada sincronização.
    configuracao = { ...configuracao, versaoAvisada: info.versao };
    try {
      configuracao = configArquivo.gravar(caminhos.configJson, configuracao);
    } catch (erro) {
      log.erro('Não foi possível gravar a versão avisada no config.json', erro);
    }
    if (!Notification.isSupported()) {
      log.aviso('Notificações não suportadas neste computador; a nova versão só aparece no menu do ícone');
      return;
    }
    const notificacao = new Notification({ title: TITULO_NOTIFICACAO, body: corpoNotificacao(info) });
    notificacoesAbertas.add(notificacao);
    notificacao.on('click', () => pedirInstalacao().catch((erro) => log.erro('Falha ao instalar a nova versão', erro)));
    notificacao.on('close', () => notificacoesAbertas.delete(notificacao));
    notificacao.on('failed', (_evento, erro) => {
      log.aviso(`O Windows não mostrou a notificação de nova versão: ${erro}`);
      notificacoesAbertas.delete(notificacao);
    });
    notificacao.show();
  }

  const atualizador = criarAtualizador({
    caminhos,
    log,
    obterFonte: () => configuracao.fonteSnippets,
    versaoAtual: app.getVersion(),
    obterVersaoAvisada: () => configuracao.versaoAvisada,
    aoMudar: (disponivel) => {
      if (bandeja) bandeja.atualizarVersaoDisponivel(disponivel ? disponivel.versao : null);
    },
    aoNovaVersao: notificarNovaVersao,
  });

  // Confirma, copia e confere o instalador, executa-o e encerra o app (o instalador fecha e reabre o TextCDSP).
  async function pedirInstalacao() {
    if (instalando || encerrando) return;
    const nova = atualizador.disponivel();
    if (!nova) {
      await dialog.showMessageBox({ type: 'info', title: 'TextCDSP', message: 'Não há nova versão disponível.', buttons: ['OK'] });
      return;
    }
    instalando = true;
    try {
      const escolha = await dialog.showMessageBox({
        type: 'question',
        title: 'TextCDSP',
        message: `Instalar o TextCDSP ${nova.versao}?`,
        detail: [nova.notas, 'O TextCDSP será fechado durante a instalação e abrirá de novo ao final. Os atalhos ficam parados nesse intervalo.'].filter(Boolean).join('\n\n'),
        buttons: ['Instalar agora', 'Agora não'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (escolha.response !== 0) return;
      const preparo = await atualizador.prepararInstalacao();
      if (!preparo.ok) {
        dialog.showErrorBox('TextCDSP', preparo.mensagem);
        return;
      }
      const erro = await shell.openPath(preparo.caminho);
      if (erro) {
        log.erro(`Não foi possível executar o instalador (${preparo.caminho}): ${erro}`);
        dialog.showErrorBox('TextCDSP', 'Não foi possível executar o instalador da nova versão.');
        return;
      }
      log.info(`Instalador da versão ${preparo.versao} iniciado; encerrando o TextCDSP para a atualização`);
      app.quit();
    } finally {
      instalando = false;
    }
  }

  const verificarAtualizacao = () => atualizador.verificar().catch((erro) => log.erro('Falha ao verificar a nova versão', erro));

  const sincronizador = criarSincronizador({
    caminhos,
    log,
    obterConfig: () => configuracao,
    aoErroNovo: notificarErroNaFonte,
    aoMudar: (resultado) => {
      const texto = textoStatusSync(resultado);
      log.info(`Menu: ${texto}`);
      if (bandeja) bandeja.atualizarSync(texto);
      // A cada sincronização, confere se a pasta tem um instalador mais novo (independe de a pasta ter erro de snippets).
      verificarAtualizacao();
      // Uma versão nova dos snippets oficiais foi aplicada: a Biblioteca aberta relê a lista.
      if (resultado.aplicadoEm !== ultimoAplicadoEm) {
        ultimoAplicadoEm = resultado.aplicadoEm;
        if (janelaPrincipal) janelaPrincipal.notificarMudanca();
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
      // O nome fixo é o da entrada no registro do Windows; o desinstalador remove exatamente essa (build/installer.nsh).
      app.setLoginItemSettings({ openAtLogin: Boolean(configuracao.iniciarComWindows), name: NOME_DA_ENTRADA_DE_INICIO });
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

  // Só a posição do ícone flutuante: grava no config.json sem passar por salvarConfiguracao (não sincroniza).
  function guardarPosicaoDoIcone(posicao) {
    configuracao = { ...configuracao, posicaoIcone: posicao };
    try {
      configuracao = configArquivo.gravar(caminhos.configJson, configuracao);
    } catch (erro) {
      log.aviso('Não foi possível gravar a posição do ícone flutuante no config.json', erro);
    }
  }

  // "Inserir" (Marco 12): cola o texto de um snippet no programa em que a pessoa estava. A janela é minimizada para
  // o Windows devolver o foco a esse programa (docs/WINDOWS-NOTAS.md, W1). Falhas chegam por notificação.
  function notificarFalhaAoInserir({ copiado }) {
    if (!Notification.isSupported()) return;
    const notificacao = new Notification({
      title: 'TextCDSP',
      body: copiado ? 'Não foi possível inserir. O texto foi copiado: use Ctrl+V' : 'Não foi possível inserir o texto.',
    });
    notificacoesAbertas.add(notificacao);
    notificacao.on('close', () => notificacoesAbertas.delete(notificacao));
    notificacao.on('failed', () => notificacoesAbertas.delete(notificacao));
    notificacao.show();
  }

  const inseridor = criarInseridor({
    log,
    area: areaTransferencia,
    esconderJanela: () => janelaPrincipal.minimizarEAguardar(),
    aoFalhar: notificarFalhaAoInserir,
  });

  // Uma só janela, com menu lateral: Biblioteca e Configurações. Minimizada, vira o ícone flutuante.
  janelaPrincipal = criarJanelaPrincipal({
    caminhos,
    log,
    obterConfig: () => configuracao,
    salvarConfig: salvarConfiguracao,
    sincronizador,
    obterAplicadoEm: () => sincronizador.estadoAtual().aplicadoEm,
    inserirTexto: (pedido) => inseridor.inserir(pedido),
    aoMostrar: () => iconeFlutuante.esconder(),
    aoEsconderParaIcone: () => iconeFlutuante.mostrar(),
    aoFechar: () => iconeFlutuante.esconder(), // fechar (X) não deixa o ícone: o app segue na bandeja
  });

  iconeFlutuante = criarIconeFlutuante({
    caminhos,
    log,
    obterPosicaoSalva: () => configuracao.posicaoIcone,
    aoPosicionar: guardarPosicaoDoIcone,
    aoAbrir: () => janelaPrincipal.abrir(), // na seção em que a janela estava
  });

  // -----------------------------------------------------------------------
  // Motor
  // -----------------------------------------------------------------------

  process.on('uncaughtException', (erro) => log.erro('Erro não tratado', erro));
  process.on('unhandledRejection', (erro) => log.erro('Promessa rejeitada sem tratamento', erro));

  // O app vive na bandeja: fechar a janela principal não encerra o aplicativo.
  app.on('window-all-closed', () => {});
  // Abrir o TextCDSP de novo (menu Iniciar) com ele já rodando: mostra a janela principal.
  app.on('second-instance', () => {
    log.info('Outra execução do TextCDSP foi bloqueada (já há uma aberta); mostrando a janela principal');
    janelaPrincipal.abrir();
  });

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

  // Versão do Espanso em uso (a da pasta engine\; se ainda não existir, a que acompanha o app).
  function versaoDoEspanso() {
    for (const arquivo of [caminhos.engineVersao, caminhos.origemVersao]) {
      try {
        const texto = fs.readFileSync(arquivo, 'utf8').trim();
        if (texto) return texto;
      } catch {
        // tenta o próximo
      }
    }
    return 'desconhecida';
  }

  async function mostrarSobre() {
    const escolha = await dialog.showMessageBox({
      type: 'info',
      title: 'Sobre o TextCDSP',
      message: `TextCDSP ${app.getVersion()}`,
      detail:
        `Motor de expansão: Espanso ${versaoDoEspanso()}, usado sem modificações (licença GPL-3).\n\n` +
        'O TextCDSP usa programas de terceiros. Os avisos de licença e o endereço do código-fonte do Espanso estão no arquivo de avisos.',
      buttons: ['Abrir avisos de licença', 'Fechar'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (escolha.response === 0) await abrir(caminhos.avisos, 'o arquivo de avisos de licença');
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
        if (iconeFlutuante) iconeFlutuante.destruir();
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
      aoAbrirBiblioteca: () => janelaPrincipal.abrir('biblioteca'),
      aoAbrirConfiguracoes: () => janelaPrincipal.abrir('configuracoes'),
      aoAbrirPessoais: () => abrir(caminhos.pessoalYml, 'o arquivo de atalhos pessoais'),
      aoAbrirLogs: () => abrir(caminhos.logs, 'a pasta de logs'),
      aoAbrirSobre: () => mostrarSobre().catch((erro) => log.erro('Falha ao mostrar o Sobre', erro)),
      aoInstalarVersao: () => pedirInstalacao().catch((erro) => log.erro('Falha ao instalar a nova versão', erro)),
      aoSair: () => app.quit(),
    });
    bandeja.atualizarSync(textoStatusSync(sincronizador.estadoAtual()));
    atualizador.limparInstaladorLocal(); // sobra de uma atualização anterior
    const jaDisponivel = atualizador.disponivel();
    if (jaDisponivel) bandeja.atualizarVersaoDisponivel(jaDisponivel.versao);

    // Primeira execução: sem pasta configurada, abre as configurações.
    if (!configuracao.fonteSnippets) janelaPrincipal.abrir('configuracoes');

    await exclusivo(arrancar);
    vigia = setInterval(() => vigiar().catch((erro) => log.erro('Falha na verificação periódica', erro)), INTERVALO_VIGIA_MS);

    // Sincroniza depois de o motor iniciar (não atrasa a partida); o motor recarrega sozinho.
    sincronizarEmSegundoPlano();
    agendarSincronizacao();
  });
}
