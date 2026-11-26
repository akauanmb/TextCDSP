'use strict';

// Controle do motor (Espanso portable): preparar, iniciar, parar e verificar.
// Não importa Electron: recebe os caminhos (caminhos.js) e o log por injeção.
// Só usa comandos e pastas verificados em docs/ESPANSO-NOTAS.md:
//   iniciar  = `espansod.exe launcher` desacoplado, com stdio 'ignore' (P3)
//   parar    = `espansod.exe service stop` (P3)
//   status   = `espansod.exe service status` (exit 0 ativo, 4 parado) (P3)
//   processos = CIM do Windows, com o caminho do executável (P4)
// Nunca usa `service start` (registra autostart) nem pipes ao iniciar.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const DEFAULT_YML = 'show_icon: false\nshow_notifications: false\n';

// O motor recria o base.yml padrão (com um snippet :shell) a cada partida em que ele não existe (P1).
// Um base.yml nosso, vazio, impede isso.
const BASE_YML = [
  '# Arquivo reservado pelo TextCDSP. Não coloque snippets aqui.',
  '# Se ele não existir, o Espanso cria um com exemplos (inclusive um que executa comandos).',
  'matches: []',
  '',
].join('\n');

// Sem estes três arquivos o `launcher` não sobe o daemon na primeira execução (P3, atenção 2).
const ARQUIVOS_KVS = ['has_completed_wizard', 'has_displayed_welcome', 'has_selected_auto_start_option'];

const PESSOAL_INICIAL = [
  '# Meus atalhos pessoais (TextCDSP)',
  '#',
  '# Este arquivo é só seu: o TextCDSP nunca o apaga nem o sobrescreve, nem nas atualizações.',
  '#',
  '# Para criar um atalho, apague o "# " das linhas abaixo e ajuste:',
  '#',
  '# matches:',
  '#   - trigger: "/ola"',
  '#     label: "Saudação"',
  '#     replace: "Olá, tudo bem?"',
  '#',
  '# Regras:',
  '#   - O atalho começa com "/" e tem de 2 a 30 letras minúsculas ou números (ex.: /ola).',
  '#   - Não use um atalho que seja o começo de outro (ex.: /ola e /olamundo).',
  '#   - Indente só com espaços, nunca com tab.',
  '#   - Depois de salvar, o atalho passa a valer em poucos segundos.',
  '',
].join('\n');

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Compara caminhos do Windows sem depender de maiúsculas nem do formato curto (8.3).
function normalizar(caminho) {
  let resolvido;
  try {
    resolvido = fs.realpathSync.native(caminho);
  } catch {
    resolvido = path.resolve(caminho);
  }
  return resolvido.toLowerCase();
}

function dentroDe(caminho, pasta) {
  if (!caminho) return false;
  const c = normalizar(caminho);
  const p = normalizar(pasta);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

function criarMotor({ caminhos, log }) {
  // ---------------------------------------------------------------------
  // Execução de comandos do motor
  // ---------------------------------------------------------------------

  // Roda `espansod.exe <args>` e devolve { codigo, saida, erro }. Para comandos de curta duração
  // (stop, status), onde pipes são seguros. Código null = não foi possível executar.
  function executar(args) {
    return new Promise((resolver) => {
      execFile(caminhos.exe, args, { cwd: caminhos.raizMotor, windowsHide: true, timeout: 15000, encoding: 'utf8' }, (erro, saida, saidaErro) => {
        let codigo = 0;
        if (erro) codigo = typeof erro.code === 'number' ? erro.code : null;
        resolver({ codigo, saida: String(saida || '').trim(), erro: String(saidaErro || '').trim() });
      });
    });
  }

  // Processos espansod.exe em execução, com o caminho do executável (P4).
  function listarProcessos() {
    const comando =
      "Get-CimInstance Win32_Process -Filter \"Name='espansod.exe'\" | " +
      'Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress';
    return new Promise((resolver, rejeitar) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], { windowsHide: true, timeout: 20000, encoding: 'utf8' }, (erro, saida) => {
        if (erro) return rejeitar(erro);
        const texto = String(saida || '').trim();
        if (!texto) return resolver([]); // nenhum processo
        try {
          // Com um só processo o resultado é um objeto, não uma lista.
          const itens = [].concat(JSON.parse(texto));
          resolver(itens.map((p) => ({ pid: p.ProcessId, caminho: p.ExecutablePath || null })));
        } catch (e) {
          rejeitar(e);
        }
      });
    });
  }

  const processosNossos = async () => (await listarProcessos()).filter((p) => dentroDe(p.caminho, caminhos.engine));

  function encerrarProcesso(pid) {
    try {
      process.kill(pid);
    } catch (erro) {
      if (erro.code !== 'ESRCH') log.aviso(`Não foi possível encerrar o processo ${pid} do motor`, erro);
    }
  }

  // ---------------------------------------------------------------------
  // Estado e controle
  // ---------------------------------------------------------------------

  // "ativo" | "parado" | "erro"
  async function status() {
    const r = await executar(['service', 'status']);
    if (r.codigo === 0) return 'ativo';
    if (r.codigo === 4) return 'parado';
    return 'erro';
  }

  // Inicia o motor sem janela e sem prender o chamador. Devolve o status final.
  async function iniciar() {
    if ((await status()) === 'ativo') return 'ativo';

    let falhouAoIniciar = false;
    const filho = spawn(caminhos.exe, ['launcher'], { cwd: caminhos.raizMotor, detached: true, stdio: 'ignore', windowsHide: true });
    filho.on('error', (erro) => {
      falhouAoIniciar = true;
      log.erro('Não foi possível executar o motor', erro);
    });
    filho.unref();

    // O esperado é ficar ativo em ~300 ms (P3); espera até ~5 s.
    for (let tentativa = 0; tentativa < 20 && !falhouAoIniciar; tentativa++) {
      await dormir(250);
      if ((await status()) === 'ativo') {
        log.info('Motor iniciado');
        return 'ativo';
      }
    }
    const final = await status();
    log.erro(`O motor não ficou ativo depois de iniciado (status: ${final}). Veja ${caminhos.logMotor}`);
    return final;
  }

  // Para o motor e garante que nenhum processo nosso sobre.
  async function parar() {
    const r = await executar(['service', 'stop']);
    if (r.codigo !== 0 && r.codigo !== 4) {
      log.aviso(`"service stop" terminou com código ${r.codigo}${r.erro ? `: ${r.erro}` : ''}`);
    }
    await dormir(300);
    let restantes = [];
    try {
      restantes = await processosNossos();
    } catch (erro) {
      log.aviso('Não foi possível listar os processos do motor', erro);
      return;
    }
    if (restantes.length > 0) {
      log.aviso(`Encerrando à força ${restantes.length} processo(s) do motor que não pararam sozinhos`);
      restantes.forEach((p) => encerrarProcesso(p.pid));
      await dormir(300);
    }
    log.info('Motor parado');
  }

  // Encerra motor que ficou rodando de uma execução anterior (app encerrado sem parar o motor).
  async function encerrarOrfaos() {
    let nossos;
    try {
      nossos = await processosNossos();
    } catch (erro) {
      log.aviso('Não foi possível verificar se há motor órfão', erro);
      return 0;
    }
    if (nossos.length === 0) return 0;
    log.aviso(`Encontrado motor de uma execução anterior (${nossos.length} processo(s)); encerrando`);
    await parar();
    return nossos.length;
  }

  // true se há um espansod.exe rodando fora da nossa pasta engine\ (por exemplo, um Espanso instalado).
  // Duas instâncias não convivem (P4). Sem caminho legível, trata como "outro" por segurança.
  async function detectarOutroEspanso() {
    try {
      const outros = (await listarProcessos()).filter((p) => !dentroDe(p.caminho, caminhos.engine));
      if (outros.length > 0) {
        log.aviso(`Outro Espanso em execução: ${outros.map((p) => `${p.pid} (${p.caminho || 'caminho desconhecido'})`).join(', ')}`);
      }
      return outros.length > 0;
    } catch (erro) {
      log.aviso('Não foi possível verificar se há outro Espanso em execução', erro);
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Preparação da pasta engine\
  // ---------------------------------------------------------------------

  const lerTexto = (arquivo) => {
    try {
      return fs.readFileSync(arquivo, 'utf8');
    } catch {
      return null;
    }
  };

  // O que vem do zip em .espanso\ e .espanso-runtime\ não é copiado: o app cria o que precisa.
  function ignorarNaCopia(origem) {
    const partes = path.relative(caminhos.origem, origem).split(path.sep);
    return partes.length >= 3 && partes[0] === 'espanso-portable' && (partes[1] === '.espanso' || partes[1] === '.espanso-runtime');
  }

  function copiarMotor() {
    const pessoal = lerTexto(caminhos.pessoalYml); // pessoal.yml sobrevive à troca do motor
    fs.rmSync(caminhos.engine, { recursive: true, force: true });
    fs.cpSync(caminhos.origem, caminhos.engine, { recursive: true, filter: (origem) => !ignorarNaCopia(origem) });
    if (pessoal !== null) {
      fs.mkdirSync(caminhos.match, { recursive: true });
      fs.writeFileSync(caminhos.pessoalYml, pessoal, 'utf8');
    }
  }

  // Deixa engine\ pronta para iniciar. Síncrona e rápida. Não deve ser chamada com o motor rodando.
  function preparar() {
    const versaoOrigem = lerTexto(caminhos.origemVersao);
    if (versaoOrigem === null || !fs.existsSync(path.join(caminhos.origemPortable, 'espansod.exe'))) {
      throw new Error(`Motor não encontrado em ${caminhos.origem}. Rode "npm run baixar-espanso".`);
    }

    const resultado = { copiouMotor: false };
    const versaoEngine = lerTexto(caminhos.engineVersao);
    if (!fs.existsSync(caminhos.exe) || versaoEngine === null || versaoEngine.trim() !== versaoOrigem.trim()) {
      log.info(`Copiando o motor ${versaoOrigem.trim()} para ${caminhos.engine}${versaoEngine ? ` (estava na ${versaoEngine.trim()})` : ''}`);
      copiarMotor();
      resultado.copiouMotor = true;
    }

    fs.mkdirSync(path.dirname(caminhos.configDefault), { recursive: true });
    fs.mkdirSync(caminhos.oficial, { recursive: true });
    fs.mkdirSync(caminhos.kvs, { recursive: true });

    // Sempre regrava: ícone e notificações próprias do Espanso desligados (P5).
    fs.writeFileSync(caminhos.configDefault, DEFAULT_YML, 'utf8');

    if (lerTexto(caminhos.baseYml) !== BASE_YML) fs.writeFileSync(caminhos.baseYml, BASE_YML, 'utf8');

    for (const nome of ARQUIVOS_KVS) {
      const arquivo = path.join(caminhos.kvs, nome);
      if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, 'true', 'utf8');
    }

    if (!fs.existsSync(caminhos.pessoalYml)) fs.writeFileSync(caminhos.pessoalYml, PESSOAL_INICIAL, 'utf8');

    // Os snippets oficiais não são tratados aqui: vêm da sincronização (sincronizacao.js).
    return resultado;
  }

  return { preparar, iniciar, parar, status, detectarOutroEspanso, encerrarOrfaos };
}

module.exports = { criarMotor, normalizar, dentroDe, DEFAULT_YML, BASE_YML, PESSOAL_INICIAL };
