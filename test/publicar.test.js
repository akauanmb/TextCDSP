'use strict';

// scripts/publicar.js: copia o instalador para <pasta-fonte>\_instalador\ e grava o versao.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { publicar, ErroPublicar } = require('../scripts/publicar');
const { lerVersaoJson } = require('../src/shared/versaoInstalador');

const sha = (conteudo) => crypto.createHash('sha256').update(conteudo).digest('hex');

// Um "projeto" falso (package.json e dist\) e uma pasta-fonte, ambos temporários.
function ambiente(t, { versao = '0.1.1', gerarExe = true, conteudoExe = 'instalador de mentira' } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-publicar-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const raiz = path.join(base, 'projeto');
  const pastaFonte = path.join(base, 'fonte');
  fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
  fs.mkdirSync(pastaFonte, { recursive: true });
  fs.writeFileSync(path.join(raiz, 'package.json'), JSON.stringify({ name: 'textcdsp', version: versao }));
  if (gerarExe) fs.writeFileSync(path.join(raiz, 'dist', `TextCDSP-Setup-${versao}.exe`), conteudoExe);
  return { base, raiz, pastaFonte, pastaInstalador: path.join(pastaFonte, '_instalador') };
}

const lerPublicado = (pastaInstalador) => lerVersaoJson(fs.readFileSync(path.join(pastaInstalador, 'versao.json'), 'utf8'));

test('publica o .exe e o versao.json em _instalador, com sha256 e notas', async (t) => {
  const a = ambiente(t, { conteudoExe: 'conteudo-exe' });
  const r = await publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz, notas: '  Corrige a busca. ' });

  assert.equal(r.versao, '0.1.1');
  assert.equal(r.arquivo, 'TextCDSP-Setup-0.1.1.exe');
  assert.equal(r.bytes, 'conteudo-exe'.length);
  assert.equal(fs.readFileSync(path.join(a.pastaInstalador, 'TextCDSP-Setup-0.1.1.exe'), 'utf8'), 'conteudo-exe');

  const lido = lerPublicado(a.pastaInstalador);
  assert.equal(lido.ok, true);
  assert.deepEqual(lido.info, { versao: '0.1.1', arquivo: 'TextCDSP-Setup-0.1.1.exe', notas: 'Corrige a busca.', sha256: sha('conteudo-exe') });
  // Sem temporários sobrando.
  assert.deepEqual(fs.readdirSync(a.pastaInstalador).sort(), ['TextCDSP-Setup-0.1.1.exe', 'versao.json']);
});

test('notas são opcionais', async (t) => {
  const a = ambiente(t);
  await publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz });
  assert.equal(lerPublicado(a.pastaInstalador).info.notas, '');
});

test('recusa se o .exe da versão do package.json não existe, sem criar nada na pasta', async (t) => {
  const a = ambiente(t, { gerarExe: false });
  // Existe um .exe de OUTRA versão: não serve.
  fs.writeFileSync(path.join(a.raiz, 'dist', 'TextCDSP-Setup-0.1.0.exe'), 'outra versão');
  await assert.rejects(publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz }), (erro) => {
    assert.ok(erro instanceof ErroPublicar);
    assert.match(erro.message, /0\.1\.1 não existe/);
    assert.match(erro.message, /npm run dist/);
    return true;
  });
  assert.equal(fs.existsSync(a.pastaInstalador), false);
});

test('recusa pasta-fonte inexistente', async (t) => {
  const a = ambiente(t);
  await assert.rejects(publicar({ pastaFonte: path.join(a.base, 'nao-existe'), raiz: a.raiz }), /não existe ou não está acessível/);
});

test('recusa versão inválida no package.json', async (t) => {
  const a = ambiente(t, { versao: 'abc', gerarExe: false });
  await assert.rejects(publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz }), /não é válida/);
});

test('recusa notas grandes demais antes de copiar qualquer coisa', async (t) => {
  const a = ambiente(t);
  await assert.rejects(publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz, notas: 'x'.repeat(501) }), /máximo é 500/);
  assert.equal(fs.existsSync(a.pastaInstalador), false);
});

test('não publica uma versão MENOR que a já anunciada na pasta', async (t) => {
  const novo = ambiente(t, { versao: '0.3.0' });
  await publicar({ pastaFonte: novo.pastaFonte, raiz: novo.raiz });
  // Outro projeto, na versão 0.2.0, tenta publicar na mesma pasta.
  const velho = ambiente(t, { versao: '0.2.0' });
  await assert.rejects(publicar({ pastaFonte: novo.pastaFonte, raiz: velho.raiz }), /já anuncia a versão 0\.3\.0/);
  assert.equal(lerPublicado(novo.pastaInstalador).info.versao, '0.3.0');
  assert.equal(fs.existsSync(path.join(novo.pastaInstalador, 'TextCDSP-Setup-0.2.0.exe')), false);
});

test('publicar uma versão maior substitui o versao.json; republicar a mesma versão troca o .exe', async (t) => {
  const a = ambiente(t, { versao: '0.1.1', conteudoExe: 'primeira' });
  await publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz, notas: 'um' });

  fs.writeFileSync(path.join(a.raiz, 'dist', 'TextCDSP-Setup-0.1.1.exe'), 'refeito');
  await publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz, notas: 'dois' });
  let lido = lerPublicado(a.pastaInstalador).info;
  assert.equal(lido.notas, 'dois');
  assert.equal(lido.sha256, sha('refeito'));

  fs.writeFileSync(path.join(a.raiz, 'package.json'), JSON.stringify({ name: 'textcdsp', version: '0.1.2' }));
  fs.writeFileSync(path.join(a.raiz, 'dist', 'TextCDSP-Setup-0.1.2.exe'), 'nova versão');
  await publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz });
  lido = lerPublicado(a.pastaInstalador).info;
  assert.equal(lido.versao, '0.1.2');
  assert.equal(lido.arquivo, 'TextCDSP-Setup-0.1.2.exe');
});

test('um versao.json ilegível na pasta não impede a publicação (é substituído)', async (t) => {
  const a = ambiente(t);
  fs.mkdirSync(a.pastaInstalador, { recursive: true });
  fs.writeFileSync(path.join(a.pastaInstalador, 'versao.json'), '{ quebrado');
  await publicar({ pastaFonte: a.pastaFonte, raiz: a.raiz });
  assert.equal(lerPublicado(a.pastaInstalador).ok, true);
});

test('CLI: sem argumento sai com código 2 e mostra o uso', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'publicar.js')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Uso: npm run publicar -- <pasta-fonte>/);
});

test('CLI: com o .exe da versão ausente, sai com código 1 sem pedir as notas', () => {
  // Usa o projeto real: dist\ não é versionado, então a versão atual não tem instalador num clone novo.
  const raizReal = path.resolve(__dirname, '..');
  const versao = JSON.parse(fs.readFileSync(path.join(raizReal, 'package.json'), 'utf8')).version;
  if (fs.existsSync(path.join(raizReal, 'dist', `TextCDSP-Setup-${versao}.exe`))) return; // já há instalador gerado: o caso não se aplica
  const r = spawnSync(process.execPath, [path.join(raizReal, 'scripts', 'publicar.js'), os.tmpdir()], { encoding: 'utf8', input: '' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /não existe/);
  assert.doesNotMatch(r.stdout, /Notas desta versão/);
});
