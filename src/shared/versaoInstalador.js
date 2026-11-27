'use strict';

// Formato do arquivo _instalador/versao.json, publicado na pasta compartilhada junto com o instalador:
//   { "versao": "0.2.0", "arquivo": "TextCDSP-Setup-0.2.0.exe", "notas": "texto curto", "sha256": "<64 hex>" }
// "notas" e "sha256" são opcionais. O sha256 é gravado por scripts/publicar.js e conferido pelo app
// antes de executar o instalador (um .exe copiado pela metade, ou trocado, não é executado).
// Função pura: só trabalha com texto. A leitura do disco fica em src/main/atualizacao.js.

const { analisarVersao } = require('./semver');

const TAMANHO_MAXIMO_NOTAS = 500;
const TAMANHO_MAXIMO_NOME = 100;
// Só um nome de arquivo simples e terminado em .exe. Sem barras, sem "..", sem unidade (C:): o app
// executa este arquivo, então ele nunca pode apontar para fora da pasta _instalador.
const PADRAO_NOME_ARQUIVO = /^[A-Za-z0-9][A-Za-z0-9._() -]*\.exe$/i;
const PADRAO_SHA256 = /^[0-9a-f]{64}$/i;

function validarCampos(dados) {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    return { ok: false, mensagem: 'o conteúdo precisa ser um objeto JSON, como { "versao": "0.2.0", "arquivo": "TextCDSP-Setup-0.2.0.exe" }' };
  }
  if (typeof dados.versao !== 'string' || !analisarVersao(dados.versao.trim())) {
    return { ok: false, mensagem: '"versao" ausente ou inválida (use o formato 0.2.0)' };
  }
  const arquivo = typeof dados.arquivo === 'string' ? dados.arquivo.trim() : '';
  if (!arquivo || arquivo.length > TAMANHO_MAXIMO_NOME || !PADRAO_NOME_ARQUIVO.test(arquivo) || arquivo.includes('..')) {
    return { ok: false, mensagem: '"arquivo" ausente ou inválido (precisa ser só o nome de um .exe que está na pasta _instalador, sem pastas)' };
  }
  let notas = '';
  if (dados.notas !== undefined && dados.notas !== null) {
    if (typeof dados.notas !== 'string') return { ok: false, mensagem: '"notas" precisa ser um texto' };
    notas = dados.notas.replace(/\s+/g, ' ').trim();
    if (notas.length > TAMANHO_MAXIMO_NOTAS) return { ok: false, mensagem: `"notas" passa de ${TAMANHO_MAXIMO_NOTAS} caracteres` };
  }
  let sha256 = '';
  if (dados.sha256 !== undefined && dados.sha256 !== null && dados.sha256 !== '') {
    if (typeof dados.sha256 !== 'string' || !PADRAO_SHA256.test(dados.sha256.trim())) {
      return { ok: false, mensagem: '"sha256" precisa ter 64 caracteres hexadecimais' };
    }
    sha256 = dados.sha256.trim().toLowerCase();
  }
  return { ok: true, info: { versao: dados.versao.trim(), arquivo, notas, sha256 } };
}

/**
 * Lê e confere o texto de um versao.json.
 * @returns {{ok: true, info: {versao: string, arquivo: string, notas: string, sha256: string}} | {ok: false, mensagem: string}}
 */
function lerVersaoJson(texto) {
  let dados;
  try {
    dados = JSON.parse(String(texto ?? '').replace(/^﻿/, ''));
  } catch {
    return { ok: false, mensagem: 'o arquivo não é um JSON válido' };
  }
  return validarCampos(dados);
}

/** Texto do versao.json (com quebra de linha no fim). Lança erro se os dados não passarem na mesma conferência de leitura. */
function montarVersaoJson({ versao, arquivo, notas = '', sha256 = '' }) {
  const conferido = validarCampos({ versao, arquivo, notas, sha256 });
  if (!conferido.ok) throw new Error(`versao.json inválido: ${conferido.mensagem}`);
  return `${JSON.stringify(conferido.info, null, 2)}\n`;
}

// Textos da interface (o menu da bandeja e a notificação).
const rotuloInstalar = (versao) => `Instalar versão ${versao}`;
const TITULO_NOTIFICACAO = 'Nova versão do TextCDSP disponível';

function corpoNotificacao({ versao, notas }) {
  const complemento = notas ? ` ${notas}` : '';
  return `Versão ${versao}.${complemento} Clique para instalar ou use o menu do ícone na bandeja.`;
}

module.exports = {
  TAMANHO_MAXIMO_NOTAS,
  lerVersaoJson,
  montarVersaoJson,
  rotuloInstalar,
  TITULO_NOTIFICACAO,
  corpoNotificacao,
};
