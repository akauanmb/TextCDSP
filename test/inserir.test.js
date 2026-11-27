'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MENSAGEM_NAO_INSERIVEL, podeInserir, normalizarQuebrasDeLinha, deveRestaurarAreaDeTransferencia } = require('../src/shared/inserir');
const { validarBiblioteca } = require('../src/shared/validador');

const m = (extra) => `matches:\n  - trigger: "/a1"\n    label: "x"\n${extra}`;
const snippetDe = (yaml) => validarBiblioteca([{ nome: 'a.yml', conteudo: yaml }]).snippets[0];

// ---------------------------------------------------------------------------
// podeInserir: cada tipo, com snippets de verdade vindos do validador
// ---------------------------------------------------------------------------

test('podeInserir: texto simples (replace sem variáveis) pode', () => {
  const s = snippetDe(m('    replace: "Olá, mundo"\n'));
  assert.equal(s.tipo, 'texto');
  assert.equal(podeInserir(s), true);
});

test('podeInserir: formulário, escolha, data, formatado e misto não podem', () => {
  const formulario = snippetDe(m('    replace: "{{form.nome}}"\n    vars:\n      - name: form\n        type: form\n        params:\n          layout: "[[nome]]"\n          fields:\n            nome: {}\n'));
  const escolha = snippetDe(m('    replace: "{{o}}"\n    vars:\n      - name: o\n        type: choice\n        params:\n          values:\n            - label: "A"\n              id: "texto a"\n'));
  const data = snippetDe(m('    replace: "{{d}}"\n    vars:\n      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n'));
  const html = snippetDe(m('    html: "<b>negrito</b>"\n'));
  const markdown = snippetDe(m('    markdown: "**negrito**"\n'));
  const misto = snippetDe(m('    html: "{{form.nome}}"\n    vars:\n      - name: form\n        type: form\n        params:\n          layout: "[[nome]]"\n          fields:\n            nome: {}\n'));
  assert.deepEqual([formulario.tipo, escolha.tipo, data.tipo, html.tipo, markdown.tipo, misto.tipo], ['formulario', 'escolha', 'data', 'formatado', 'formatado', 'misto']);
  for (const [nome, s] of Object.entries({ formulario, escolha, data, html, markdown, misto })) assert.equal(podeInserir(s), false, nome);
});

test('podeInserir: variável de outro tipo (echo) também deixa de ser texto simples', () => {
  const s = snippetDe(m('    replace: "{{e}}"\n    vars:\n      - name: e\n        type: echo\n        params:\n          echo: "oi"\n'));
  assert.notEqual(s.tipo, 'texto');
  assert.equal(podeInserir(s), false);
});

test('podeInserir: confere também o que a Biblioteca entrega à janela (tipo e campos) e recusa valores estranhos', () => {
  assert.equal(podeInserir({ tipo: 'texto', campos: [] }), true);
  assert.equal(podeInserir({ tipo: 'texto' }), true);
  assert.equal(podeInserir({ tipo: 'texto', campos: [{ nome: 'x', tipo: 'texto' }] }), false);
  assert.equal(podeInserir({ tipo: 'texto', formato: 'html' }), false);
  assert.equal(podeInserir({ tipo: 'texto', formato: 'markdown' }), false);
  assert.equal(podeInserir({ tipo: 'texto', formato: 'replace' }), true);
  for (const ruim of [null, undefined, 0, 'texto', [], {}, { tipo: 'Texto' }, { tipo: 'formulario' }]) {
    assert.equal(podeInserir(ruim), false, JSON.stringify(ruim));
  }
});

test('podeInserir: vale para oficiais e pessoais (o que decide é o tipo)', () => {
  const pessoal = { tipo: 'texto', campos: [], origem: 'pessoal' };
  const oficial = { tipo: 'texto', campos: [], origem: 'oficial' };
  assert.equal(podeInserir(pessoal), true);
  assert.equal(podeInserir(oficial), true);
});

test('a explicação para os outros tipos é a do plano', () => {
  assert.equal(MENSAGEM_NAO_INSERIVEL, 'Só atalhos de texto simples podem ser inseridos. Use Copiar texto.');
});

// ---------------------------------------------------------------------------
// normalizarQuebrasDeLinha
// ---------------------------------------------------------------------------

test('normalizarQuebrasDeLinha: tudo vira \\r\\n, sem dobrar o que já é \\r\\n', () => {
  assert.equal(normalizarQuebrasDeLinha('a\nb'), 'a\r\nb');
  assert.equal(normalizarQuebrasDeLinha('a\r\nb'), 'a\r\nb');
  assert.equal(normalizarQuebrasDeLinha('a\rb'), 'a\r\nb');
  assert.equal(normalizarQuebrasDeLinha('a\n\nb\r\n'), 'a\r\n\r\nb\r\n');
  assert.equal(normalizarQuebrasDeLinha('sem quebra'), 'sem quebra');
  assert.equal(normalizarQuebrasDeLinha(''), '');
  assert.equal(normalizarQuebrasDeLinha(null), '');
  assert.equal(normalizarQuebrasDeLinha('Ação: veja o ofício nº 1.\nÓtimo'), 'Ação: veja o ofício nº 1.\r\nÓtimo');
});

// ---------------------------------------------------------------------------
// deveRestaurarAreaDeTransferencia
// ---------------------------------------------------------------------------

test('restaurar: quando a área ainda tem o texto inserido', () => {
  assert.equal(deveRestaurarAreaDeTransferencia('Olá', 'Olá'), true);
  assert.equal(deveRestaurarAreaDeTransferencia('a\r\nb', 'a\r\nb'), true);
});

test('restaurar: a diferença entre \\n e \\r\\n não conta', () => {
  assert.equal(deveRestaurarAreaDeTransferencia('a\nb', 'a\r\nb'), true);
  assert.equal(deveRestaurarAreaDeTransferencia('a\r\nb', 'a\nb'), true);
});

test('não restaurar: a pessoa copiou outra coisa nesse meio tempo', () => {
  assert.equal(deveRestaurarAreaDeTransferencia('outra coisa', 'Olá'), false);
  assert.equal(deveRestaurarAreaDeTransferencia('Olá, mundo', 'Olá'), false); // parecido, mas não é o mesmo
  assert.equal(deveRestaurarAreaDeTransferencia('olá', 'Olá'), false); // maiúscula conta
  assert.equal(deveRestaurarAreaDeTransferencia('Olá ', 'Olá'), false); // espaço no fim conta
});

test('não restaurar: área vazia ou sem texto (imagem, arquivo) não é o texto inserido', () => {
  assert.equal(deveRestaurarAreaDeTransferencia('', 'Olá'), false);
  assert.equal(deveRestaurarAreaDeTransferencia(undefined, 'Olá'), false);
  assert.equal(deveRestaurarAreaDeTransferencia(null, 'Olá'), false);
  assert.equal(deveRestaurarAreaDeTransferencia('Olá', undefined), false);
});

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

test('no navegador (sem module), o arquivo publica window.CDSPInserir', () => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'shared', 'inserir.js'), 'utf8');
  const janela = {};
  vm.runInNewContext(codigo, { self: janela });
  assert.equal(janela.CDSPInserir.podeInserir({ tipo: 'texto', campos: [] }), true);
  assert.equal(janela.CDSPInserir.podeInserir({ tipo: 'formulario', campos: [] }), false);
  assert.equal(janela.CDSPInserir.MENSAGEM_NAO_INSERIVEL, MENSAGEM_NAO_INSERIVEL);
});
