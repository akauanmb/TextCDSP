'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ErroPessoal,
  normalizarTrigger,
  validarCamposPessoais,
  conflitosDoAtalho,
  lerPessoais,
  aplicarAlteracaoPessoal: aplicar,
} = require('../src/shared/pessoais');
const { validarBiblioteca } = require('../src/shared/validador');
const { PESSOAL_INICIAL } = require('../src/main/motor');

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

const criar = (conteudo, trigger, label, texto) => aplicar(conteudo, { tipo: 'criar', trigger, label, texto });

// Um match escrito à mão, com variável, comentários e linha em branco, no formato do pessoal.yml.
const MATCH_A_MAO = [
  '  # minha data (escrita à mão)',
  '  - trigger: "/dh"',
  '    label: "Data de hoje"',
  '    replace: "Cuiabá-MT, {{d}}." # comentário na mesma linha',
  '    vars:',
  '      - name: d',
  '        type: date',
  '        params:',
  '          format: "%d/%m/%Y"',
  '',
].join('\n');
const ARQUIVO_A_MAO = `# Meus atalhos\nmatches:\n${MATCH_A_MAO}`;

function erroDe(fn) {
  try {
    fn();
  } catch (erro) {
    return erro;
  }
  assert.fail('deveria ter lançado um erro');
}

// O pessoal.yml, depois de alterado, tem que continuar sendo lido pelo validador e pelo lerPessoais.
function conferirLegivel(conteudo) {
  const lido = lerPessoais(conteudo);
  assert.equal(lido.valido, true, 'lerPessoais');
  const v = validarBiblioteca([{ nome: 'pessoal.yml', conteudo }]);
  assert.deepEqual(v.erros.filter((e) => e.regra === 'yaml' || e.regra === 'estrutura'), []);
  return { lido, v };
}

// ---------------------------------------------------------------------------
// criar
// ---------------------------------------------------------------------------

test('criar no pessoal.yml inicial (só comentários, sem matches)', () => {
  const novo = criar(PESSOAL_INICIAL, '/ola', 'Saudação', 'Olá, tudo bem?');
  // Os comentários do modelo continuam lá, e o atalho novo entra abaixo deles.
  assert.ok(novo.startsWith('# Meus atalhos pessoais (TextCDSP)'));
  assert.ok(novo.includes('# Para criar um atalho, apague o "# " das linhas abaixo e ajuste:'));
  assert.ok(novo.includes('#   - trigger: "/ola"')); // o exemplo comentado não foi tocado
  assert.match(novo, /\nmatches:\n {2}- trigger: "\/ola"\n {4}label: "Saudação"\n {4}replace: "Olá, tudo bem\?"\n$/);

  const { lido, v } = conferirLegivel(novo);
  assert.equal(lido.matches.length, 1);
  assert.deepEqual(lido.matches[0], { trigger: '/ola', editavel: true, label: 'Saudação', texto: 'Olá, tudo bem?', linha: lido.matches[0].linha });
  assert.deepEqual(v.snippets.map((s) => s.trigger), ['/ola']);
});

test('criar em arquivo totalmente vazio ou em branco', () => {
  for (const vazio of ['', '\n', '   \n']) {
    const novo = criar(vazio, '/ola', 'Saudação', 'oi');
    assert.equal(conferirLegivel(novo).lido.matches[0].trigger, '/ola');
  }
});

test('criar com matches existentes: entra no fim e a ordem é mantida', () => {
  const um = criar(ARQUIVO_A_MAO, '/ola', 'Saudação', 'oi');
  const dois = criar(um, '/tchau', 'Despedida', 'até logo');
  const { lido } = conferirLegivel(dois);
  assert.deepEqual(lido.matches.map((m) => m.trigger), ['/dh', '/ola', '/tchau']);
});

test('criar em "matches: []" (lista vazia) e em "matches:" sem valor', () => {
  for (const base of ['matches: []\n', 'matches:\n', '# c\nmatches: []\n']) {
    const novo = criar(base, '/ola', 'Saudação', 'oi');
    assert.deepEqual(conferirLegivel(novo).lido.matches.map((m) => m.trigger), ['/ola'], base);
    assert.ok(!novo.includes('['), `lista em bloco: ${novo}`);
  }
});

test('criar um trigger que já existe lança ja-existe e não altera nada', () => {
  const erro = erroDe(() => criar(ARQUIVO_A_MAO, '/dh', 'Outro', 'x'));
  assert.ok(erro instanceof ErroPessoal);
  assert.equal(erro.codigo, 'ja-existe');
});

// ---------------------------------------------------------------------------
// texto: várias linhas, aspas, dois-pontos, acentos
// ---------------------------------------------------------------------------

const TEXTOS_DIFICEIS = [
  'Olá, tudo bem?\nSegunda linha com Ação: dois-pontos e "aspas"\n  linha recuada\n',
  'Três linhas\ncom acentuação: çãõéü\nE uma 3ª linha',
  '  começa com espaços\ne termina com espaço  ',
  '# parece comentário\n- parece item de lista\n: começa com dois-pontos',
  'linha1\n\n\nlinha4 depois de duas linhas em branco',
  'com\ttab, emoji 😀 e aspas \'simples\' e "duplas"',
  'uma linha só: com # e "aspas" e \\ barra invertida',
  'termina com uma quebra\n',
  'termina com duas quebras\n\n',
  'true',
  '123',
  'null',
  '@arroba e `crase` e %porcento e *asterisco* e &e e !exclamação',
];

test('texto difícil volta idêntico, lido pelo lerPessoais e pelo validador', () => {
  for (const texto of TEXTOS_DIFICEIS) {
    const novo = criar(PESSOAL_INICIAL, '/ola', 'Teste: "com aspas" e acentuação ç', texto);
    const { lido, v } = conferirLegivel(novo);
    assert.equal(lido.matches[0].texto, texto, `lerPessoais: ${JSON.stringify(texto)}`);
    assert.equal(lido.matches[0].label, 'Teste: "com aspas" e acentuação ç');
    assert.equal(v.snippets[0].saida, texto, `validador: ${JSON.stringify(texto)}`);
    assert.equal(v.snippets[0].label, 'Teste: "com aspas" e acentuação ç');
    assert.deepEqual(v.erros, [], JSON.stringify(texto));
  }
});

test('texto de várias linhas é gravado como bloco literal (|-)', () => {
  const novo = criar('', '/ola', 'Saudação', 'linha 1\nlinha 2\nlinha 3');
  assert.match(novo, /replace: \|-\n {6}linha 1\n {6}linha 2\n {6}linha 3\n/);
  assert.equal(conferirLegivel(novo).lido.matches[0].texto, 'linha 1\nlinha 2\nlinha 3');
});

test('texto de uma linha só fica entre aspas duplas', () => {
  const novo = criar('', '/ola', 'Saudação', 'uma linha: com dois-pontos');
  assert.match(novo, /replace: "uma linha: com dois-pontos"/);
});

// ---------------------------------------------------------------------------
// editar
// ---------------------------------------------------------------------------

test('editar mudando o trigger: o antigo some e o novo ocupa o mesmo lugar', () => {
  let c = criar(ARQUIVO_A_MAO, '/ola', 'Saudação', 'oi');
  c = criar(c, '/tchau', 'Despedida', 'até logo');
  const editado = aplicar(c, { tipo: 'editar', triggerOriginal: '/ola', trigger: '/saudacao', label: 'Saudação nova', texto: 'oi\ntudo bem?' });
  const { lido } = conferirLegivel(editado);
  assert.deepEqual(lido.matches.map((m) => m.trigger), ['/dh', '/saudacao', '/tchau']);
  assert.equal(lido.matches[1].label, 'Saudação nova');
  assert.equal(lido.matches[1].texto, 'oi\ntudo bem?');
  assert.ok(!editado.includes('"/ola"'));
});

test('editar só o texto, mantendo o trigger', () => {
  const c = criar(PESSOAL_INICIAL, '/ola', 'Saudação', 'oi');
  const editado = aplicar(c, { tipo: 'editar', triggerOriginal: '/ola', trigger: '/ola', label: 'Saudação', texto: 'olá, mundo' });
  assert.equal(conferirLegivel(editado).lido.matches[0].texto, 'olá, mundo');
});

test('editar um atalho que não existe lança nao-encontrado', () => {
  assert.equal(erroDe(() => aplicar(ARQUIVO_A_MAO, { tipo: 'editar', triggerOriginal: '/nada', trigger: '/nada', label: 'x', texto: 'y' })).codigo, 'nao-encontrado');
  assert.equal(erroDe(() => aplicar(PESSOAL_INICIAL, { tipo: 'editar', triggerOriginal: '/nada', trigger: '/nada', label: 'x', texto: 'y' })).codigo, 'nao-encontrado');
});

test('editar para um trigger que já existe lança ja-existe', () => {
  const c = criar(criar(PESSOAL_INICIAL, '/ola', 'A', 'a'), '/tchau', 'B', 'b');
  const erro = erroDe(() => aplicar(c, { tipo: 'editar', triggerOriginal: '/ola', trigger: '/tchau', label: 'A', texto: 'a' }));
  assert.equal(erro.codigo, 'ja-existe');
});

// ---------------------------------------------------------------------------
// excluir
// ---------------------------------------------------------------------------

test('excluir remove só o atalho pedido', () => {
  let c = criar(ARQUIVO_A_MAO, '/ola', 'Saudação', 'oi');
  c = criar(c, '/tchau', 'Despedida', 'até logo');
  const sem = aplicar(c, { tipo: 'excluir', triggerOriginal: '/ola' });
  assert.deepEqual(conferirLegivel(sem).lido.matches.map((m) => m.trigger), ['/dh', '/tchau']);
});

test('excluir o último atalho deixa "matches: []" e o arquivo continua válido', () => {
  const c = criar(PESSOAL_INICIAL, '/ola', 'Saudação', 'oi');
  const sem = aplicar(c, { tipo: 'excluir', triggerOriginal: '/ola' });
  assert.deepEqual(conferirLegivel(sem).lido.matches, []);
  assert.ok(sem.includes('# Meus atalhos pessoais (TextCDSP)'));
  // e dá para criar de novo em cima
  assert.equal(conferirLegivel(criar(sem, '/volta', 'Volta', 'voltei')).lido.matches[0].trigger, '/volta');
});

test('excluir um atalho que não existe lança nao-encontrado', () => {
  assert.equal(erroDe(() => aplicar(ARQUIVO_A_MAO, { tipo: 'excluir', triggerOriginal: '/nada' })).codigo, 'nao-encontrado');
  assert.equal(erroDe(() => aplicar(PESSOAL_INICIAL, { tipo: 'excluir', triggerOriginal: '/nada' })).codigo, 'nao-encontrado');
});

// ---------------------------------------------------------------------------
// preservação do que foi escrito à mão
// ---------------------------------------------------------------------------

test('preserva comentários e o match escrito à mão (com variável) ao criar, editar e excluir', () => {
  const verificarMao = (conteudo) => {
    assert.ok(conteudo.startsWith('# Meus atalhos\nmatches:\n'), 'comentário de cabeçalho');
    assert.ok(conteudo.includes('  # minha data (escrita à mão)\n'), 'comentário do match');
    assert.ok(conteudo.includes('    replace: "Cuiabá-MT, {{d}}." # comentário na mesma linha\n'), 'comentário na mesma linha');
    assert.ok(conteudo.includes('    vars:\n      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n'), 'variável');
    const dh = lerPessoais(conteudo).matches.find((m) => m.trigger === '/dh');
    assert.equal(dh.editavel, false);
    const v = validarBiblioteca([{ nome: 'pessoal.yml', conteudo }]);
    const snippet = v.snippets.find((s) => s.trigger === '/dh');
    assert.equal(snippet.tipo, 'data');
    assert.deepEqual(snippet.datas, [{ nome: 'd', formato: '%d/%m/%Y', offset: 0 }]);
  };

  verificarMao(ARQUIVO_A_MAO);
  const criado = criar(ARQUIVO_A_MAO, '/ola', 'Saudação', 'oi');
  verificarMao(criado);
  const editado = aplicar(criado, { tipo: 'editar', triggerOriginal: '/ola', trigger: '/saudacao', label: 'S', texto: 'a\nb' });
  verificarMao(editado);
  const excluido = aplicar(editado, { tipo: 'excluir', triggerOriginal: '/saudacao' });
  verificarMao(excluido);
  assert.deepEqual(lerPessoais(excluido).matches.map((m) => m.trigger), ['/dh']);
});

test('preserva um comentário solto entre dois matches', () => {
  const base = 'matches:\n  - trigger: "/a1"\n    label: "A"\n    replace: "a"\n\n  # separador importante\n  - trigger: "/b1"\n    label: "B"\n    replace: "b"\n';
  const novo = criar(base, '/c1', 'C', 'c');
  assert.ok(novo.includes('  # separador importante\n'));
  assert.deepEqual(lerPessoais(novo).matches.map((m) => m.trigger), ['/a1', '/b1', '/c1']);
});

test('editar e excluir não tocam nos outros matches', () => {
  const c = criar(criar(ARQUIVO_A_MAO, '/ola', 'A', 'a'), '/tchau', 'B', 'b');
  const editado = aplicar(c, { tipo: 'editar', triggerOriginal: '/ola', trigger: '/ola', label: 'A2', texto: 'a2' });
  const bloco = (texto, trigger) => texto.slice(texto.indexOf(`- trigger: "${trigger}"`));
  assert.equal(bloco(editado, '/tchau'), bloco(c, '/tchau'));
});

// ---------------------------------------------------------------------------
// o que a janela não pode mexer
// ---------------------------------------------------------------------------

test('atalho escrito à mão (com variáveis ou chaves extras) não é editável nem excluível', () => {
  const comExtra = 'matches:\n  - trigger: "/p1"\n    label: "P"\n    replace: "p"\n    propagate_case: true\n';
  for (const arquivo of [ARQUIVO_A_MAO, comExtra]) {
    const trigger = arquivo === ARQUIVO_A_MAO ? '/dh' : '/p1';
    assert.equal(erroDe(() => aplicar(arquivo, { tipo: 'editar', triggerOriginal: trigger, trigger, label: 'x', texto: 'y' })).codigo, 'nao-editavel');
    assert.equal(erroDe(() => aplicar(arquivo, { tipo: 'excluir', triggerOriginal: trigger })).codigo, 'nao-editavel');
    assert.equal(lerPessoais(arquivo).matches[0].editavel, false);
  }
});

test('match com html ou markdown em vez de replace também não é editável', () => {
  const html = 'matches:\n  - trigger: "/h1"\n    label: "H"\n    html: "<b>x</b>"\n';
  assert.equal(lerPessoais(html).matches[0].editavel, false);
  assert.equal(erroDe(() => aplicar(html, { tipo: 'excluir', triggerOriginal: '/h1' })).codigo, 'nao-editavel');
});

// ---------------------------------------------------------------------------
// arquivo inválido
// ---------------------------------------------------------------------------

test('YAML inválido: não altera, lança yaml-invalido com a linha do erro', () => {
  const quebrado = '# c\nmatches:\n  - trigger: "/a1"\n   label: "x"\n    replace: [\n';
  for (const operacao of [
    { tipo: 'criar', trigger: '/ola', label: 'x', texto: 'y' },
    { tipo: 'editar', triggerOriginal: '/a1', trigger: '/a1', label: 'x', texto: 'y' },
    { tipo: 'excluir', triggerOriginal: '/a1' },
  ]) {
    const erro = erroDe(() => aplicar(quebrado, operacao));
    assert.equal(erro.codigo, 'yaml-invalido');
    assert.equal(typeof erro.linha, 'number');
    assert.match(erro.message, /Seu arquivo de atalhos pessoais tem um erro na linha \d+/);
  }
});

test('lerPessoais: YAML inválido devolve valido=false com a linha', () => {
  const lido = lerPessoais('matches:\n  - trigger: "/a1\n');
  assert.equal(lido.valido, false);
  assert.equal(typeof lido.erro.linha, 'number');
  assert.match(lido.erro.mensagem, /erro na linha/);
  assert.deepEqual(lido.matches, []);
});

test('estrutura inesperada: matches que não é lista, raiz que não é mapa', () => {
  assert.equal(erroDe(() => criar('matches: "texto"\n', '/ola', 'x', 'y')).codigo, 'estrutura');
  assert.equal(erroDe(() => criar('- a\n- b\n', '/ola', 'x', 'y')).codigo, 'estrutura');
  assert.equal(erroDe(() => criar('so texto\n', '/ola', 'x', 'y')).codigo, 'estrutura');
});

test('operação desconhecida', () => {
  assert.throws(() => aplicar('', { tipo: 'apagar-tudo' }), /Operação desconhecida/);
});

test('não altera o texto recebido (strings são imutáveis, mas o resultado é novo)', () => {
  const entrada = ARQUIVO_A_MAO;
  const saida = criar(entrada, '/ola', 'x', 'y');
  assert.notEqual(saida, entrada);
  assert.equal(entrada, ARQUIVO_A_MAO);
});

// ---------------------------------------------------------------------------
// lerPessoais
// ---------------------------------------------------------------------------

test('lerPessoais: arquivo só com comentários é válido e não tem atalhos', () => {
  assert.deepEqual(lerPessoais(PESSOAL_INICIAL), { valido: true, erro: null, matches: [] });
  assert.deepEqual(lerPessoais(''), { valido: true, erro: null, matches: [] });
  assert.deepEqual(lerPessoais(null), { valido: true, erro: null, matches: [] });
});

test('lerPessoais: marca editáveis e traz o texto e a linha', () => {
  const c = criar(ARQUIVO_A_MAO, '/ola', 'Saudação', 'oi\ntchau');
  const { matches } = lerPessoais(c);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].trigger, '/dh');
  assert.equal(matches[0].editavel, false);
  assert.equal(matches[0].texto, null);
  assert.equal(matches[1].trigger, '/ola');
  assert.equal(matches[1].editavel, true);
  assert.equal(matches[1].texto, 'oi\ntchau');
  assert.ok(matches[1].linha > matches[0].linha);
});

// ---------------------------------------------------------------------------
// formulário
// ---------------------------------------------------------------------------

test('normalizarTrigger: minúsculas, sem espaços nas pontas e com a barra inicial', () => {
  assert.equal(normalizarTrigger('ola'), '/ola');
  assert.equal(normalizarTrigger('/OLA'), '/ola');
  assert.equal(normalizarTrigger('  /Ola  '), '/ola');
  assert.equal(normalizarTrigger('OLA'), '/ola');
  assert.equal(normalizarTrigger(''), '');
  assert.equal(normalizarTrigger('   '), '');
  assert.equal(normalizarTrigger(null), '');
});

test('validarCamposPessoais: campos válidos', () => {
  const { valor, erros } = validarCamposPessoais({ trigger: 'Ola', label: '  Saudação  ', texto: 'Olá\r\nmundo' });
  assert.deepEqual(erros, {});
  assert.deepEqual(valor, { trigger: '/ola', label: 'Saudação', texto: 'Olá\nmundo' });
});

test('validarCamposPessoais: atalho fora do padrão', () => {
  for (const ruim of ['/a', '/ação', '/com espaço', '/com-hifen', `/${'a'.repeat(31)}`, '//ola', '/ola!']) {
    const { erros } = validarCamposPessoais({ trigger: ruim, label: 'x', texto: 'y' });
    assert.ok(erros.trigger, ruim);
    assert.equal(erros.label, undefined);
    assert.equal(erros.texto, undefined);
  }
  assert.match(validarCamposPessoais({ trigger: '', label: 'x', texto: 'y' }).erros.trigger, /Informe o atalho/);
});

test('validarCamposPessoais: nome e texto não podem ser vazios', () => {
  const { erros } = validarCamposPessoais({ trigger: '/ola', label: '   ', texto: '  \n ' });
  assert.ok(erros.label);
  assert.ok(erros.texto);
  assert.equal(erros.trigger, undefined);
  assert.deepEqual(Object.keys(validarCamposPessoais({}).erros).sort(), ['label', 'texto', 'trigger']);
});

test('validarCamposPessoais: "{{" e "}}" no texto são recusados', () => {
  for (const ruim of ['olá {{nome}}', 'abre {{ só', 'fecha }} só', '{{']) {
    assert.match(validarCamposPessoais({ trigger: '/ola', label: 'x', texto: ruim }).erros.texto, /\{\{/, ruim);
  }
  assert.deepEqual(validarCamposPessoais({ trigger: '/ola', label: 'x', texto: 'chaves { simples } passam' }).erros, {});
});

// ---------------------------------------------------------------------------
// conflitos (mensagens para o formulário)
// ---------------------------------------------------------------------------

const oficial = (...triggers) => ({
  nome: 'medicamentos.yml',
  conteudo: `matches:\n${triggers.map((t) => `  - trigger: "${t}"\n    label: "L"\n    replace: "x"\n`).join('')}`,
});

function simular(oficiais, pessoalConteudo) {
  return validarBiblioteca([...oficiais, { nome: 'pessoal.yml', conteudo: pessoalConteudo }]);
}

test('conflito: o mesmo atalho de um oficial é citado como "oficial"', () => {
  const r = simular([oficial('/cont')], criar('', '/cont', 'Meu', 'x'));
  const m = conflitosDoAtalho(r.erros, '/cont');
  assert.equal(m.length, 1);
  assert.match(m[0], /Já existe o atalho oficial \/cont/);
});

test('conflito: /contestacao pessoal com /cont oficial cita o /cont', () => {
  const r = simular([oficial('/cont')], criar('', '/contestacao', 'Meu', 'x'));
  const m = conflitosDoAtalho(r.erros, '/contestacao');
  assert.equal(m.length, 1);
  assert.match(m[0], /atalho oficial \/cont\b/);
  assert.match(m[0], /começo de \/contestacao/);
});

test('conflito: pessoal que é o começo de um oficial', () => {
  const r = simular([oficial('/contestacao')], criar('', '/cont', 'Meu', 'x'));
  const m = conflitosDoAtalho(r.erros, '/cont');
  assert.equal(m.length, 1);
  assert.match(m[0], /atalho oficial \/contestacao/);
  assert.match(m[0], /começa com \/cont/);
});

test('conflito entre dois atalhos pessoais é citado como "pessoal"', () => {
  const r = simular([], criar(criar('', '/ola', 'A', 'a'), '/olamundo', 'B', 'b'));
  const m = conflitosDoAtalho(r.erros, '/olamundo');
  assert.equal(m.length, 1);
  assert.match(m[0], /atalho pessoal \/ola/);
});

test('conflitos que não envolvem o atalho informado são ignorados', () => {
  const r = simular([oficial('/cont', '/contestacao')], criar('', '/ola', 'A', 'a'));
  assert.ok(r.erros.some((e) => e.regra === 'trigger-prefixo')); // o conflito entre oficiais existe...
  assert.deepEqual(conflitosDoAtalho(r.erros, '/ola'), []); // ...mas não é do /ola
});

test('sem conflito: lista vazia', () => {
  assert.deepEqual(conflitosDoAtalho(simular([oficial('/cont')], criar('', '/ola', 'A', 'a')).erros, '/ola'), []);
});
