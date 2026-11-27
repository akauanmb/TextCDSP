'use strict';

// O conversor de Text Blaze para YAML do Espanso (scripts/converter-textblaze.js), com dados sintéticos: o JSON real
// com os textos da CDSP não fica no repositório.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('yaml');
const {
  normalizarAtalho,
  tokenizar,
  lerParametros,
  converterFormatoDeTempo,
  converterConteudo,
  converterTudo,
  gerarYamlConferido,
  nomeDeArquivo,
} = require('../scripts/converter-textblaze');
const { validarBiblioteca } = require('../src/shared/validador');

const B = String.fromCharCode(92); // a barra invertida

// ---------------------------------------------------------------------------
// Atalho
// ---------------------------------------------------------------------------

test('normalizarAtalho: o prefixo fica; acento, ponto e maiúscula saem do resto', () => {
  assert.deepEqual(normalizarAtalho('/cont'), { trigger: '/cont', alterado: false });
  assert.deepEqual(normalizarAtalho('-ot'), { trigger: '-ot', alterado: false });
  assert.deepEqual(normalizarAtalho(`${B}triag`), { trigger: `${B}triag`, alterado: false });
  assert.deepEqual(normalizarAtalho('/contagemação'), { trigger: '/contagemacao', alterado: true });
  assert.deepEqual(normalizarAtalho('/checklaudo.ip'), { trigger: '/checklaudoip', alterado: true });
  assert.deepEqual(normalizarAtalho(`${B}opericiajustiça`), { trigger: `${B}opericiajustica`, alterado: true });
  assert.deepEqual(normalizarAtalho('/RCsentença'), { trigger: '/rcsentenca', alterado: true });
  assert.deepEqual(normalizarAtalho('  /cont  '), { trigger: '/cont', alterado: false }); // espaços nas pontas não contam como alteração
});

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

test('tokenizar: só os comandos conhecidos viram comando; o resto é texto', () => {
  const tokens = tokenizar('a {formtext: name=X} b {PRINT} c {clipboard} d {endformtoggle} {formtoggle: name=T; default=no}');
  assert.deepEqual(tokens.filter((t) => t.tipo === 'comando').map((t) => t.nome), ['formtext', 'clipboard', 'endformtoggle', 'formtoggle']);
  assert.ok(tokens.some((t) => t.tipo === 'texto' && t.valor.includes('{PRINT}')));
  assert.equal(tokens.map((t) => (t.tipo === 'texto' ? t.valor : t.bruto)).join(''), 'a {formtext: name=X} b {PRINT} c {clipboard} d {endformtoggle} {formtoggle: name=T; default=no}');
});

test('lerParametros: name e default, com vírgulas e acentos no nome', () => {
  assert.deepEqual(lerParametros('name=Erro médico, exclusivamente; default=no'), { name: 'Erro médico, exclusivamente', default: 'no' });
  assert.deepEqual(lerParametros('name=Data do evento; default='), { name: 'Data do evento', default: '' });
  assert.deepEqual(lerParametros('name=Só o nome'), { name: 'Só o nome' });
});

test('converterFormatoDeTempo: DD/MM/YYYY e variações; letra desconhecida devolve null', () => {
  assert.equal(converterFormatoDeTempo('DD/MM/YYYY'), '%d/%m/%Y');
  assert.equal(converterFormatoDeTempo('D/M/YYYY'), '%-d/%-m/%Y');
  assert.equal(converterFormatoDeTempo('MMMM YYYY'), '%B %Y');
  assert.equal(converterFormatoDeTempo('D de MMMM'), null); // a palavra "de" no meio não é um formato conhecido
  assert.equal(converterFormatoDeTempo('HH:mm'), '%H:%M');
  assert.equal(converterFormatoDeTempo('YYYY-MM-DD'), '%Y-%m-%d');
  assert.equal(converterFormatoDeTempo('XYZ'), null);
});

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

test('texto puro: sai idêntico, sem variáveis e sem avisos (inclusive espaço no fim e acentos)', () => {
  for (const texto of ['Fulano de Tal da Silva ', 'linha 1\nlinha 2\n\n\nlinha 5\n', '  começa com espaço', 'a\tb', 'aspas "duplas" e \'simples\' e a barra ' + B + ' e **negrito** de prompt']) {
    const r = converterConteudo(texto);
    assert.equal(r.replace, texto);
    assert.deepEqual(r.vars, []);
    assert.deepEqual(r.avisos, []);
  }
});

test('{formtext}: vira campo de um formulário, com o rótulo original e o identificador sem acento', () => {
  const r = converterConteudo('Data:\n{formtext: name=Data do evento; default=}(dia/mês/ano).');
  assert.equal(r.replace, 'Data:\n{{form1.data_do_evento}}(dia/mês/ano).');
  assert.deepEqual(r.vars, [{ name: 'form1', type: 'form', params: { layout: 'Data do evento: [[data_do_evento]]\n' } }]);
});

test('{formtext}: o mesmo nome duas vezes é o mesmo campo; nomes diferentes são campos diferentes; default= vira default', () => {
  const r = converterConteudo('{formtext: name=Nome; default=Fulano} e {formtext: name=Nome} e {formtext: name=Idade}');
  assert.equal(r.replace, '{{form1.nome}} e {{form1.nome}} e {{form1.idade}}');
  assert.equal(r.vars.length, 1);
  assert.equal(r.vars[0].params.layout, 'Nome: [[nome]]\nIdade: [[idade]]\n');
  assert.deepEqual(r.vars[0].params.fields, { nome: { default: 'Fulano' } });
});

test('{formparagraph}: campo de texto longo; a barra sobrando no nome é descartada', () => {
  const r = converterConteudo('{formparagraph: name=Transcrição do trecho' + B + ' }');
  assert.equal(r.replace, '{{form1.transcricao_do_trecho}}');
  assert.deepEqual(r.vars[0].params.fields, { transcricao_do_trecho: { multiline: true } });
  assert.equal(r.vars[0].params.layout, 'Transcrição do trecho: [[transcricao_do_trecho]]\n');
});

test('{time}: variável de data; o mesmo formato repetido reaproveita a variável', () => {
  const r = converterConteudo('hoje {time: DD/MM/YYYY} e de novo {time: DD/MM/YYYY} .');
  assert.equal(r.replace, 'hoje {{hoje}} e de novo {{hoje}} .');
  assert.deepEqual(r.vars, [{ name: 'hoje', type: 'date', params: { format: '%d/%m/%Y' } }]);
});

test('{time} com mês por extenso leva locale pt-BR; formato desconhecido fica como texto e avisa', () => {
  const r = converterConteudo('{time: MMMM YYYY}');
  assert.equal(r.vars[0].params.locale, 'pt-BR');
  const ruim = converterConteudo('{time: QQQ}');
  assert.equal(ruim.replace, '{time: QQQ}');
  assert.equal(ruim.avisos.length, 1);
});

test('{clipboard}: variável da área de transferência, uma só mesmo que apareça várias vezes', () => {
  const r = converterConteudo('{clipboard}\n\n{clipboard}');
  assert.equal(r.replace, '{{area_de_transferencia}}\n\n{{area_de_transferencia}}');
  assert.deepEqual(r.vars, [{ name: 'area_de_transferencia', type: 'clipboard' }]);
});

test('{formtoggle}: escolha "Não incluir"/"Incluir", com o trecho como id; default=no começa por "Não incluir"', () => {
  const r = converterConteudo('antes {formtoggle: name=RPV; default=no}Texto do RPV.\nSegunda linha.{endformtoggle} depois');
  assert.equal(r.replace, 'antes {{opcao_1}} depois');
  assert.deepEqual(r.vars, [{
    name: 'opcao_1',
    type: 'choice',
    params: { values: [{ label: 'Não incluir: RPV', id: '' }, { label: 'Incluir: RPV', id: 'Texto do RPV.\nSegunda linha.' }] },
  }]);
});

test('{formtoggle} com default=yes começa por "Incluir"; vários toggles numeram as variáveis em ordem', () => {
  const r = converterConteudo('{formtoggle: name=A; default=yes}a{endformtoggle}{formtoggle: name=B; default=no}b{endformtoggle}');
  assert.equal(r.replace, '{{opcao_1}}{{opcao_2}}');
  assert.deepEqual(r.vars[0].params.values.map((v) => v.label), ['Incluir: A', 'Não incluir: A']);
  assert.deepEqual(r.vars[1].params.values.map((v) => v.label), ['Não incluir: B', 'Incluir: B']);
});

test('ordem das variáveis: o formulário primeiro (ele aparece antes de tudo), depois as outras na ordem do texto', () => {
  const r = converterConteudo('{clipboard} {formtoggle: name=T}x{endformtoggle} {time: DD/MM/YYYY} {formtext: name=Nome}');
  assert.deepEqual(r.vars.map((v) => v.type), ['form', 'clipboard', 'choice', 'date']);
});

test('{PRINT} (e outro comando que o conversor não conhece) fica como texto e avisa, também dentro de um toggle', () => {
  const fora = converterConteudo('abra {PRINT} feche');
  assert.equal(fora.replace, 'abra {PRINT} feche');
  assert.equal(fora.avisos.length, 1);
  assert.match(fora.avisos[0], /\{PRINT\}/);
  const dentro = converterConteudo('{formtoggle: name=T}texto {PRINT} fim{endformtoggle}');
  assert.equal(dentro.vars[0].params.values[1].id, 'texto {PRINT} fim');
  assert.equal(dentro.avisos.length, 1);
  // Chaves comuns e as duplas já usadas pelo Espanso não geram aviso.
  assert.deepEqual(converterConteudo('JSON { "a": 1 } e [colchetes] e {1} e { espaço }').avisos, []);
});

test('toggles com problema: sem fim e sem começo ficam como texto, avisando; comando dentro do toggle avisa', () => {
  const semFim = converterConteudo('{formtoggle: name=T}corpo');
  assert.equal(semFim.avisos.length, 1);
  assert.equal(semFim.replace, '{formtoggle: name=T}corpo');
  const semComeco = converterConteudo('x{endformtoggle}');
  assert.equal(semComeco.replace, 'x{endformtoggle}');
  assert.equal(semComeco.avisos.length, 1);
  const aninhado = converterConteudo('{formtoggle: name=T}vale {clipboard}{endformtoggle}');
  assert.ok(aninhado.avisos.some((a) => /dentro de um bloco/.test(a)));
});

// ---------------------------------------------------------------------------
// Conjunto e YAML
// ---------------------------------------------------------------------------

const AMOSTRA = [
  { nome: 'Fulano', atalho: '-fu', pasta: 'CDSP - Nomes da equipe', conteudo: 'Fulano de Tal da Silva ' },
  { nome: 'Triagem', atalho: `${B}triag`, pasta: 'CDSP - Triagem jurídica', conteudo: '{formtoggle: name=RPV; default=no}Texto do RPV.{endformtoggle}\n{formtoggle: name=SEDUC; default=yes}Texto SEDUC.{endformtoggle}' },
  { nome: 'Contagem ', atalho: '/contagemação', pasta: 'CDSP - Jurídico', conteudo: 'Data: {formtext: name=Data do ajuizamento}\nHoje: {time: DD/MM/YYYY}\n{formparagraph: name=Observações}' },
  { nome: 'Prompt', atalho: '/laudo.ip', pasta: 'CDSP - Jurídico', conteudo: '**Critério**:\n\n1. Analise o "laudo" e a barra ' + B + ' e {{isto}} não existe aqui\n' },
  { nome: 'Área', atalho: '/area', pasta: 'CDSP - Jurídico', conteudo: '{clipboard}\n\ncom\ttab e espaço no fim   \n  e linha com recuo' },
];

test('converterTudo: um arquivo por pasta, na ordem original; atalhos alterados listados; nome sem espaços nas pontas', () => {
  const r = converterTudo(AMOSTRA.filter((i) => !i.conteudo.includes('{{')));
  assert.deepEqual([...r.arquivos.keys()], ['CDSP - Nomes da equipe.yml', 'CDSP - Triagem jurídica.yml', 'CDSP - Jurídico.yml']);
  assert.deepEqual(r.arquivos.get('CDSP - Jurídico.yml').map((m) => m.trigger), ['/contagemacao', '/area']);
  assert.equal(r.arquivos.get('CDSP - Jurídico.yml')[0].label, 'Contagem');
  assert.deepEqual(r.atalhosAlterados, [{ de: '/contagemação', para: '/contagemacao', nome: 'Contagem ' }]);
  assert.deepEqual(r.avisos, []);
});

test('converterTudo: prefixo fora da lista é avisado; nomeDeArquivo troca caracteres inválidos no Windows', () => {
  const r = converterTudo([{ nome: 'x', atalho: '@ola', pasta: 'P', conteudo: 'oi' }]);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0].mensagem, /@/);
  assert.equal(nomeDeArquivo('A/B: C?'), 'A-B- C-.yml');
  assert.equal(nomeDeArquivo('CDSP - Ensino médio'), 'CDSP - Ensino médio.yml');
});

test('o YAML gerado volta igual (texto de várias linhas, tab, espaços no fim, aspas, barra) e passa no validador', () => {
  const itens = AMOSTRA.map((i) => (i.conteudo.includes('{{') ? { ...i, conteudo: i.conteudo.replace('{{isto}}', '(isto)') } : i));
  const { arquivos } = converterTudo(itens);
  const textos = [...arquivos].map(([nome, matches]) => ({ nome, conteudo: gerarYamlConferido(matches, nome.replace(/\.yml$/, '')) }));
  for (const t of textos) assert.deepEqual(parse(t.conteudo).matches, arquivos.get(t.nome));
  const validacao = validarBiblioteca(textos);
  assert.deepEqual(validacao.erros, []);
  assert.deepEqual(validacao.avisos, []);
  assert.equal(validacao.snippets.length, itens.length);
});

test('o YAML gerado usa bloco literal para várias linhas e deixa as chaves sem aspas', () => {
  const { arquivos } = converterTudo([{ nome: 'x', atalho: '/xis', pasta: 'P', conteudo: 'linha 1\nlinha 2' }]);
  const yaml = gerarYamlConferido(arquivos.get('P.yml'), 'P');
  assert.match(yaml, /^# Pasta do Text Blaze: P$/m);
  assert.match(yaml, /^ {2}- trigger: "\/xis"$/m);
  assert.match(yaml, /^ {4}replace: \|-?$/m);
  assert.doesNotMatch(yaml, /"trigger":|"label":|"replace":/);
});

// Dois defeitos reais, achados ao carregar os 148 snippets no Espanso de verdade (docs/ESPANSO-NOTAS.md, P12).

test('texto que COMEÇA por TAB ou espaço não vira bloco literal: o Espanso descartaria o arquivo inteiro', () => {
  const TAB = String.fromCharCode(9);
  const textos = [`${TAB}Primeira linha\n Segunda linha com um espaço\nterceira`, ' começa com espaço\nlinha 2', '\nvazia no começo\nlinha 2'];
  for (const replace of textos) {
    const yaml = gerarYamlConferido([{ trigger: '/xis', label: 'x', replace }], 'P');
    assert.doesNotMatch(yaml, /replace: \|/, JSON.stringify(replace));
    assert.equal(parse(yaml).matches[0].replace, replace);
  }
  // O que não começa por espaço continua em bloco literal (mais legível de editar).
  const ok = gerarYamlConferido([{ trigger: '/xis', label: 'x', replace: 'linha 1\n\tcom tab na linha 2\nlinha 3' }], 'P');
  assert.match(ok, /replace: \|-/);
});

test('texto com uma linha só de espaço volta igual do YAML entre aspas (a biblioteca yaml dobrava a linha e errava)', () => {
  const replace = ' começa com espaço\n \nlinha depois da linha de espaço\n\t\nfim';
  const yaml = gerarYamlConferido([{ trigger: '/xis', label: 'x', replace }], 'P');
  assert.equal(parse(yaml).matches[0].replace, replace);
  assert.ok(!yaml.includes('\\\n'), 'sem barra de continuação de linha');
});

test('o texto das opções de um toggle também segue a regra (id começando por TAB)', () => {
  const TAB = String.fromCharCode(9);
  const r = converterConteudo(`{formtoggle: name=T}${TAB}Primeira linha\n Segunda linha{endformtoggle}`);
  const { arquivos } = converterTudo([{ nome: 'x', atalho: '/xis', pasta: 'P', conteudo: `{formtoggle: name=T}${TAB}Primeira linha\n Segunda linha{endformtoggle}` }]);
  const yaml = gerarYamlConferido(arquivos.get('P.yml'), 'P');
  assert.equal(parse(yaml).matches[0].vars[0].params.values[1].id, r.vars[0].params.values[1].id);
  assert.doesNotMatch(yaml, /id: \|/);
});

test('o atalho com "\\" é gravado escapado e volta como a barra simples', () => {
  const { arquivos } = converterTudo([{ nome: 'x', atalho: `${B}triag`, pasta: 'P', conteudo: 'oi' }]);
  const yaml = gerarYamlConferido(arquivos.get('P.yml'), 'P');
  assert.ok(yaml.includes(`trigger: "${B}${B}triag"`), yaml);
  assert.equal(parse(yaml).matches[0].trigger, `${B}triag`);
});
