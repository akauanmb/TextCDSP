'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatarDataHora, textoStatusSync } = require('../src/shared/statusSync');

// Data no horário local, para o teste não depender do fuso da máquina.
const quando = new Date(2026, 10, 26, 9, 5).toISOString();

test('formatarDataHora: dd/mm hh:mm com zeros à esquerda', () => {
  assert.equal(formatarDataHora(quando), '26/11 09:05');
  assert.equal(formatarDataHora(new Date(2026, 0, 3, 23, 59).toISOString()), '03/01 23:59');
});

test('formatarDataHora: ausente ou inválida devolve null', () => {
  assert.equal(formatarDataHora(null), null);
  assert.equal(formatarDataHora(undefined), null);
  assert.equal(formatarDataHora(''), null);
  assert.equal(formatarDataHora('não é data'), null);
});

test('texto: pasta não configurada', () => {
  assert.equal(textoStatusSync({ status: 'nao-configurado' }), 'Pasta de snippets não configurada');
  assert.equal(textoStatusSync({ status: 'nao-configurado', aplicadoEm: quando }), 'Pasta de snippets não configurada');
});

test('texto: snippets atualizados com data e hora', () => {
  assert.equal(textoStatusSync({ status: 'atualizado', aplicadoEm: quando }), 'Snippets atualizados (26/11 09:05)');
});

test('texto: sem conexão, usando a versão aplicada', () => {
  assert.equal(textoStatusSync({ status: 'offline', aplicadoEm: quando }), 'Sem conexão com a pasta, usando versão de 26/11 09:05');
});

test('texto: sem conexão e sem nenhuma versão aplicada ainda', () => {
  assert.equal(textoStatusSync({ status: 'offline', aplicadoEm: null }), 'Sem conexão com a pasta (nenhuma versão aplicada ainda)');
});

test('texto: erro na pasta de snippets', () => {
  assert.equal(textoStatusSync({ status: 'erro-na-fonte', aplicadoEm: quando }), 'Erro na pasta de snippets, veja detalhes');
});

test('texto: ainda sem resultado', () => {
  assert.equal(textoStatusSync({ status: 'pendente' }), 'Sincronizando snippets...');
  assert.equal(textoStatusSync({ status: undefined }), 'Sincronizando snippets...');
});
