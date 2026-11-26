'use strict';

// Configurações do usuário em config.json. O caminho do arquivo vem por parâmetro
// (quem decide é caminhos.js), o que permite testar com uma pasta temporária.

const fs = require('node:fs');
const path = require('node:path');

const PADROES = Object.freeze({
  fonteSnippets: '',
  intervaloSyncMin: 15,
  iniciarComWindows: true,
  modoAdmin: false,
});

// Lê o arquivo e mescla com os padrões, para que chaves novas apareçam sozinhas.
// Arquivo ausente ou inválido devolve os padrões (o inválido é registrado, se houver `log`).
function ler(arquivo, log) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (erro) {
    if (erro.code !== 'ENOENT' && log) log.aviso(`Não foi possível ler ${arquivo}; usando os padrões`, erro);
    return { ...PADROES };
  }
  try {
    const dados = JSON.parse(texto.replace(/^﻿/, ''));
    if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new Error('o conteúdo não é um objeto JSON');
    }
    return { ...PADROES, ...dados };
  } catch (erro) {
    if (log) log.aviso(`${arquivo} está inválido; usando os padrões`, erro);
    return { ...PADROES };
  }
}

// Grava de forma atômica: escreve em <arquivo>.tmp e renomeia sobre o original.
// Se algo falhar, o arquivo anterior continua intacto. Devolve a configuração gravada.
function gravar(arquivo, configuracao) {
  const completa = { ...PADROES, ...configuracao };
  const temporario = `${arquivo}.tmp`;
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  try {
    const descritor = fs.openSync(temporario, 'w');
    try {
      fs.writeSync(descritor, `${JSON.stringify(completa, null, 2)}\n`);
      fs.fsyncSync(descritor);
    } finally {
      fs.closeSync(descritor);
    }
    fs.renameSync(temporario, arquivo);
  } catch (erro) {
    try {
      fs.rmSync(temporario, { force: true });
    } catch {
      // a limpeza não pode esconder o erro original
    }
    throw erro;
  }
  return completa;
}

module.exports = { PADROES, ler, gravar };
