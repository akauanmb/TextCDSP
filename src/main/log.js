'use strict';

// Log do aplicativo em logs\app.log: uma linha por evento, com data e hora ISO.
// Rotação simples: ao passar de 1 MB, o arquivo vira app.1.log (o anterior é substituído).
// Nunca lança erro: falha de log não pode derrubar o aplicativo.

const fs = require('node:fs');
const path = require('node:path');

const LIMITE_BYTES = 1024 * 1024;

function descreverErro(erro) {
  if (!erro) return '';
  if (erro instanceof Error) {
    const pilha = String(erro.stack || erro.message).split('\n').map((l) => l.trim()).join(' | ');
    return pilha;
  }
  return String(erro);
}

function criarLog(pastaLogs, { limiteBytes = LIMITE_BYTES } = {}) {
  const arquivo = path.join(pastaLogs, 'app.log');
  const antigo = path.join(pastaLogs, 'app.1.log');

  function rotacionar() {
    let tamanho = 0;
    try {
      tamanho = fs.statSync(arquivo).size;
    } catch {
      return; // ainda não existe
    }
    if (tamanho >= limiteBytes) {
      fs.rmSync(antigo, { force: true });
      fs.renameSync(arquivo, antigo);
    }
  }

  function escrever(nivel, mensagem, erro) {
    const detalhe = erro ? `: ${descreverErro(erro)}` : '';
    const linha = `${new Date().toISOString()} [${nivel}] ${mensagem}${detalhe}\n`;
    try {
      fs.mkdirSync(pastaLogs, { recursive: true });
      rotacionar();
      fs.appendFileSync(arquivo, linha, 'utf8');
    } catch {
      // sem ter onde registrar, segue em frente
    }
  }

  return {
    arquivo,
    info: (mensagem, erro) => escrever('info', mensagem, erro),
    aviso: (mensagem, erro) => escrever('aviso', mensagem, erro),
    erro: (mensagem, erro) => escrever('erro', mensagem, erro),
  };
}

module.exports = { criarLog };
