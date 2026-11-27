'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TAMANHO_MAXIMO_NOTAS,
  lerVersaoJson,
  montarVersaoJson,
  rotuloInstalar,
  TITULO_NOTIFICACAO,
  corpoNotificacao,
} = require('../src/shared/versaoInstalador');

const SHA = 'a'.repeat(64);
const basico = { versao: '0.2.0', arquivo: 'TextCDSP-Setup-0.2.0.exe' };

test('lerVersaoJson: aceita só versao e arquivo (notas e sha256 são opcionais)', () => {
  const r = lerVersaoJson(JSON.stringify(basico));
  assert.deepEqual(r, { ok: true, info: { versao: '0.2.0', arquivo: 'TextCDSP-Setup-0.2.0.exe', notas: '', sha256: '' } });
});

test('lerVersaoJson: lê todos os campos, normalizando notas e sha256', () => {
  const r = lerVersaoJson(JSON.stringify({ ...basico, notas: '  Corrige a busca.\n  Novo ícone. ', sha256: SHA.toUpperCase() }));
  assert.equal(r.ok, true);
  assert.equal(r.info.notas, 'Corrige a busca. Novo ícone.');
  assert.equal(r.info.sha256, SHA);
});

test('lerVersaoJson: tolera BOM, que o Bloco de Notas pode gravar', () => {
  assert.equal(lerVersaoJson(`\uFEFF${JSON.stringify(basico)}`).ok, true);
});

test('lerVersaoJson: JSON quebrado ou que não é objeto', () => {
  for (const ruim of ['', '{ nao e json', 'null', '[]', '"texto"', '42']) {
    const r = lerVersaoJson(ruim);
    assert.equal(r.ok, false, ruim);
    assert.ok(r.mensagem.length > 0);
  }
});

test('lerVersaoJson: versão ausente ou inválida', () => {
  for (const versao of [undefined, null, 5, '', '0.2', 'v0.2.0', 'nova']) {
    const r = lerVersaoJson(JSON.stringify({ ...basico, versao }));
    assert.equal(r.ok, false, String(versao));
    assert.match(r.mensagem, /versao/);
  }
});

test('lerVersaoJson: "arquivo" só pode ser o nome de um .exe, sem caminho (o app executa este arquivo)', () => {
  const ruins = [
    undefined, '', 5,
    '..\\..\\Windows\\System32\\calc.exe',
    '../fora.exe',
    'sub\\setup.exe',
    'sub/setup.exe',
    'C:\\Windows\\notepad.exe',
    '\\\\servidor\\pasta\\setup.exe',
    'setup.msi',
    'setup.exe.bat',
    'setup',
    '.exe',
    '..exe',
    'a..b.exe',
    `${'a'.repeat(120)}.exe`,
  ];
  for (const arquivo of ruins) {
    const r = lerVersaoJson(JSON.stringify({ ...basico, arquivo }));
    assert.equal(r.ok, false, String(arquivo));
    assert.match(r.mensagem, /arquivo/);
  }
});

test('lerVersaoJson: espaços nas pontas do nome do arquivo são descartados', () => {
  const r = lerVersaoJson(JSON.stringify({ ...basico, arquivo: '  setup.exe ' }));
  assert.equal(r.ok, true);
  assert.equal(r.info.arquivo, 'setup.exe');
});

test('lerVersaoJson: aceita nomes normais de instalador, inclusive com espaços e parênteses', () => {
  for (const arquivo of ['TextCDSP-Setup-0.2.0.exe', 'Setup.EXE', 'TextCDSP Setup 0.2.0 (1).exe']) {
    assert.equal(lerVersaoJson(JSON.stringify({ ...basico, arquivo })).ok, true, arquivo);
  }
});

test('lerVersaoJson: notas precisam ser texto e têm limite de tamanho', () => {
  assert.equal(lerVersaoJson(JSON.stringify({ ...basico, notas: 5 })).ok, false);
  assert.equal(lerVersaoJson(JSON.stringify({ ...basico, notas: null })).ok, true);
  assert.equal(lerVersaoJson(JSON.stringify({ ...basico, notas: 'x'.repeat(TAMANHO_MAXIMO_NOTAS) })).ok, true);
  const longa = lerVersaoJson(JSON.stringify({ ...basico, notas: 'x'.repeat(TAMANHO_MAXIMO_NOTAS + 1) }));
  assert.equal(longa.ok, false);
  assert.match(longa.mensagem, /notas/);
});

test('lerVersaoJson: sha256 precisa ter 64 caracteres hexadecimais', () => {
  for (const ruim of ['abc', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 12]) {
    const r = lerVersaoJson(JSON.stringify({ ...basico, sha256: ruim }));
    assert.equal(r.ok, false, String(ruim));
    assert.match(r.mensagem, /sha256/);
  }
  assert.equal(lerVersaoJson(JSON.stringify({ ...basico, sha256: '' })).ok, true);
});

test('montarVersaoJson: gera um texto que lerVersaoJson devolve igual', () => {
  const texto = montarVersaoJson({ ...basico, notas: 'Texto curto.', sha256: SHA });
  assert.ok(texto.endsWith('\n'));
  assert.deepEqual(JSON.parse(texto), { versao: '0.2.0', arquivo: 'TextCDSP-Setup-0.2.0.exe', notas: 'Texto curto.', sha256: SHA });
  assert.deepEqual(lerVersaoJson(texto), { ok: true, info: { ...basico, notas: 'Texto curto.', sha256: SHA } });
});

test('montarVersaoJson: não gera um arquivo que o app recusaria', () => {
  assert.throws(() => montarVersaoJson({ versao: 'x', arquivo: basico.arquivo }), /versao/);
  assert.throws(() => montarVersaoJson({ versao: '0.2.0', arquivo: '..\\x.exe' }), /arquivo/);
  assert.throws(() => montarVersaoJson({ ...basico, sha256: 'curto' }), /sha256/);
});

test('textos da interface', () => {
  assert.equal(rotuloInstalar('0.1.1'), 'Instalar versão 0.1.1');
  assert.equal(TITULO_NOTIFICACAO, 'Nova versão do TextCDSP disponível');
  assert.match(corpoNotificacao({ versao: '0.1.1', notas: '' }), /^Versão 0\.1\.1\. Clique para instalar/);
  assert.match(corpoNotificacao({ versao: '0.1.1', notas: 'Corrige a busca.' }), /^Versão 0\.1\.1\. Corrige a busca\. Clique/);
});
