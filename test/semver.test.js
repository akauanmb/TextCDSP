'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analisarVersao, compararVersoes, ehVersaoMaior } = require('../src/shared/semver');

test('analisarVersao: lê maior.menor.correcao', () => {
  assert.deepEqual(analisarVersao('0.1.0'), { maior: 0, menor: 1, correcao: 0, preLiberacao: [] });
  assert.deepEqual(analisarVersao('12.345.6789'), { maior: 12, menor: 345, correcao: 6789, preLiberacao: [] });
});

test('analisarVersao: lê pré-liberação e ignora o build', () => {
  assert.deepEqual(analisarVersao('1.0.0-rc.1'), { maior: 1, menor: 0, correcao: 0, preLiberacao: ['rc', '1'] });
  assert.deepEqual(analisarVersao('1.0.0+build.5'), { maior: 1, menor: 0, correcao: 0, preLiberacao: [] });
  assert.deepEqual(analisarVersao('1.0.0-beta+exp.sha.5114f85').preLiberacao, ['beta']);
});

test('analisarVersao: recusa o que não é uma versão completa', () => {
  for (const ruim of ['', '1', '1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '01.2.3', '1.02.3', '1.2.3-', '1.2.3-a..b', ' 1.2.3', '1.2.3 ', 'abc', null, undefined, 123, {}]) {
    assert.equal(analisarVersao(ruim), null, String(JSON.stringify(ruim)));
  }
});

test('analisarVersao: recusa números grandes demais para comparar com segurança', () => {
  assert.equal(analisarVersao('99999999999999999999.0.0'), null);
});

test('compararVersoes: compara número a número, não texto', () => {
  assert.equal(compararVersoes('0.1.0', '0.1.0'), 0);
  assert.equal(compararVersoes('0.1.1', '0.1.0'), 1);
  assert.equal(compararVersoes('0.1.0', '0.1.1'), -1);
  assert.equal(compararVersoes('0.2.0', '0.1.9'), 1);
  assert.equal(compararVersoes('1.0.0', '0.99.99'), 1);
  // "0.10.0" é maior que "0.9.0" (como texto seria menor).
  assert.equal(compararVersoes('0.10.0', '0.9.0'), 1);
  assert.equal(compararVersoes('0.1.10', '0.1.9'), 1);
});

test('compararVersoes: pré-liberação vem antes da versão final (ordem do semver)', () => {
  const ordem = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i < ordem.length - 1; i++) {
    assert.equal(compararVersoes(ordem[i], ordem[i + 1]), -1, `${ordem[i]} < ${ordem[i + 1]}`);
    assert.equal(compararVersoes(ordem[i + 1], ordem[i]), 1, `${ordem[i + 1]} > ${ordem[i]}`);
  }
});

test('compararVersoes: o build não conta', () => {
  assert.equal(compararVersoes('1.0.0+a', '1.0.0+b'), 0);
});

test('compararVersoes: lança erro com versão inválida', () => {
  assert.throws(() => compararVersoes('1.0', '1.0.0'), /inválida/);
  assert.throws(() => compararVersoes('1.0.0', 'x'), /inválida/);
});

test('ehVersaoMaior: só é verdadeiro para versão válida e maior', () => {
  assert.equal(ehVersaoMaior('0.1.1', '0.1.0'), true);
  assert.equal(ehVersaoMaior('0.1.0', '0.1.0'), false);
  assert.equal(ehVersaoMaior('0.0.9', '0.1.0'), false);
  assert.equal(ehVersaoMaior('1.0.0-rc.1', '0.9.0'), true);
  assert.equal(ehVersaoMaior('1.0.0-rc.1', '1.0.0'), false);
  // Entrada inválida nunca dispara aviso e nunca lança erro.
  assert.equal(ehVersaoMaior('abc', '0.1.0'), false);
  assert.equal(ehVersaoMaior('0.2.0', 'abc'), false);
  assert.equal(ehVersaoMaior(undefined, '0.1.0'), false);
});
