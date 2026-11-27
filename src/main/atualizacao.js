'use strict';

// Aviso de nova versão do aplicativo (Marco 7). Sem atualização silenciosa: o app só AVISA quando a pasta
// compartilhada tem um instalador mais novo e, se a pessoa pedir, executa esse instalador.
//
// Convenção na pasta-fonte (scripts/publicar.js grava):
//   <fonte>\_instalador\versao.json   { "versao", "arquivo", "notas", "sha256" }  (src/shared/versaoInstalador.js)
//   <fonte>\_instalador\<arquivo>.exe
// A subpasta _instalador nunca entra na sincronização de snippets: lerFonte ignora pastas iniciadas por "_".
//
// A lógica de disco está aqui, sem Electron (os caminhos e as ações chegam por parâmetro), para testar com
// pastas temporárias. Notificação, menu e encerramento do app ficam em index.js e bandeja.js.

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { ehVersaoMaior } = require('../shared/semver');
const { lerVersaoJson } = require('../shared/versaoInstalador');
const { comTempoMaximo, descreverErroDeArquivo } = require('./sincronizacao');

const PASTA_INSTALADOR = '_instalador';
const ARQUIVO_VERSAO = 'versao.json';
const TEMPO_LEITURA_MS = 20000;
const TEMPO_COPIA_MS = 5 * 60 * 1000;

function hashDoArquivo(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(arquivo)
      .on('error', rejeitar)
      .on('data', (parte) => hash.update(parte))
      .on('end', () => resolver(hash.digest('hex')));
  });
}

async function ehArquivo(caminho) {
  try {
    return (await fsp.stat(caminho)).isFile();
  } catch {
    return false;
  }
}

async function ehPasta(caminho) {
  try {
    return (await fsp.stat(caminho)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {object} p
 * @param {object} p.caminhos  de caminhos.js (usa `instalador`)
 * @param {object} p.log
 * @param {() => string} p.obterFonte  pasta-fonte atual (config.fonteSnippets)
 * @param {string} p.versaoAtual       app.getVersion()
 * @param {() => string} [p.obterVersaoAvisada]  última versão da qual a pessoa já foi avisada
 * @param {(disponivel: object|null) => void} [p.aoMudar]  a versão disponível mudou (null = nenhuma)
 * @param {(info: object) => void} [p.aoNovaVersao]  chamada UMA vez por versão nova; quem chama grava a versão avisada
 */
function criarAtualizador({ caminhos, log, obterFonte, versaoAtual, obterVersaoAvisada = () => '', aoMudar = () => {}, aoNovaVersao = () => {} }) {
  let disponivel = null; // { versao, arquivo, notas, sha256, origem }
  let emVerificacao = null;
  let ultimoAvisoDeLog = '';

  // O mesmo problema persistente (versao.json inválido, instalador faltando) não deve lotar o log a cada ciclo.
  function avisarUmaVez(mensagem) {
    if (mensagem === ultimoAvisoDeLog) return;
    ultimoAvisoDeLog = mensagem;
    log.aviso(mensagem);
  }

  function definir(novo) {
    const mudou = (disponivel && disponivel.versao) !== (novo && novo.versao);
    disponivel = novo;
    if (mudou) {
      try {
        aoMudar(novo ? { ...novo } : null);
      } catch (erro) {
        log.aviso('Falha ao atualizar o menu com a nova versão', erro);
      }
    }
  }

  async function executar() {
    const fonte = String(obterFonte() || '').trim();
    if (!fonte) return definir(null);

    const pastaInstalador = path.join(fonte, PASTA_INSTALADOR);
    const arquivoVersao = path.join(pastaInstalador, ARQUIVO_VERSAO);

    let texto;
    try {
      texto = await comTempoMaximo(fsp.readFile(arquivoVersao, 'utf8'), TEMPO_LEITURA_MS);
    } catch (erro) {
      // Sem versao.json com a pasta acessível = nada publicado. Pasta inacessível: mantém o que já se sabia
      // (a sincronização dos snippets já registra e mostra que a pasta está offline).
      if (erro.code === 'ENOENT' && (await ehPasta(fonte))) return definir(null);
      return undefined;
    }

    const lido = lerVersaoJson(texto);
    if (!lido.ok) {
      avisarUmaVez(`${PASTA_INSTALADOR}\\${ARQUIVO_VERSAO} ignorado: ${lido.mensagem}`);
      return undefined;
    }
    const { info } = lido;
    if (!ehVersaoMaior(info.versao, versaoAtual)) return definir(null);

    const origem = path.join(pastaInstalador, info.arquivo);
    if (!(await ehArquivo(origem))) {
      avisarUmaVez(`A versão ${info.versao} está anunciada, mas ${info.arquivo} não está em ${PASTA_INSTALADOR}. Aviso adiado`);
      return definir(null);
    }
    ultimoAvisoDeLog = '';

    const primeiraVez = !disponivel || disponivel.versao !== info.versao;
    definir({ ...info, origem });
    if (primeiraVez) log.info(`Nova versão do TextCDSP disponível: ${info.versao} (instalada: ${versaoAtual})`);
    if (info.versao !== obterVersaoAvisada()) {
      try {
        aoNovaVersao({ ...info });
      } catch (erro) {
        log.aviso('Falha ao avisar sobre a nova versão', erro);
      }
    }
    return undefined;
  }

  // Sem verificações simultâneas: se já há uma rodando, devolve a mesma.
  function verificar() {
    if (emVerificacao) return emVerificacao;
    emVerificacao = executar()
      .catch((erro) => log.aviso(`Não foi possível verificar a nova versão: ${descreverErroDeArquivo(erro)}`))
      .finally(() => {
        emVerificacao = null;
      });
    return emVerificacao;
  }

  /**
   * Prepara o instalador para executar: confere de novo a pasta, copia o .exe para cache\instalador\ e confere o
   * sha256 da CÓPIA (é ela que será executada, então nada pode trocar o arquivo entre a conferência e a execução).
   * @returns {Promise<{ok: true, caminho: string, versao: string} | {ok: false, mensagem: string}>}
   */
  async function prepararInstalacao() {
    await verificar();
    if (!disponivel) return { ok: false, mensagem: 'Não há nova versão disponível na pasta de snippets.' };
    const alvo = { ...disponivel };
    const destino = path.join(caminhos.instalador, alvo.arquivo);
    const parcial = `${destino}.parcial`;
    try {
      await fsp.rm(caminhos.instalador, { recursive: true, force: true });
      await fsp.mkdir(caminhos.instalador, { recursive: true });
      await comTempoMaximo(fsp.copyFile(alvo.origem, parcial), TEMPO_COPIA_MS);
      if (alvo.sha256) {
        const real = await hashDoArquivo(parcial);
        if (real !== alvo.sha256) {
          log.erro(`O instalador ${alvo.arquivo} não confere com o sha256 publicado (esperado ${alvo.sha256}, obtido ${real}); não será executado`);
          await fsp.rm(caminhos.instalador, { recursive: true, force: true });
          return { ok: false, mensagem: 'O instalador na pasta não confere com o que foi publicado (arquivo incompleto ou alterado). Peça a quem publicou para publicar de novo.' };
        }
      } else {
        log.aviso(`${ARQUIVO_VERSAO} sem sha256: o instalador ${alvo.arquivo} será executado sem conferência de integridade`);
      }
      await fsp.rename(parcial, destino);
    } catch (erro) {
      log.erro('Não foi possível preparar o instalador', erro);
      await fsp.rm(caminhos.instalador, { recursive: true, force: true }).catch(() => {});
      return { ok: false, mensagem: `Não foi possível copiar o instalador da pasta de snippets (${descreverErroDeArquivo(erro)}).` };
    }
    return { ok: true, caminho: destino, versao: alvo.versao };
  }

  // Na inicialização: o instalador da vez anterior não serve mais (nem pode ficar ocupando 100 MB).
  async function limparInstaladorLocal() {
    try {
      await fsp.rm(caminhos.instalador, { recursive: true, force: true });
    } catch (erro) {
      log.aviso('Não foi possível apagar o instalador antigo de cache\\instalador', erro);
    }
  }

  return {
    verificar,
    prepararInstalacao,
    limparInstaladorLocal,
    disponivel: () => (disponivel ? { ...disponivel } : null),
  };
}

module.exports = { criarAtualizador, PASTA_INSTALADOR, ARQUIVO_VERSAO };
