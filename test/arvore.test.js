'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { montarArvore, linhasVisiveis, chavesDosAncestrais, chaveDe, caminhoDoSnippet } = require('../src/shared/arvore');
const { validarBiblioteca } = require('../src/shared/validador');

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

let contador = 0;
// Um snippet como a Biblioteca entrega à janela (só os campos que a árvore usa).
const oficial = (trigger, arquivo) => {
  const categoria = arquivo.replace(/\.yml$/, '');
  const i = arquivo.lastIndexOf('/');
  contador += 1;
  return { id: `${arquivo}::${trigger}::${contador}`, trigger, origem: 'oficial', arquivo, pasta: i === -1 ? '' : arquivo.slice(0, i), categoria };
};
const pessoal = (trigger) => {
  contador += 1;
  return { id: `pessoal.yml::${trigger}::${contador}`, trigger, origem: 'pessoal', arquivo: 'pessoal.yml', pasta: '', categoria: 'Pessoal' };
};

// Forma resumida de uma árvore, para comparar: "tipo nome (total)" com os filhos recuados.
function resumo(nos, nivel = 0) {
  return nos.flatMap((no) => {
    const linha = `${'  '.repeat(nivel)}${no.tipo} ${no.nome}${no.tipo === 'snippet' ? '' : ` (${no.total})`}`;
    return [linha, ...resumo(no.filhos, nivel + 1)];
  });
}

const AMOSTRA = () => [
  oficial('/hoje', 'exemplos.yml'),
  oficial('/cont', 'Medicamentos/contestacao.yml'),
  oficial('/prelim', 'Medicamentos/contestacao.yml'),
  oficial('/agravo', 'Medicamentos/Recursos/agravo.yml'),
  oficial('/apel', 'Medicamentos/Recursos/apelacao.yml'),
  pessoal('/ola'),
];

// ---------------------------------------------------------------------------
// montarArvore
// ---------------------------------------------------------------------------

test('monta pastas, arquivos e snippets com os totais; Pessoal por último', () => {
  assert.deepEqual(resumo(montarArvore(AMOSTRA())), [
    'pasta Medicamentos (4)',
    '  pasta Recursos (2)',
    '    arquivo agravo (1)',
    '      snippet /agravo',
    '    arquivo apelacao (1)',
    '      snippet /apel',
    '  arquivo contestacao (2)',
    '    snippet /cont',
    '    snippet /prelim',
    'arquivo exemplos (1)',
    '  snippet /hoje',
    'pasta Pessoal (1)',
    '  snippet /ola',
  ]);
});

test('arquivos da raiz ficam no primeiro nível', () => {
  const nos = montarArvore([oficial('/hoje', 'exemplos.yml'), oficial('/cont', 'medicamentos.yml')]);
  assert.deepEqual(nos.map((n) => [n.tipo, n.nome, n.total]), [['arquivo', 'exemplos', 1], ['arquivo', 'medicamentos', 1]]);
});

test('cada nó tem tipo, nome, caminho, filhos e total', () => {
  const [pasta] = montarArvore([oficial('/agravo', 'Medicamentos/Recursos/agravo.yml')]);
  assert.deepEqual(Object.keys(pasta).sort(), ['caminho', 'filhos', 'nome', 'tipo', 'total']);
  assert.equal(pasta.caminho, 'Medicamentos');
  const recursos = pasta.filhos[0];
  assert.equal(recursos.caminho, 'Medicamentos/Recursos');
  const arquivo = recursos.filhos[0];
  assert.deepEqual([arquivo.tipo, arquivo.nome, arquivo.caminho], ['arquivo', 'agravo', 'Medicamentos/Recursos/agravo']);
  const snippet = arquivo.filhos[0];
  assert.deepEqual([snippet.tipo, snippet.nome, snippet.total], ['snippet', '/agravo', 1]);
  assert.equal(snippet.snippet.trigger, '/agravo');
});

test('ordem pt-BR, ignorando acento e maiúscula; pastas antes dos arquivos', () => {
  const nos = montarArvore([
    oficial('/a1', 'zebra.yml'),
    oficial('/b1', 'Ação/x.yml'),
    oficial('/c1', 'Banana/x.yml'),
    oficial('/d1', 'abacate.yml'),
    oficial('/e1', 'árvore/x.yml'),
    oficial('/f1', 'Casa.yml'),
  ]);
  assert.deepEqual(nos.map((n) => `${n.tipo}:${n.nome}`), ['pasta:Ação', 'pasta:árvore', 'pasta:Banana', 'arquivo:abacate', 'arquivo:Casa', 'arquivo:zebra']);
});

test('os snippets de um arquivo ficam em ordem de atalho', () => {
  const [arquivo] = montarArvore([oficial('/zeta', 'a.yml'), oficial('/alfa', 'a.yml'), oficial('/meio', 'a.yml')]);
  assert.deepEqual(arquivo.filhos.map((f) => f.nome), ['/alfa', '/meio', '/zeta']);
});

test('a pasta Pessoal vem sempre por último, mesmo com nomes que viriam depois', () => {
  const nos = montarArvore([pessoal('/ola'), oficial('/a1', 'Zzz/x.yml'), oficial('/b1', 'zzz.yml')]);
  assert.deepEqual(nos.map((n) => n.nome), ['Zzz', 'zzz', 'Pessoal']);
  assert.equal(nos[nos.length - 1].pessoal, true);
});

test('sem snippets pessoais, não há pasta Pessoal; sem nada, a árvore é vazia', () => {
  assert.deepEqual(montarArvore([oficial('/a1', 'a.yml')]).map((n) => n.nome), ['a']);
  assert.deepEqual(montarArvore([]), []);
  assert.deepEqual(montarArvore(undefined), []);
});

test('uma pasta oficial chamada "Pessoal" não se mistura com a pasta dos atalhos pessoais', () => {
  const nos = montarArvore([oficial('/a1', 'Pessoal/x.yml'), pessoal('/ola')]);
  assert.equal(nos.length, 2);
  assert.notEqual(chaveDe(nos[0]), chaveDe(nos[1]));
  assert.deepEqual([nos[0].nome, nos[0].total, Boolean(nos[0].pessoal)], ['Pessoal', 1, false]);
  assert.deepEqual([nos[1].nome, nos[1].total, nos[1].pessoal], ['Pessoal', 1, true]);
});

test('pasta e arquivo com o mesmo nome têm chaves diferentes', () => {
  const nos = montarArvore([oficial('/a1', 'Medicamentos.yml'), oficial('/b1', 'Medicamentos/x.yml')]);
  const [pasta, arquivo] = nos;
  assert.deepEqual([pasta.tipo, arquivo.tipo], ['pasta', 'arquivo']);
  assert.notEqual(chaveDe(pasta), chaveDe(arquivo));
});

test('funciona com a saída real do validador (pasta e categoria com caminho)', () => {
  const m = (t) => `  - trigger: "${t}"\n    label: "x"\n    replace: "y"\n`;
  const r = validarBiblioteca([
    { nome: 'exemplos.yml', conteudo: `matches:\n${m('/hoje')}` },
    { nome: 'Medicamentos/contestacao.yml', conteudo: `matches:\n${m('/cont')}` },
    { nome: 'Medicamentos/Recursos/agravo.yml', conteudo: `matches:\n${m('/agravo')}` },
  ]);
  const snippets = r.snippets.map((s, i) => ({ ...s, id: `${s.arquivo}::${i}`, origem: 'oficial' }));
  assert.deepEqual(resumo(montarArvore(snippets)), [
    'pasta Medicamentos (2)',
    '  pasta Recursos (1)',
    '    arquivo agravo (1)',
    '      snippet /agravo',
    '  arquivo contestacao (1)',
    '    snippet /cont',
    'arquivo exemplos (1)',
    '  snippet /hoje',
  ]);
});

// ---------------------------------------------------------------------------
// caminhoDoSnippet
// ---------------------------------------------------------------------------

test('caminhoDoSnippet: "Medicamentos › contestacao"; pessoal é só "Pessoal"', () => {
  assert.equal(caminhoDoSnippet(oficial('/cont', 'Medicamentos/contestacao.yml')), 'Medicamentos › contestacao');
  assert.equal(caminhoDoSnippet(oficial('/agr', 'Medicamentos/Recursos/agravo.yml')), 'Medicamentos › Recursos › agravo');
  assert.equal(caminhoDoSnippet(oficial('/hoje', 'exemplos.yml')), 'exemplos');
  assert.equal(caminhoDoSnippet(pessoal('/ola')), 'Pessoal');
});

// ---------------------------------------------------------------------------
// linhasVisiveis
// ---------------------------------------------------------------------------

const descrever = (linhas) => linhas.map((l) => `${'  '.repeat(l.nivel)}${l.no.tipo}:${l.no.nome}${l.aberto === null ? '' : l.aberto ? ' [-]' : ' [+]'}`);

test('tudo fechado: só o primeiro nível aparece', () => {
  const linhas = linhasVisiveis(montarArvore(AMOSTRA()), () => false);
  assert.deepEqual(descrever(linhas), ['pasta:Medicamentos [+]', 'arquivo:exemplos [+]', 'pasta:Pessoal [+]']);
});

test('abrir uma pasta mostra os filhos dela; os netos continuam escondidos', () => {
  const nos = montarArvore(AMOSTRA());
  const abertos = new Set([chaveDe(nos[0])]); // Medicamentos
  assert.deepEqual(descrever(linhasVisiveis(nos, (c) => abertos.has(c))), [
    'pasta:Medicamentos [-]',
    '  pasta:Recursos [+]',
    '  arquivo:contestacao [+]',
    'arquivo:exemplos [+]',
    'pasta:Pessoal [+]',
  ]);
});

test('tudo aberto: cada linha traz nível, chave e a chave do pai', () => {
  const nos = montarArvore(AMOSTRA());
  const linhas = linhasVisiveis(nos, () => true);
  assert.equal(linhas.length, 13);
  const cont = linhas.find((l) => l.no.nome === '/cont');
  assert.equal(cont.nivel, 2);
  assert.equal(cont.paiChave, 'arquivo:Medicamentos/contestacao');
  assert.equal(cont.aberto, null);
  const medicamentos = linhas[0];
  assert.deepEqual([medicamentos.nivel, medicamentos.paiChave, medicamentos.chave], [0, null, 'pasta:Medicamentos']);
  assert.equal(new Set(linhas.map((l) => l.chave)).size, linhas.length); // chaves únicas
});

test('chavesDosAncestrais: as pastas e o arquivo que contêm o snippet, de fora para dentro', () => {
  const lista = AMOSTRA();
  const nos = montarArvore(lista);
  const agravo = lista.find((s) => s.trigger === '/agravo');
  assert.deepEqual(chavesDosAncestrais(nos, agravo.id), ['pasta:Medicamentos', 'pasta:Medicamentos/Recursos', 'arquivo:Medicamentos/Recursos/agravo']);
  const ola = lista.find((s) => s.trigger === '/ola');
  assert.deepEqual(chavesDosAncestrais(nos, ola.id), ['pasta::pessoal']);
  assert.deepEqual(chavesDosAncestrais(nos, 'nao-existe'), []);
});

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

test('no navegador (sem module), o arquivo publica window.CDSPArvore', () => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'shared', 'arvore.js'), 'utf8');
  const janela = {};
  vm.runInNewContext(codigo, { self: janela });
  assert.equal(typeof janela.CDSPArvore.montarArvore, 'function');
  assert.equal(typeof janela.CDSPArvore.linhasVisiveis, 'function');
  assert.equal(janela.CDSPArvore.NOME_PESSOAL, 'Pessoal');
});
