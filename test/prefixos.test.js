'use strict';

// "-" e "\" como início de atalho (27/11/2026): os atalhos antigos do Text Blaze (-ot, \triag...) usam esses dois.
// Os dois exigem cuidado no YAML escrito à mão (ver o modelo do pessoal.yml e docs/INSTALACAO.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarBiblioteca, PREFIXOS_TRIGGER, PADRAO_TRIGGER, TEXTO_PREFIXOS_TRIGGER } = require('../src/shared/validador');
const { normalizarTrigger, validarCamposPessoais, aplicarAlteracaoPessoal, lerPessoais } = require('../src/shared/pessoais');
const { PESSOAL_INICIAL } = require('../src/main/motor');

const B = String.fromCharCode(92); // a barra invertida
const doYaml = (linhaTrigger) => validarBiblioteca([{ nome: 'a.yml', conteudo: `matches:\n  - ${linhaTrigger}\n    label: x\n    replace: y\n` }]);

test('a lista tem "-" e "\\" e o texto das mensagens os cita', () => {
  assert.ok(PREFIXOS_TRIGGER.includes('-'));
  assert.ok(PREFIXOS_TRIGGER.includes(B));
  assert.equal(TEXTO_PREFIXOS_TRIGGER, `/ ; ! # = + - ${B}`);
});

test('PADRAO_TRIGGER aceita -ot e \\triag, e continua recusando o resto', () => {
  for (const bom of ['-ot', '-jos', `${B}triag`, `${B}11111`, `${B}ms`, '-ms']) assert.equal(PADRAO_TRIGGER.test(bom), true, bom);
  for (const ruim of ['-', `${B}`, '-a', `${B}a`, '--ot', `${B}${B}ot`, '-Ot', '-ação', '-a-b', `${B}a.b`, '.ot', '_ot']) assert.equal(PADRAO_TRIGGER.test(ruim), false, ruim);
});

test('atalhos com "-" e "\\" passam no validador, com cada formato de aspas que funciona no YAML', () => {
  assert.deepEqual(doYaml('trigger: -ola').erros, []); // sem aspas: o "-" colado numa palavra é texto
  assert.deepEqual(doYaml(`trigger: ${B}ola`).erros, []); // sem aspas
  assert.deepEqual(doYaml(`trigger: '${B}ola'`).erros, []); // aspas simples
  assert.deepEqual(doYaml(`trigger: "${B}${B}ola"`).erros, []); // aspas duplas: a barra precisa ser dobrada
  assert.equal(doYaml(`trigger: "${B}${B}ola"`).snippets[0].trigger, `${B}ola`);
  assert.equal(doYaml('trigger: "-ola"').snippets[0].trigger, '-ola');
});

test('"\\ola" entre aspas duplas, com UMA barra, é erro de YAML (a barra abre um escape)', () => {
  assert.deepEqual(doYaml(`trigger: "${B}ola"`).erros.map((e) => e.regra), ['yaml']);
});

test('o mesmo corpo com prefixos diferentes não conflita: -ms e \\ms convivem', () => {
  const r = validarBiblioteca([{
    nome: 'a.yml',
    conteudo: ['matches:', '  - trigger: "-ms"', '    label: a', '    replace: a', `  - trigger: '${B}ms'`, '    label: b', '    replace: b', ''].join('\n'),
  }]);
  assert.deepEqual(r.erros, []);
  assert.equal(r.snippets.length, 2);
});

test('prefixo entre atalhos do mesmo caractere inicial continua sendo erro (-jo e -joao)', () => {
  const r = validarBiblioteca([{ nome: 'a.yml', conteudo: ['matches:', '  - trigger: "-jo"', '    label: a', '    replace: a', '  - trigger: "-joao"', '    label: b', '    replace: b', ''].join('\n') }]);
  assert.deepEqual(r.erros.map((e) => e.regra), ['trigger-prefixo']);
});

test('formulário de atalho pessoal: aceita -ola e \\ola, não os transforma e normaliza para minúsculas', () => {
  assert.equal(normalizarTrigger('-Ola'), '-ola');
  assert.equal(normalizarTrigger(`${B}OLA`), `${B}ola`);
  for (const bom of ['-ola', `${B}ola`]) {
    const { valor, erros } = validarCamposPessoais({ trigger: bom, label: 'x', texto: 'y' });
    assert.deepEqual(erros, {}, bom);
    assert.equal(valor.trigger, bom);
  }
  // A mensagem de erro cita os dois.
  const { erros } = validarCamposPessoais({ trigger: '@ola', label: 'x', texto: 'y' });
  assert.ok(erros.trigger.includes(`/ ; ! # = + - ${B}`), erros.trigger);
});

test('gravar e ler de volta um atalho pessoal com "\\": o YAML gravado tem a barra escapada e volta igual', () => {
  const novo = aplicarAlteracaoPessoal(PESSOAL_INICIAL, { tipo: 'criar', trigger: `${B}ola`, label: 'Saudação', texto: 'Olá' });
  assert.ok(novo.includes(`trigger: "${B}${B}ola"`), novo);
  assert.equal(lerPessoais(novo).matches[0].trigger, `${B}ola`);
  assert.deepEqual(validarBiblioteca([{ nome: 'pessoal.yml', conteudo: novo }]).erros, []);
});

test('o modelo do pessoal.yml cita os caracteres e ensina a escrever o "\\" à mão', () => {
  assert.ok(PESSOAL_INICIAL.includes(`/ ; ! # = + - ${B}`));
  assert.match(PESSOAL_INICIAL, /sempre entre aspas/);
  assert.ok(PESSOAL_INICIAL.includes(`'${B}ola'`), 'o exemplo do "\\" com aspas simples');
  assert.deepEqual(lerPessoais(PESSOAL_INICIAL), { valido: true, erro: null, matches: [] });
});
