'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PADROES, ler, gravar, validarEntrada } = require('../src/main/config');

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
  assert.deepEqual({ ...PADROES }, { fonteSnippets: '', intervaloSyncMin: 15, iniciarComWindows: true, modoAdmin: false });
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
