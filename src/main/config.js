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
  // Última versão nova da qual o usuário já foi avisado (Marco 7). Só o app grava; a janela não altera.
  versaoAvisada: '',
  // Ao minimizar a janela principal, ela vira um ícone flutuante (Marco 11). Desligado: minimiza para a barra de tarefas.
  minimizarParaIcone: true,
  // Última posição do ícone flutuante, { x, y } em pixels de tela, ou null (usa o canto do monitor principal).
  // Só o app grava, ao soltar o ícone; a janela de configurações não altera.
  posicaoIcone: null,
});

// Uma posição válida é { x, y } com números inteiros. Qualquer outra coisa vira null.
function normalizarPosicao(valor) {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const { x, y } = valor;
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
}

// Garante o tipo das chaves novas, mesmo que o arquivo tenha sido editado à mão: valor inválido volta ao padrão.
function normalizar(configuracao) {
  return {
    ...configuracao,
    minimizarParaIcone: typeof configuracao.minimizarParaIcone === 'boolean' ? configuracao.minimizarParaIcone : PADROES.minimizarParaIcone,
    posicaoIcone: normalizarPosicao(configuracao.posicaoIcone),
  };
}

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
    return normalizar({ ...PADROES, ...dados });
  } catch (erro) {
    if (log) log.aviso(`${arquivo} está inválido; usando os padrões`, erro);
    return { ...PADROES };
  }
}

// Grava de forma atômica: escreve em <arquivo>.tmp e renomeia sobre o original.
// Se algo falhar, o arquivo anterior continua intacto. Devolve a configuração gravada.
function gravar(arquivo, configuracao) {
  const completa = normalizar({ ...PADROES, ...configuracao });
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

const INTERVALO_MINIMO_MIN = 5;
const INTERVALO_MAXIMO_MIN = 120;

// Confere o que veio da janela de configurações. Devolve { valor, erros }: `valor` só tem as chaves
// válidas que vieram em `entrada`, já normalizadas (texto sem espaços nas pontas, número inteiro).
function validarEntrada(entrada) {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { valor: {}, erros: ['Configuração inválida.'] };
  }
  const valor = {};
  const erros = [];

  if ('fonteSnippets' in entrada) {
    if (typeof entrada.fonteSnippets === 'string') valor.fonteSnippets = entrada.fonteSnippets.trim();
    else erros.push('A pasta de snippets precisa ser um texto.');
  }
  if ('intervaloSyncMin' in entrada) {
    const n = typeof entrada.intervaloSyncMin === 'string' && entrada.intervaloSyncMin.trim() !== '' ? Number(entrada.intervaloSyncMin) : entrada.intervaloSyncMin;
    if (Number.isInteger(n) && n >= INTERVALO_MINIMO_MIN && n <= INTERVALO_MAXIMO_MIN) valor.intervaloSyncMin = n;
    else erros.push(`O intervalo de sincronização deve ser um número inteiro de ${INTERVALO_MINIMO_MIN} a ${INTERVALO_MAXIMO_MIN} minutos.`);
  }
  for (const chave of ['iniciarComWindows', 'modoAdmin', 'minimizarParaIcone']) {
    if (chave in entrada) {
      if (typeof entrada[chave] === 'boolean') valor[chave] = entrada[chave];
      else erros.push(`A opção "${chave}" precisa ser verdadeira ou falsa.`);
    }
  }
  return { valor, erros };
}

module.exports = { PADROES, INTERVALO_MINIMO_MIN, INTERVALO_MAXIMO_MIN, ler, gravar, validarEntrada, normalizarPosicao };
