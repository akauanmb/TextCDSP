'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatarDataEspanso, somarSegundos } = require('../src/shared/datas');

// Quinta-feira, 26/11/2026, 09:05:07 (horário local)
const data = new Date(2026, 10, 26, 9, 5, 7);

test('%d e %-d: dia com e sem zero à esquerda', () => {
  assert.equal(formatarDataEspanso('%d', data), '26');
  assert.equal(formatarDataEspanso('%d', new Date(2026, 0, 3)), '03');
  assert.equal(formatarDataEspanso('%-d', new Date(2026, 0, 3)), '3');
  assert.equal(formatarDataEspanso('%-d', data), '26');
});

test('%m e %-m: mês numérico', () => {
  assert.equal(formatarDataEspanso('%m', data), '11');
  assert.equal(formatarDataEspanso('%m', new Date(2026, 0, 3)), '01');
  assert.equal(formatarDataEspanso('%-m', new Date(2026, 0, 3)), '1');
});

test('%Y: ano com quatro dígitos', () => {
  assert.equal(formatarDataEspanso('%Y', data), '2026');
  assert.equal(formatarDataEspanso('%y', data), '26');
});

test('%B: nome do mês em português, em minúsculas e com acento', () => {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  meses.forEach((nome, i) => assert.equal(formatarDataEspanso('%B', new Date(2026, i, 15)), nome));
});

test('%A: dia da semana em português', () => {
  // 22/11/2026 é domingo
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  dias.forEach((nome, i) => assert.equal(formatarDataEspanso('%A', new Date(2026, 10, 22 + i)), nome));
  assert.equal(formatarDataEspanso('%A', data), 'quinta-feira');
});

test('%H e %M: hora e minuto com dois dígitos', () => {
  assert.equal(formatarDataEspanso('%H:%M', data), '09:05');
  assert.equal(formatarDataEspanso('%H:%M', new Date(2026, 10, 26, 23, 59)), '23:59');
  assert.equal(formatarDataEspanso('%-H', data), '9');
});

test('formatos combinados, como os do pacote de exemplo', () => {
  assert.equal(formatarDataEspanso('%-d de %B de %Y', data), '26 de novembro de 2026');
  assert.equal(formatarDataEspanso('%d/%m/%Y', data), '26/11/2026');
  assert.equal(formatarDataEspanso('%A, %d de %B', data), 'quinta-feira, 26 de novembro');
});

test('abreviações %b e %a', () => {
  assert.equal(formatarDataEspanso('%b', data), 'nov');
  assert.equal(formatarDataEspanso('%a', data), 'qui');
});

test('%% vira % e códigos desconhecidos ficam como estão', () => {
  assert.equal(formatarDataEspanso('100%% em %Q', data), '100% em %Q');
  assert.equal(formatarDataEspanso('sem código', data), 'sem código');
});

test('somarSegundos: offset em segundos, positivo ou negativo, como no Espanso', () => {
  assert.equal(formatarDataEspanso('%d/%m/%Y', somarSegundos(data, 1296000)), '11/12/2026'); // 15 dias
  assert.equal(formatarDataEspanso('%d/%m/%Y', somarSegundos(data, -86400)), '25/11/2026');
  assert.equal(formatarDataEspanso('%d/%m/%Y', somarSegundos(data, 0)), '26/11/2026');
  assert.equal(formatarDataEspanso('%d/%m/%Y', somarSegundos(data, undefined)), '26/11/2026');
});

test('não altera a data recebida', () => {
  const copia = data.getTime();
  somarSegundos(data, 1000);
  formatarDataEspanso('%d', data);
  assert.equal(data.getTime(), copia);
});
