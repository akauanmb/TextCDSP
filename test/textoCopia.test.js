'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { montarTextoParaCopia, substituirVariaveis } = require('../src/shared/textoCopia');
const { validarBiblioteca } = require('../src/shared/validador');

const hoje = new Date(2026, 10, 26, 9, 5);

test('replace: data resolvida para hoje e campos trocados por [campo]', () => {
  const r = montarTextoParaCopia({
    formato: 'replace',
    saida: 'Cuiabá-MT, {{data}}.\nParte: {{form1.nome}}\n{{paragrafo}}',
    datas: [{ nome: 'data', formato: '%-d de %B de %Y', offset: 0 }],
  }, hoje);
  assert.equal(r.texto, 'Cuiabá-MT, 26 de novembro de 2026.\nParte: [nome]\n[paragrafo]');
  assert.equal(r.html, null);
});

test('offset da data (em segundos) é aplicado', () => {
  const r = montarTextoParaCopia({ formato: 'replace', saida: '{{prazo}}', datas: [{ nome: 'prazo', formato: '%d/%m/%Y', offset: 1296000 }] }, hoje);
  assert.equal(r.texto, '11/12/2026');
});

test('html: devolve o html resolvido e o texto puro', () => {
  const r = montarTextoParaCopia({
    formato: 'html',
    saida: '<p><b>DOS PEDIDOS</b></p><ol><li>um &amp; dois</li><li>de {{form1.nome}}</li></ol><p>{{data}}</p>',
    datas: [{ nome: 'data', formato: '%d/%m/%Y', offset: 0 }],
  }, hoje);
  assert.equal(r.html, '<p><b>DOS PEDIDOS</b></p><ol><li>um &amp; dois</li><li>de [nome]</li></ol><p>26/11/2026</p>');
  assert.equal(r.texto, 'DOS PEDIDOS\num & dois\nde [nome]\n26/11/2026');
});

test('markdown: copia o texto como está (sem html)', () => {
  const r = montarTextoParaCopia({ formato: 'markdown', saida: '**negrito** {{form1.x}}' }, hoje);
  assert.equal(r.texto, '**negrito** [x]');
  assert.equal(r.html, null);
});

test('variáveis com espaços e sem datas declaradas', () => {
  assert.equal(substituirVariaveis('a {{ nome }} b {{f.campo}}', undefined, hoje), 'a [nome] b [campo]');
});

test('saída vazia ou ausente', () => {
  assert.deepEqual(montarTextoParaCopia({ formato: 'replace', saida: '' }, hoje), { texto: '', html: null });
  assert.deepEqual(montarTextoParaCopia({ formato: 'replace' }, hoje), { texto: '', html: null });
});

test('não altera o snippet recebido', () => {
  const s = { formato: 'replace', saida: '{{d}}', datas: [{ nome: 'd', formato: '%Y', offset: 0 }] };
  const antes = JSON.stringify(s);
  montarTextoParaCopia(s, hoje);
  assert.equal(JSON.stringify(s), antes);
});

test('com o pacote de exemplo: /hoje, /prazo, /qualif e /fmt', () => {
  const conteudo = fs.readFileSync(path.resolve(__dirname, '..', 'snippets', 'exemplos.yml'), 'utf8');
  const { snippets } = validarBiblioteca([{ nome: 'exemplos.yml', conteudo }]);
  const por = (t) => snippets.find((s) => s.trigger === t);

  assert.equal(montarTextoParaCopia(por('/hoje'), hoje).texto, 'Cuiabá-MT, 26 de novembro de 2026.');
  assert.equal(montarTextoParaCopia(por('/prazo'), hoje).texto, '11/12/2026');
  assert.equal(montarTextoParaCopia(por('/prelim'), hoje).texto, '[paragrafo]');

  const qualif = montarTextoParaCopia(por('/qualif'), hoje).texto;
  assert.match(qualif, /^Processo n\. \[cnj\]\nParte autora: \[nome\]/);
  assert.match(qualif, /Cuiabá-MT, 26 de novembro de 2026\.$/);

  const fmt = montarTextoParaCopia(por('/fmt'), hoje);
  assert.match(fmt.html, /<b>DOS PEDIDOS<\/b>/);
  assert.match(fmt.html, /<ol>/);
  assert.match(fmt.html, /<b>\[nome\]<\/b>/);
  assert.match(fmt.html, /26 de novembro de 2026/);
  assert.ok(!fmt.html.includes('{{'));
  assert.match(fmt.texto, /^DOS PEDIDOS\nDiante do exposto/);
});
