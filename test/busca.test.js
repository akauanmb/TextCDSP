'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizar, filtrarSnippets } = require('../src/shared/busca');
const { validarBiblioteca } = require('../src/shared/validador');

const exemplos = () => {
  const conteudo = fs.readFileSync(path.resolve(__dirname, '..', 'snippets', 'exemplos.yml'), 'utf8');
  return validarBiblioteca([{ nome: 'exemplos.yml', conteudo }]).snippets;
};
const triggers = (lista) => lista.map((s) => s.trigger).sort();

test('normalizar: sem maiúsculas e sem acentos', () => {
  assert.equal(normalizar('Preliminar'), 'preliminar');
  assert.equal(normalizar('AÇÃO Já'), 'acao ja');
  assert.equal(normalizar('parágrafo'), 'paragrafo');
  assert.equal(normalizar(null), '');
  assert.equal(normalizar(undefined), '');
});

test('buscar "preliminar", com ou sem acento, encontra /prelim', () => {
  for (const consulta of ['preliminar', 'PRELIMINAR', 'preliminár', 'Preliminar']) {
    assert.ok(triggers(filtrarSnippets(exemplos(), { texto: consulta })).includes('/prelim'), consulta);
  }
});

test('busca no trigger, no label, no preview e na categoria', () => {
  const s = exemplos();
  assert.deepEqual(triggers(filtrarSnippets(s, { texto: '/prazo' })), ['/prazo']); // trigger
  assert.ok(triggers(filtrarSnippets(s, { texto: 'formulario' })).includes('/qualif')); // label (sem acento)
  assert.ok(triggers(filtrarSnippets(s, { texto: 'obrigação de fazer' })).includes('/cont')); // preview
  assert.equal(filtrarSnippets(s, { texto: 'exemplos' }).length, s.length); // categoria
});

test('mais de uma palavra: todas precisam aparecer, em qualquer ordem', () => {
  const s = exemplos();
  assert.deepEqual(triggers(filtrarSnippets(s, { texto: 'data dias' })), ['/prazo']);
  assert.deepEqual(triggers(filtrarSnippets(s, { texto: 'dias data' })), ['/prazo']);
  assert.deepEqual(filtrarSnippets(s, { texto: 'data zzzzz' }), []);
});

test('texto vazio ou só espaços não filtra', () => {
  const s = exemplos();
  assert.equal(filtrarSnippets(s, { texto: '' }).length, s.length);
  assert.equal(filtrarSnippets(s, { texto: '   ' }).length, s.length);
  assert.equal(filtrarSnippets(s).length, s.length);
});

// Marco 10: a categoria é o caminho do arquivo; buscar o nome de uma pasta encontra os snippets dela.
test('buscar o nome de uma pasta (ou do arquivo) encontra os snippets dela', () => {
  const lista = [
    { trigger: '/a1', label: 'A', preview: '', categoria: 'Medicamentos/contestacao' },
    { trigger: '/b1', label: 'B', preview: '', categoria: 'Medicamentos/Recursos/agravo' },
    { trigger: '/c1', label: 'C', preview: '', categoria: 'exemplos' },
    { trigger: '/d1', label: 'D', preview: '', categoria: 'Pessoal' },
  ];
  assert.deepEqual(triggers(filtrarSnippets(lista, { texto: 'medicamentos' })), ['/a1', '/b1']);
  assert.deepEqual(triggers(filtrarSnippets(lista, { texto: 'RECURSOS' })), ['/b1']);
  assert.deepEqual(triggers(filtrarSnippets(lista, { texto: 'agravo' })), ['/b1']);
  assert.deepEqual(triggers(filtrarSnippets(lista, { texto: 'pessoal' })), ['/d1']);
  assert.deepEqual(triggers(filtrarSnippets(lista, { texto: 'medicamentos /a1' })), ['/a1']);
});

test('no navegador (sem module), o arquivo publica window.CDSPBusca', () => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'shared', 'busca.js'), 'utf8');
  const janela = {};
  vm.runInNewContext(codigo, { self: janela });
  assert.equal(typeof janela.CDSPBusca.filtrarSnippets, 'function');
  assert.equal(janela.CDSPBusca.normalizar('Ação'), 'acao');
});
