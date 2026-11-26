'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarCaminhos } = require('../src/main/caminhos');
const { PESSOAL_INICIAL } = require('../src/main/motor');
const { carregarBiblioteca, prepararCopia, salvarPessoal, excluirPessoal } = require('../src/main/biblioteca');
const { lerPessoais } = require('../src/shared/pessoais');

const raiz = path.resolve(__dirname, '..');
const hoje = new Date(2026, 10, 26, 9, 5);

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

const bloco = (trigger, label = 'Rótulo', texto = 'texto') => `  - trigger: "${trigger}"\n    label: "${label}"\n    replace: "${texto}"\n`;
const yml = (...blocos) => `matches:\n${blocos.join('')}`;

// Dados do app em pasta temporária, com um pessoal.yml inicial e arquivos oficiais.
function ambiente(t, { oficiais = {}, pessoal = PESSOAL_INICIAL } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-bib-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const caminhos = criarCaminhos({ empacotado: false, appPath: raiz, userData: path.join(base, 'dados') });
  fs.mkdirSync(caminhos.oficial, { recursive: true });
  for (const [nome, conteudo] of Object.entries(oficiais)) fs.writeFileSync(path.join(caminhos.oficial, nome), conteudo);
  if (pessoal !== null) fs.writeFileSync(caminhos.pessoalYml, pessoal);
  return { caminhos, lerPessoal: () => fs.readFileSync(caminhos.pessoalYml, 'utf8') };
}

const exemplos = () => fs.readFileSync(path.join(raiz, 'snippets', 'exemplos.yml'), 'utf8');
const entrada = (campos) => ({ operacao: 'criar', trigger: '/ola', label: 'Saudação', texto: 'Olá', ...campos });

// ---------------------------------------------------------------------------
// carregarBiblioteca
// ---------------------------------------------------------------------------

test('lista os oficiais e marca os pessoais como "Pessoal"', async (t) => {
  const a = ambiente(t, { oficiais: { 'medicamentos.yml': yml(bloco('/cont', 'Contestação')) }, pessoal: yml(bloco('/ola', 'Saudação', 'Olá')) });
  const r = await carregarBiblioteca(a.caminhos, { agora: hoje });
  assert.deepEqual(r.snippets.map((s) => [s.trigger, s.origem, s.categoria]), [
    ['/cont', 'oficial', 'medicamentos'],
    ['/ola', 'pessoal', 'Pessoal'],
  ]);
  assert.deepEqual(r.categorias, ['medicamentos', 'Pessoal']);
  assert.equal(r.erroPessoal, null);
});

test('um pessoal.yml só com comentários não gera snippets nem erro', async (t) => {
  const a = ambiente(t, { oficiais: { 'a.yml': yml(bloco('/cont')) } });
  const r = await carregarBiblioteca(a.caminhos);
  assert.deepEqual(r.snippets.map((s) => s.trigger), ['/cont']);
  assert.equal(r.erroPessoal, null);
});

test('sem pessoal.yml e sem pasta oficial: lista vazia', async (t) => {
  const a = ambiente(t, { pessoal: null });
  fs.rmSync(a.caminhos.oficial, { recursive: true });
  const r = await carregarBiblioteca(a.caminhos);
  assert.deepEqual(r.snippets, []);
  assert.deepEqual(r.categorias, ['Pessoal']);
});

test('os dados do snippet: tipo, campos, preview completo (datas resolvidas) e rodapé', async (t) => {
  const a = ambiente(t, { oficiais: { 'exemplos.yml': exemplos() } });
  const r = await carregarBiblioteca(a.caminhos, { agora: hoje, aplicadoEm: new Date(2026, 10, 25, 18, 30).toISOString() });
  const por = (trigger) => r.snippets.find((s) => s.trigger === trigger);
  assert.equal(por('/hoje').tipo, 'data');
  assert.equal(por('/hoje').previewCompleto, 'Cuiabá-MT, 26 de novembro de 2026.');
  assert.equal(por('/qualif').tipo, 'formulario');
  assert.deepEqual(por('/qualif').campos.map((c) => c.nome), ['nome', 'cnj', 'medicamento', 'obs']);
  assert.match(por('/fmt').previewCompleto, /^DOS PEDIDOS/);
  assert.equal(r.atualizadoEmTexto, '25/11 18:30');
  assert.equal(r.snippets.length, 6);
});

test('a lista vai em ordem alfabética de atalho e cada item tem um id único', async (t) => {
  const a = ambiente(t, { oficiais: { 'b.yml': yml(bloco('/zeta'), bloco('/alfa')), 'a.yml': yml(bloco('/meio')) } });
  const r = await carregarBiblioteca(a.caminhos);
  assert.deepEqual(r.snippets.map((s) => s.trigger), ['/alfa', '/meio', '/zeta']);
  assert.equal(new Set(r.snippets.map((s) => s.id)).size, 3);
});

test('atalhos duplicados aparecem os dois, com ids diferentes', async (t) => {
  const a = ambiente(t, { oficiais: { 'a.yml': yml(bloco('/cont')), 'b.yml': yml(bloco('/cont')) } });
  const r = await carregarBiblioteca(a.caminhos);
  assert.equal(r.snippets.length, 2);
  assert.notEqual(r.snippets[0].id, r.snippets[1].id);
});

test('pessoal editável traz o texto original; o escrito à mão não é editável', async (t) => {
  const aMao = 'matches:\n  - trigger: "/dh"\n    label: "Data"\n    replace: "{{d}}"\n    vars:\n      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n';
  const a = ambiente(t, { pessoal: aMao });
  assert.equal((await salvarPessoal(a.caminhos, entrada({ trigger: '/ola', texto: 'linha 1\nlinha 2' }))).ok, true);
  const r = await carregarBiblioteca(a.caminhos);
  const dh = r.snippets.find((s) => s.trigger === '/dh');
  const ola = r.snippets.find((s) => s.trigger === '/ola');
  assert.equal(dh.editavel, false);
  assert.equal(dh.textoOriginal, null);
  assert.equal(ola.editavel, true);
  assert.equal(ola.textoOriginal, 'linha 1\nlinha 2');
});

test('oficial nunca é editável', async (t) => {
  const a = ambiente(t, { oficiais: { 'a.yml': yml(bloco('/cont')) } });
  const r = await carregarBiblioteca(a.caminhos);
  assert.equal(r.snippets[0].editavel, false);
  assert.equal(r.snippets[0].textoOriginal, null);
});

test('pessoal.yml com erro: a lista dos oficiais continua e o erro vem com a linha', async (t) => {
  const a = ambiente(t, { oficiais: { 'a.yml': yml(bloco('/cont')) }, pessoal: '# c\nmatches:\n  - trigger: "/x\n' });
  const r = await carregarBiblioteca(a.caminhos);
  assert.deepEqual(r.snippets.map((s) => s.trigger), ['/cont']);
  assert.equal(typeof r.erroPessoal.linha, 'number');
  assert.match(r.erroPessoal.mensagem, /Seu arquivo de atalhos pessoais tem um erro na linha \d+/);
});

// ---------------------------------------------------------------------------
// salvarPessoal: criar
// ---------------------------------------------------------------------------

test('criar /ola com texto de 3 linhas e acentos: grava, a Biblioteca lista e o texto volta igual', async (t) => {
  const a = ambiente(t);
  const texto = 'Olá, tudo bem?\nAção: veja o ofício nº 1.\nAtenciosamente,';
  const r = await salvarPessoal(a.caminhos, entrada({ texto }));
  assert.deepEqual(r, { ok: true, trigger: '/ola' });
  assert.equal(lerPessoais(a.lerPessoal()).matches[0].texto, texto);
  const lista = await carregarBiblioteca(a.caminhos);
  assert.equal(lista.snippets[0].trigger, '/ola');
  assert.equal(lista.snippets[0].previewCompleto, texto);
});

test('criar normaliza o atalho (minúsculas e barra inicial)', async (t) => {
  const a = ambiente(t);
  assert.deepEqual(await salvarPessoal(a.caminhos, entrada({ trigger: 'Ola' })), { ok: true, trigger: '/ola' });
  assert.ok(lerPessoais(a.lerPessoal()).matches.some((m) => m.trigger === '/ola'));
});

test('criar guarda o conteúdo anterior em pessoal.yml.bak (só a última cópia) e não deixa .tmp', async (t) => {
  const a = ambiente(t);
  await salvarPessoal(a.caminhos, entrada({ trigger: '/um1', label: 'Um' }));
  assert.equal(fs.readFileSync(a.caminhos.pessoalBak, 'utf8'), PESSOAL_INICIAL);
  const depoisDoPrimeiro = a.lerPessoal();
  await salvarPessoal(a.caminhos, entrada({ trigger: '/dois', label: 'Dois' }));
  assert.equal(fs.readFileSync(a.caminhos.pessoalBak, 'utf8'), depoisDoPrimeiro); // só a última
  assert.deepEqual(fs.readdirSync(path.dirname(a.caminhos.pessoalYml)).filter((n) => n.startsWith('pessoal')).sort(), ['pessoal.yml', 'pessoal.yml.bak']);
});

test('criar sem pessoal.yml cria o arquivo', async (t) => {
  const a = ambiente(t, { pessoal: null });
  assert.equal((await salvarPessoal(a.caminhos, entrada())).ok, true);
  assert.equal(lerPessoais(a.lerPessoal()).matches[0].trigger, '/ola');
});

// ---------------------------------------------------------------------------
// salvarPessoal: bloqueios
// ---------------------------------------------------------------------------

test('/contestacao com /cont oficial: bloqueia, cita o /cont e não grava nada', async (t) => {
  const a = ambiente(t, { oficiais: { 'medicamentos.yml': yml(bloco('/cont')) } });
  const antes = a.lerPessoal();
  const r = await salvarPessoal(a.caminhos, entrada({ trigger: '/contestacao' }));
  assert.equal(r.ok, false);
  assert.match(r.erros.trigger, /atalho oficial \/cont\b/);
  assert.equal(a.lerPessoal(), antes);
  assert.equal(fs.existsSync(a.caminhos.pessoalBak), false);
});

test('mesmo atalho de um oficial: bloqueia ("já existe o atalho oficial")', async (t) => {
  const a = ambiente(t, { oficiais: { 'medicamentos.yml': yml(bloco('/cont')) } });
  const r = await salvarPessoal(a.caminhos, entrada({ trigger: '/cont' }));
  assert.equal(r.ok, false);
  assert.match(r.erros.trigger, /Já existe o atalho oficial \/cont/);
});

test('pessoal que é o começo de um oficial também bloqueia', async (t) => {
  const a = ambiente(t, { oficiais: { 'm.yml': yml(bloco('/contestacao')) } });
  const r = await salvarPessoal(a.caminhos, entrada({ trigger: '/cont' }));
  assert.equal(r.ok, false);
  assert.match(r.erros.trigger, /atalho oficial \/contestacao/);
});

test('conflito com outro atalho pessoal bloqueia, citando "pessoal"', async (t) => {
  const a = ambiente(t);
  await salvarPessoal(a.caminhos, entrada({ trigger: '/ola' }));
  const mesmo = await salvarPessoal(a.caminhos, entrada({ trigger: '/ola' }));
  assert.equal(mesmo.ok, false);
  assert.ok(mesmo.erros.trigger);
  const prefixo = await salvarPessoal(a.caminhos, entrada({ trigger: '/olamundo' }));
  assert.equal(prefixo.ok, false);
  assert.match(prefixo.erros.trigger, /atalho pessoal \/ola\b/);
});

test('campos inválidos: mensagem por campo e nada é gravado', async (t) => {
  const a = ambiente(t);
  const antes = a.lerPessoal();
  const r = await salvarPessoal(a.caminhos, { operacao: 'criar', trigger: 'a', label: '', texto: 'tem {{variavel}}' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.trigger);
  assert.ok(r.erros.label);
  assert.match(r.erros.texto, /\{\{/);
  assert.equal(a.lerPessoal(), antes);
});

test('pessoal.yml com erro de sintaxe: não grava e devolve a linha', async (t) => {
  const quebrado = '# c\nmatches:\n  - trigger: "/a1"\n   label: "x"\n    replace: [\n';
  const a = ambiente(t, { pessoal: quebrado });
  const r = await salvarPessoal(a.caminhos, entrada());
  assert.equal(r.ok, false);
  assert.equal(typeof r.arquivoInvalido.linha, 'number');
  assert.match(r.arquivoInvalido.mensagem, /Seu arquivo de atalhos pessoais tem um erro na linha \d+/);
  assert.equal(a.lerPessoal(), quebrado);
  assert.equal(fs.existsSync(a.caminhos.pessoalBak), false);
  const excluir = await excluirPessoal(a.caminhos, { trigger: '/a1' });
  assert.equal(excluir.ok, false);
  assert.ok(excluir.arquivoInvalido);
  assert.equal(a.lerPessoal(), quebrado);
});

test('pedidos malformados são recusados sem gravar', async (t) => {
  const a = ambiente(t);
  const antes = a.lerPessoal();
  for (const pedido of [null, undefined, {}, { operacao: 'apagar' }, { operacao: 'editar', trigger: '/a1', label: 'x', texto: 'y' }]) {
    assert.equal((await salvarPessoal(a.caminhos, pedido)).ok, false);
  }
  assert.equal((await excluirPessoal(a.caminhos, undefined)).ok, false);
  assert.equal((await excluirPessoal(a.caminhos, { trigger: 5 })).ok, false);
  assert.equal(a.lerPessoal(), antes);
});

// ---------------------------------------------------------------------------
// salvarPessoal: editar
// ---------------------------------------------------------------------------

test('editar /ola para /saudacao: o antigo some e o novo existe', async (t) => {
  const a = ambiente(t);
  await salvarPessoal(a.caminhos, entrada());
  const r = await salvarPessoal(a.caminhos, { operacao: 'editar', triggerOriginal: '/ola', trigger: '/saudacao', label: 'Saudação', texto: 'Olá' });
  assert.deepEqual(r, { ok: true, trigger: '/saudacao' });
  const triggers = lerPessoais(a.lerPessoal()).matches.map((m) => m.trigger);
  assert.deepEqual(triggers, ['/saudacao']);
});

test('editar trocando o atalho para um conflitante com oficial é bloqueado', async (t) => {
  const a = ambiente(t, { oficiais: { 'm.yml': yml(bloco('/cont')) } });
  await salvarPessoal(a.caminhos, entrada());
  const antes = a.lerPessoal();
  const r = await salvarPessoal(a.caminhos, { operacao: 'editar', triggerOriginal: '/ola', trigger: '/contestacao', label: 'x', texto: 'y' });
  assert.equal(r.ok, false);
  assert.match(r.erros.trigger, /oficial \/cont\b/);
  assert.equal(a.lerPessoal(), antes);
});

test('editar sem trocar o atalho não é bloqueado por um conflito que já existia', async (t) => {
  const a = ambiente(t);
  await salvarPessoal(a.caminhos, entrada({ trigger: '/ola' }));
  // Depois, a pasta oficial passa a ter um atalho que conflita com o /ola pessoal:
  fs.writeFileSync(path.join(a.caminhos.oficial, 'novo.yml'), yml(bloco('/olamundo')));
  const r = await salvarPessoal(a.caminhos, { operacao: 'editar', triggerOriginal: '/ola', trigger: '/ola', label: 'Novo nome', texto: 'Novo texto' });
  assert.equal(r.ok, true);
  assert.equal(lerPessoais(a.lerPessoal()).matches[0].label, 'Novo nome');
});

test('editar um atalho escrito à mão é recusado e o arquivo fica como estava', async (t) => {
  const aMao = 'matches:\n  - trigger: "/dh"\n    label: "Data"\n    replace: "{{d}}"\n    vars:\n      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n';
  const a = ambiente(t, { pessoal: aMao });
  const r = await salvarPessoal(a.caminhos, { operacao: 'editar', triggerOriginal: '/dh', trigger: '/dh', label: 'x', texto: 'y' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.geral);
  assert.equal(a.lerPessoal(), aMao);
  assert.equal((await excluirPessoal(a.caminhos, { trigger: '/dh' })).ok, false);
  assert.equal(a.lerPessoal(), aMao);
});

test('editar um atalho que não existe mais', async (t) => {
  const a = ambiente(t);
  const r = await salvarPessoal(a.caminhos, { operacao: 'editar', triggerOriginal: '/nada', trigger: '/nada', label: 'x', texto: 'y' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.geral);
});

// ---------------------------------------------------------------------------
// excluirPessoal e preservação do que foi escrito à mão
// ---------------------------------------------------------------------------

test('excluir /saudacao: some da lista e do arquivo', async (t) => {
  const a = ambiente(t);
  await salvarPessoal(a.caminhos, entrada({ trigger: '/saudacao' }));
  assert.deepEqual(await excluirPessoal(a.caminhos, { trigger: '/saudacao' }), { ok: true, trigger: '/saudacao' });
  const lista = await carregarBiblioteca(a.caminhos);
  assert.deepEqual(lista.snippets, []);
  assert.equal(lista.erroPessoal, null);
  assert.deepEqual(lerPessoais(a.lerPessoal()).matches, []);
});

test('match escrito à mão (com data) e seus comentários seguem no arquivo depois de criar outro pela janela', async (t) => {
  const aMao = '# meus atalhos\nmatches:\n  # data de hoje\n  - trigger: "/dh"\n    label: "Data de hoje"\n    replace: "{{d}}"\n    vars:\n      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n';
  const a = ambiente(t, { pessoal: aMao });
  assert.equal((await salvarPessoal(a.caminhos, entrada({ trigger: '/ola' }))).ok, true);
  const depois = a.lerPessoal();
  assert.ok(depois.startsWith('# meus atalhos\nmatches:\n  # data de hoje\n  - trigger: "/dh"'));
  assert.ok(depois.includes('        params:\n          format: "%d/%m/%Y"\n'));
  const lista = await carregarBiblioteca(a.caminhos, { agora: hoje });
  assert.equal(lista.snippets.find((s) => s.trigger === '/dh').previewCompleto, '26/11/2026');
  assert.ok(lista.snippets.find((s) => s.trigger === '/ola'));
});

test('várias gravações seguidas, disparadas ao mesmo tempo, não se perdem', async (t) => {
  const a = ambiente(t);
  const resultados = await Promise.all(['/um1', '/dois', '/tres', '/quatro'].map((trigger) => salvarPessoal(a.caminhos, entrada({ trigger, label: trigger }))));
  assert.ok(resultados.every((r) => r.ok));
  assert.deepEqual(lerPessoais(a.lerPessoal()).matches.map((m) => m.trigger).sort(), ['/dois', '/quatro', '/tres', '/um1']);
});

// ---------------------------------------------------------------------------
// prepararCopia
// ---------------------------------------------------------------------------

async function achar(a, trigger) {
  return (await carregarBiblioteca(a.caminhos, { agora: hoje })).snippets.find((s) => s.trigger === trigger);
}

test('copiar atalho: devolve o trigger', async (t) => {
  const a = ambiente(t, { oficiais: { 'exemplos.yml': exemplos() } });
  const s = await achar(a, '/qualif');
  assert.deepEqual(await prepararCopia(a.caminhos, { id: s.id, modo: 'atalho' }, hoje), { ok: true, texto: '/qualif', html: null });
});

test('copiar texto de /hoje: data resolvida para hoje', async (t) => {
  const a = ambiente(t, { oficiais: { 'exemplos.yml': exemplos() } });
  const s = await achar(a, '/hoje');
  assert.deepEqual(await prepararCopia(a.caminhos, { id: s.id, modo: 'texto' }, hoje), { ok: true, texto: 'Cuiabá-MT, 26 de novembro de 2026.', html: null });
});

test('copiar texto de /qualif: campos como [campo]', async (t) => {
  const a = ambiente(t, { oficiais: { 'exemplos.yml': exemplos() } });
  const s = await achar(a, '/qualif');
  const r = await prepararCopia(a.caminhos, { id: s.id, modo: 'texto' }, hoje);
  assert.match(r.texto, /^Processo n\. \[cnj\]\nParte autora: \[nome\]\nObjeto: fornecimento de \[medicamento\]\./);
  assert.equal(r.html, null);
});

test('copiar texto de /fmt: html com negrito e lista, mais o texto puro', async (t) => {
  const a = ambiente(t, { oficiais: { 'exemplos.yml': exemplos() } });
  const s = await achar(a, '/fmt');
  const r = await prepararCopia(a.caminhos, { id: s.id, modo: 'texto' }, hoje);
  assert.equal(r.ok, true);
  assert.match(r.html, /<b>DOS PEDIDOS<\/b>/);
  assert.match(r.html, /<ol>\s*<li>/);
  assert.match(r.html, /26 de novembro de 2026/);
  assert.ok(!r.texto.includes('<'));
  assert.match(r.texto, /^DOS PEDIDOS/);
});

test('copiar um pessoal de várias linhas mantém as quebras', async (t) => {
  const a = ambiente(t);
  await salvarPessoal(a.caminhos, entrada({ texto: 'l1\nl2\nl3' }));
  const s = await achar(a, '/ola');
  assert.equal((await prepararCopia(a.caminhos, { id: s.id, modo: 'texto' }, hoje)).texto, 'l1\nl2\nl3');
});

test('copiar: id que não existe mais e pedidos inválidos', async (t) => {
  const a = ambiente(t, { oficiais: { 'a.yml': yml(bloco('/cont')) } });
  assert.equal((await prepararCopia(a.caminhos, { id: 'x::nada::0', modo: 'texto' })).ok, false);
  for (const pedido of [null, {}, { id: 5, modo: 'texto' }, { id: 'a', modo: 'outro' }]) {
    assert.equal((await prepararCopia(a.caminhos, pedido)).ok, false);
  }
});
