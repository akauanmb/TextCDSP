'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PADROES, ler, gravar, validarEntrada, normalizarPosicao } = require('../src/main/config');

function pastaTemporaria(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-config-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return pasta;
}

const logFalso = () => {
  const avisos = [];
  return { avisos, aviso: (mensagem) => avisos.push(mensagem) };
};

test('os padrões são os definidos para o aplicativo', () => {
  assert.deepEqual({ ...PADROES }, {
    fonteSnippets: '',
    intervaloSyncMin: 15,
    iniciarComWindows: true,
    modoAdmin: false,
    versaoAvisada: '',
    minimizarParaIcone: true,
    posicaoIcone: null,
  });
});

// Marco 11: minimizarParaIcone e posicaoIcone

test('minimizarParaIcone: padrão true; a janela de configurações pode ligar e desligar; só aceita booleano', () => {
  assert.equal(PADROES.minimizarParaIcone, true);
  assert.deepEqual(validarEntrada({ minimizarParaIcone: false }), { valor: { minimizarParaIcone: false }, erros: [] });
  assert.deepEqual(validarEntrada({ minimizarParaIcone: true }), { valor: { minimizarParaIcone: true }, erros: [] });
  for (const ruim of ['false', 0, 1, null, 'sim']) {
    const { valor, erros } = validarEntrada({ minimizarParaIcone: ruim });
    assert.deepEqual(valor, {}, String(ruim));
    assert.equal(erros.length, 1, String(ruim));
  }
});

test('posicaoIcone: só o aplicativo grava; a janela de configurações não consegue alterá-la', () => {
  assert.deepEqual(validarEntrada({ posicaoIcone: { x: 1, y: 2 } }), { valor: {}, erros: [] });
});

test('normalizarPosicao: só { x, y } com inteiros; o resto vira null', () => {
  assert.deepEqual(normalizarPosicao({ x: 10, y: -20 }), { x: 10, y: -20 });
  assert.deepEqual(normalizarPosicao({ x: 10, y: 20, extra: 1 }), { x: 10, y: 20 });
  for (const ruim of [null, undefined, 'x', 5, [], [1, 2], {}, { x: 1 }, { x: 1.5, y: 2 }, { x: '1', y: 2 }, { x: NaN, y: 1 }, { x: Infinity, y: 1 }]) {
    assert.equal(normalizarPosicao(ruim), null, JSON.stringify(ruim));
  }
});

test('ler: posição e opção do ícone são gravadas e lidas de volta, e valores inválidos viram o padrão', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  gravar(arquivo, { minimizarParaIcone: false, posicaoIcone: { x: 100, y: 200 } });
  const lida = ler(arquivo);
  assert.equal(lida.minimizarParaIcone, false);
  assert.deepEqual(lida.posicaoIcone, { x: 100, y: 200 });

  fs.writeFileSync(arquivo, JSON.stringify({ minimizarParaIcone: 'talvez', posicaoIcone: { x: 'a', y: 2 } }));
  const ruim = ler(arquivo);
  assert.equal(ruim.minimizarParaIcone, true); // padrão
  assert.equal(ruim.posicaoIcone, null);

  fs.writeFileSync(arquivo, JSON.stringify({ iniciarComWindows: false }));
  assert.equal(ler(arquivo).minimizarParaIcone, true); // chave ausente: padrão
});

test('gravar: valores inválidos das chaves novas não chegam ao arquivo', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  gravar(arquivo, { minimizarParaIcone: 'x', posicaoIcone: { x: 1.5, y: 2 } });
  const crua = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  assert.equal(crua.minimizarParaIcone, true);
  assert.equal(crua.posicaoIcone, null);
});

test('guardar a posição do ícone não apaga as outras configurações, e salvar as configurações não apaga a posição', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  gravar(arquivo, { fonteSnippets: 'G:\\CDSP', intervaloSyncMin: 30 });
  gravar(arquivo, { ...ler(arquivo), posicaoIcone: { x: 5, y: 6 } });
  assert.equal(ler(arquivo).fonteSnippets, 'G:\\CDSP');
  gravar(arquivo, { ...ler(arquivo), intervaloSyncMin: 60 });
  assert.deepEqual(ler(arquivo).posicaoIcone, { x: 5, y: 6 });
});

test('versaoAvisada só o aplicativo grava: a janela de configurações não consegue alterá-la', (t) => {
  assert.deepEqual(validarEntrada({ versaoAvisada: '9.9.9' }), { valor: {}, erros: [] });
  // Mas ela sobrevive a uma gravação normal das configurações.
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  gravar(arquivo, { versaoAvisada: '0.1.1' });
  gravar(arquivo, { ...ler(arquivo), intervaloSyncMin: 30 });
  assert.equal(ler(arquivo).versaoAvisada, '0.1.1');
});

test('ler: arquivo inexistente devolve os padrões, sem aviso', (t) => {
  const log = logFalso();
  const cfg = ler(path.join(pastaTemporaria(t), 'config.json'), log);
  assert.deepEqual(cfg, { ...PADROES });
  assert.deepEqual(log.avisos, []);
});

test('ler: mescla o arquivo parcial com os padrões (chaves novas aparecem sozinhas)', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  fs.writeFileSync(arquivo, JSON.stringify({ fonteSnippets: 'G:\\CDSP', intervaloSyncMin: 30 }));
  const cfg = ler(arquivo);
  assert.equal(cfg.fonteSnippets, 'G:\\CDSP');
  assert.equal(cfg.intervaloSyncMin, 30);
  assert.equal(cfg.iniciarComWindows, true); // veio do padrão
  assert.equal(cfg.modoAdmin, false); // veio do padrão
});

test('ler: valores do arquivo vencem os padrões, inclusive false', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  fs.writeFileSync(arquivo, JSON.stringify({ iniciarComWindows: false, modoAdmin: true }));
  const cfg = ler(arquivo);
  assert.equal(cfg.iniciarComWindows, false);
  assert.equal(cfg.modoAdmin, true);
});

test('ler: chaves desconhecidas do arquivo são mantidas', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  fs.writeFileSync(arquivo, JSON.stringify({ chaveFutura: 'x' }));
  assert.equal(ler(arquivo).chaveFutura, 'x');
});

test('ler: tolera BOM no início do arquivo', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  fs.writeFileSync(arquivo, `\uFEFF${JSON.stringify({ intervaloSyncMin: 45 })}`);
  assert.equal(ler(arquivo).intervaloSyncMin, 45);
});

test('ler: JSON inválido devolve os padrões e registra um aviso', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  fs.writeFileSync(arquivo, '{ isto não é json');
  const log = logFalso();
  assert.deepEqual(ler(arquivo, log), { ...PADROES });
  assert.equal(log.avisos.length, 1);
  assert.match(log.avisos[0], /inválido/);
});

test('ler: JSON que não é um objeto (lista, número, null) devolve os padrões', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  for (const conteudo of ['[1, 2]', '42', 'null', '"texto"']) {
    fs.writeFileSync(arquivo, conteudo);
    const log = logFalso();
    assert.deepEqual(ler(arquivo, log), { ...PADROES }, conteudo);
    assert.equal(log.avisos.length, 1, conteudo);
  }
});

test('ler: devolve uma cópia; alterá-la não muda os padrões', (t) => {
  const cfg = ler(path.join(pastaTemporaria(t), 'config.json'));
  cfg.intervaloSyncMin = 99;
  assert.equal(PADROES.intervaloSyncMin, 15);
  assert.equal(ler(path.join(pastaTemporaria(t), 'outro.json')).intervaloSyncMin, 15);
});

test('gravar: cria o arquivo (e a pasta) e o conteúdo volta igual ao ler', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'dados', 'config.json');
  const gravada = gravar(arquivo, { fonteSnippets: 'Z:\\snippets', intervaloSyncMin: 60 });
  assert.equal(gravada.fonteSnippets, 'Z:\\snippets');
  assert.deepEqual(ler(arquivo), gravada);
  assert.equal(gravada.iniciarComWindows, true); // o que não foi informado entra com o padrão
});

test('gravar: sobrescreve o arquivo existente e não deixa o .tmp para trás', (t) => {
  const pasta = pastaTemporaria(t);
  const arquivo = path.join(pasta, 'config.json');
  gravar(arquivo, { intervaloSyncMin: 10 });
  gravar(arquivo, { intervaloSyncMin: 20 });
  assert.equal(ler(arquivo).intervaloSyncMin, 20);
  assert.deepEqual(fs.readdirSync(pasta), ['config.json']);
});

test('gravar: o arquivo gravado é um JSON válido terminado em quebra de linha', (t) => {
  const arquivo = path.join(pastaTemporaria(t), 'config.json');
  gravar(arquivo, {});
  const texto = fs.readFileSync(arquivo, 'utf8');
  assert.ok(texto.endsWith('\n'));
  assert.deepEqual(JSON.parse(texto), { ...PADROES });
});

test('gravar: um .tmp antigo, deixado por uma queda, não atrapalha', (t) => {
  const pasta = pastaTemporaria(t);
  const arquivo = path.join(pasta, 'config.json');
  fs.writeFileSync(`${arquivo}.tmp`, 'resto de uma gravação interrompida');
  gravar(arquivo, { intervaloSyncMin: 25 });
  assert.equal(ler(arquivo).intervaloSyncMin, 25);
  assert.deepEqual(fs.readdirSync(pasta), ['config.json']);
});

test('gravar: se a gravação falhar, o arquivo anterior continua intacto', (t) => {
  const pasta = pastaTemporaria(t);
  const arquivo = path.join(pasta, 'config.json');
  gravar(arquivo, { intervaloSyncMin: 10 });
  const antes = fs.readFileSync(arquivo, 'utf8');
  // Uma pasta no lugar do .tmp impede a escrita antes de qualquer troca.
  fs.mkdirSync(`${arquivo}.tmp`);
  assert.throws(() => gravar(arquivo, { intervaloSyncMin: 99 }));
  assert.equal(fs.readFileSync(arquivo, 'utf8'), antes);
  assert.equal(ler(arquivo).intervaloSyncMin, 10);
});

// ---------------------------------------------------------------------------
// validarEntrada (o que vem da janela de configurações)
// ---------------------------------------------------------------------------

test('validarEntrada: aceita valores válidos e normaliza', () => {
  const { valor, erros } = validarEntrada({ fonteSnippets: '  G:\CDSP\snippets  ', intervaloSyncMin: '30', iniciarComWindows: false, modoAdmin: true });
  assert.deepEqual(erros, []);
  assert.deepEqual(valor, { fonteSnippets: 'G:\CDSP\snippets', intervaloSyncMin: 30, iniciarComWindows: false, modoAdmin: true });
});

test('validarEntrada: intervalo só de 5 a 120 minutos, inteiro', () => {
  for (const bom of [5, 15, 120, '5', '120']) {
    assert.deepEqual(validarEntrada({ intervaloSyncMin: bom }).erros, [], String(bom));
  }
  for (const ruim of [4, 121, 0, -5, 7.5, 'abc', '', null, NaN, '4']) {
    const { erros } = validarEntrada({ intervaloSyncMin: ruim });
    assert.equal(erros.length, 1, String(ruim));
    assert.match(erros[0], /5 a 120/);
  }
});

test('validarEntrada: tipos errados nas outras chaves', () => {
  assert.equal(validarEntrada({ fonteSnippets: 5 }).erros.length, 1);
  assert.equal(validarEntrada({ iniciarComWindows: 'sim' }).erros.length, 1);
  assert.equal(validarEntrada({ modoAdmin: 1 }).erros.length, 1);
});

test('validarEntrada: só devolve as chaves que vieram e ignora as desconhecidas', () => {
  const { valor, erros } = validarEntrada({ intervaloSyncMin: 10, chaveEstranha: 'x' });
  assert.deepEqual(erros, []);
  assert.deepEqual(valor, { intervaloSyncMin: 10 });
});

test('validarEntrada: entrada que não é um objeto', () => {
  for (const ruim of [null, undefined, 'texto', 42, [1]]) {
    assert.equal(validarEntrada(ruim).erros.length, 1);
  }
});
