'use strict';

// Aviso de nova versão (Marco 7), com pastas temporárias e sem Electron.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { criarCaminhos } = require('../src/main/caminhos');
const { criarAtualizador, PASTA_INSTALADOR } = require('../src/main/atualizacao');
const { lerFonte, calcularHash } = require('../src/main/sincronizacao');
const { montarVersaoJson } = require('../src/shared/versaoInstalador');

const raiz = path.resolve(__dirname, '..');
const sha = (conteudo) => crypto.createHash('sha256').update(conteudo).digest('hex');

// Monta um ambiente: dados do app, pasta-fonte e um atualizador na versão `versaoAtual`.
function ambiente(t, { versaoAtual = '0.1.0', fonteConfigurada = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-atualizacao-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const caminhos = criarCaminhos({ empacotado: false, appPath: raiz, userData: path.join(base, 'dados') });
  const fonte = path.join(base, 'fonte');
  fs.mkdirSync(fonte, { recursive: true });

  const registro = { info: [], aviso: [], erro: [] };
  const log = { info: (m) => registro.info.push(m), aviso: (m) => registro.aviso.push(m), erro: (m) => registro.erro.push(m) };
  const estado = { fonte: fonteConfigurada ? fonte : '', avisada: '' };
  const mudancas = [];
  const novas = [];
  const atualizador = criarAtualizador({
    caminhos,
    log,
    obterFonte: () => estado.fonte,
    versaoAtual,
    obterVersaoAvisada: () => estado.avisada,
    aoMudar: (d) => mudancas.push(d && d.versao),
    // Como o index.js: quem recebe grava a versão avisada.
    aoNovaVersao: (info) => {
      novas.push(info.versao);
      estado.avisada = info.versao;
    },
  });

  // Publica como o scripts/publicar.js: o .exe e depois o versao.json.
  function publicar({ versao, conteudo = `instalador ${versao}`, notas = '', semSha = false, arquivo = `TextCDSP-Setup-${versao}.exe`, gravarExe = true }) {
    const pasta = path.join(fonte, PASTA_INSTALADOR);
    fs.mkdirSync(pasta, { recursive: true });
    if (gravarExe) fs.writeFileSync(path.join(pasta, arquivo), conteudo);
    fs.writeFileSync(path.join(pasta, 'versao.json'), montarVersaoJson({ versao, arquivo, notas, sha256: semSha ? '' : sha(conteudo) }));
  }

  return { base, caminhos, fonte, registro, estado, mudancas, novas, atualizador, publicar, pastaInstalador: path.join(fonte, PASTA_INSTALADOR) };
}

test('sem pasta-fonte configurada: nenhuma versão disponível e nenhum aviso', async (t) => {
  const a = ambiente(t, { fonteConfigurada: false });
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel(), null);
  assert.deepEqual(a.novas, []);
});

test('pasta sem _instalador: nada a avisar', async (t) => {
  const a = ambiente(t);
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel(), null);
  assert.deepEqual([a.mudancas, a.novas], [[], []]);
  assert.deepEqual(a.registro.aviso, []);
});

test('versão maior publicada: fica disponível e avisa UMA vez', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1', notas: 'Corrige a busca.' });
  await a.atualizador.verificar();

  const d = a.atualizador.disponivel();
  assert.equal(d.versao, '0.1.1');
  assert.equal(d.arquivo, 'TextCDSP-Setup-0.1.1.exe');
  assert.equal(d.notas, 'Corrige a busca.');
  assert.equal(d.origem, path.join(a.pastaInstalador, 'TextCDSP-Setup-0.1.1.exe'));
  assert.deepEqual(a.mudancas, ['0.1.1']);
  assert.deepEqual(a.novas, ['0.1.1']);

  // Cada sincronização verifica de novo: o aviso não se repete, nem a mudança do menu.
  await a.atualizador.verificar();
  await a.atualizador.verificar();
  assert.deepEqual(a.novas, ['0.1.1']);
  assert.deepEqual(a.mudancas, ['0.1.1']);
  assert.equal(a.registro.info.filter((m) => m.includes('Nova versão')).length, 1);
});

test('versão já avisada antes (app reiniciado): continua disponível no menu, sem nova notificação', async (t) => {
  const a = ambiente(t);
  a.estado.avisada = '0.1.1'; // vindo do config.json
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel().versao, '0.1.1');
  assert.deepEqual(a.novas, []);
});

test('uma versão ainda mais nova avisa de novo', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  a.publicar({ versao: '0.2.0' });
  await a.atualizador.verificar();
  assert.deepEqual(a.novas, ['0.1.1', '0.2.0']);
  assert.equal(a.atualizador.disponivel().versao, '0.2.0');
  assert.deepEqual(a.mudancas, ['0.1.1', '0.2.0']);
});

test('versão igual ou menor que a instalada: nada disponível', async (t) => {
  const a = ambiente(t, { versaoAtual: '0.2.0' });
  for (const versao of ['0.2.0', '0.1.9', '0.2.0-rc.1']) {
    a.publicar({ versao });
    await a.atualizador.verificar();
    assert.equal(a.atualizador.disponivel(), null, versao);
  }
  assert.deepEqual(a.novas, []);
});

test('comparação semver de verdade: 0.10.0 é maior que 0.9.0', async (t) => {
  const a = ambiente(t, { versaoAtual: '0.9.0' });
  a.publicar({ versao: '0.10.0' });
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel().versao, '0.10.0');
});

test('o versao.json some: o item do menu some', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  fs.rmSync(path.join(a.pastaInstalador, 'versao.json'));
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel(), null);
  assert.deepEqual(a.mudancas, ['0.1.1', null]);
});

test('pasta indisponível (offline): mantém o que já se sabia, sem inventar nem apagar', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  fs.renameSync(a.fonte, `${a.fonte}-fora`);
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel().versao, '0.1.1');
  assert.deepEqual(a.mudancas, ['0.1.1']);
});

test('versao.json inválido é ignorado e registrado uma única vez', async (t) => {
  const a = ambiente(t);
  fs.mkdirSync(a.pastaInstalador, { recursive: true });
  fs.writeFileSync(path.join(a.pastaInstalador, 'versao.json'), '{ quebrado');
  await a.atualizador.verificar();
  await a.atualizador.verificar();
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel(), null);
  assert.deepEqual(a.novas, []);
  assert.equal(a.registro.aviso.length, 1);
  assert.match(a.registro.aviso[0], /versao\.json ignorado/);
});

test('versao.json inválido não derruba uma versão já conhecida', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  fs.writeFileSync(path.join(a.pastaInstalador, 'versao.json'), '{ editado pela metade');
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel().versao, '0.1.1');
});

test('anunciada mas sem o .exe na pasta: não avisa (publicação incompleta)', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1', gravarExe: false });
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel(), null);
  assert.deepEqual(a.novas, []);
  assert.match(a.registro.aviso[0], /não está em _instalador/);
  // Quando o .exe chega, passa a avisar.
  fs.writeFileSync(path.join(a.pastaInstalador, 'TextCDSP-Setup-0.1.1.exe'), 'instalador 0.1.1');
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel().versao, '0.1.1');
  assert.deepEqual(a.novas, ['0.1.1']);
});

test('"arquivo" apontando para fora da pasta _instalador nunca vira uma versão disponível', async (t) => {
  const a = ambiente(t);
  fs.writeFileSync(path.join(a.fonte, 'fora.exe'), 'não deve ser executado');
  fs.mkdirSync(a.pastaInstalador, { recursive: true });
  fs.writeFileSync(path.join(a.pastaInstalador, 'versao.json'), JSON.stringify({ versao: '9.9.9', arquivo: '..\\fora.exe' }));
  await a.atualizador.verificar();
  assert.equal(a.atualizador.disponivel(), null);
  assert.deepEqual(a.novas, []);
});

test('verificações ao mesmo tempo viram uma só', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  const [x, y] = [a.atualizador.verificar(), a.atualizador.verificar()];
  assert.equal(x, y);
  await Promise.all([x, y]);
  assert.deepEqual(a.novas, ['0.1.1']);
});

test('a subpasta _instalador não entra na sincronização de snippets nem muda o hash', async (t) => {
  const a = ambiente(t);
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), 'matches: []\n');
  const antes = calcularHash(await lerFonte(a.fonte));
  a.publicar({ versao: '0.1.1' });
  const arquivos = await lerFonte(a.fonte);
  assert.deepEqual(arquivos.map((x) => x.nome), ['a.yml']);
  assert.equal(calcularHash(arquivos), antes);
});

// ---------------------------------------------------------------------------
// prepararInstalacao
// ---------------------------------------------------------------------------

test('prepararInstalacao: copia o instalador para o cache local e devolve o caminho da cópia', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1', conteudo: 'conteudo do instalador' });
  await a.atualizador.verificar();
  const r = await a.atualizador.prepararInstalacao();
  assert.equal(r.ok, true);
  assert.equal(r.versao, '0.1.1');
  assert.equal(r.caminho, path.join(a.caminhos.instalador, 'TextCDSP-Setup-0.1.1.exe'));
  assert.equal(fs.readFileSync(r.caminho, 'utf8'), 'conteudo do instalador');
  // Nenhum arquivo parcial sobra.
  assert.deepEqual(fs.readdirSync(a.caminhos.instalador), ['TextCDSP-Setup-0.1.1.exe']);
});

test('prepararInstalacao: confere a pasta de novo (pega a versão publicada depois do último aviso)', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  a.publicar({ versao: '0.1.2', conteudo: 'mais novo' });
  const r = await a.atualizador.prepararInstalacao();
  assert.equal(r.ok, true);
  assert.equal(r.versao, '0.1.2');
  assert.equal(fs.readFileSync(r.caminho, 'utf8'), 'mais novo');
});

test('prepararInstalacao: instalador que não confere com o sha256 publicado NÃO é entregue para execução', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1', conteudo: 'original' });
  await a.atualizador.verificar();
  // Alguém trocou (ou truncou) o .exe depois da publicação.
  fs.writeFileSync(path.join(a.pastaInstalador, 'TextCDSP-Setup-0.1.1.exe'), 'adulterado');
  const r = await a.atualizador.prepararInstalacao();
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /não confere/);
  assert.equal(fs.existsSync(a.caminhos.instalador), false, 'nada fica no cache para ser executado');
  assert.match(a.registro.erro.join('\n'), /sha256/);
});

test('prepararInstalacao: versao.json sem sha256 é aceito, com aviso no log', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1', semSha: true });
  await a.atualizador.verificar();
  const r = await a.atualizador.prepararInstalacao();
  assert.equal(r.ok, true);
  assert.match(a.registro.aviso.join('\n'), /sem sha256/);
});

test('prepararInstalacao: sem versão nova, recusa', async (t) => {
  const a = ambiente(t);
  const r = await a.atualizador.prepararInstalacao();
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Não há nova versão/);
});

test('prepararInstalacao: pasta some entre o aviso e o clique — mensagem clara, sem sobras', async (t) => {
  const a = ambiente(t);
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  fs.renameSync(a.fonte, `${a.fonte}-fora`);
  const r = await a.atualizador.prepararInstalacao();
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Não foi possível copiar o instalador/);
  assert.equal(fs.existsSync(a.caminhos.instalador), false);
});

test('prepararInstalacao: um instalador antigo no cache é substituído, não acumulado', async (t) => {
  const a = ambiente(t);
  fs.mkdirSync(a.caminhos.instalador, { recursive: true });
  fs.writeFileSync(path.join(a.caminhos.instalador, 'TextCDSP-Setup-0.0.9.exe'), 'velho');
  a.publicar({ versao: '0.1.1' });
  await a.atualizador.verificar();
  await a.atualizador.prepararInstalacao();
  assert.deepEqual(fs.readdirSync(a.caminhos.instalador), ['TextCDSP-Setup-0.1.1.exe']);
});

test('limparInstaladorLocal: apaga o instalador da vez anterior e não falha se não houver', async (t) => {
  const a = ambiente(t);
  await a.atualizador.limparInstaladorLocal(); // sem a pasta
  fs.mkdirSync(a.caminhos.instalador, { recursive: true });
  fs.writeFileSync(path.join(a.caminhos.instalador, 'TextCDSP-Setup-0.1.1.exe'), 'x');
  await a.atualizador.limparInstaladorLocal();
  assert.equal(fs.existsSync(a.caminhos.instalador), false);
});
