'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarCaminhos } = require('../src/main/caminhos');
const {
  criarSincronizador,
  lerFonte,
  calcularHash,
  substituirPasta,
  testarFonte,
  lerEstado,
} = require('../src/main/sincronizacao');

const raiz = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

const bloco = (trigger, label = 'Rótulo', texto = 'texto') => `  - trigger: "${trigger}"\n    label: "${label}"\n    replace: "${texto}"\n`;
const yml = (...blocos) => `matches:\n${blocos.join('')}`;

function escrever(pasta, arquivos) {
  fs.mkdirSync(pasta, { recursive: true });
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(pasta, nome);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo, 'utf8');
  }
}

const listar = (pasta) => (fs.existsSync(pasta) ? fs.readdirSync(pasta).sort() : []);

// Todos os arquivos de uma pasta, recursivamente, como caminhos relativos com "/", em ordem.
function arquivosDe(pasta, prefixo = '') {
  if (!fs.existsSync(pasta)) return [];
  const nomes = [];
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    if (e.isDirectory()) nomes.push(...arquivosDe(path.join(pasta, e.name), `${prefixo}${e.name}/`));
    else nomes.push(`${prefixo}${e.name}`);
  }
  return nomes.sort();
}

// Monta um ambiente completo: dados do app, pasta-fonte e sincronizador.
function ambiente(t, arquivosFonte = { 'a.yml': yml(bloco('/cont'), bloco('/hoje')) }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-sync-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const caminhos = criarCaminhos({ empacotado: false, appPath: raiz, userData: path.join(base, 'dados') });
  const fonte = path.join(base, 'fonte');
  fs.mkdirSync(caminhos.oficial, { recursive: true });
  escrever(fonte, arquivosFonte);

  const registro = { info: [], aviso: [], erro: [] };
  const log = {
    info: (m) => registro.info.push(m),
    aviso: (m) => registro.aviso.push(m),
    erro: (m) => registro.erro.push(m),
  };
  const config = { fonteSnippets: fonte };
  const notificacoes = [];
  const mudancas = [];
  const sincronizador = criarSincronizador({
    caminhos,
    log,
    obterConfig: () => config,
    aoErroNovo: (info) => notificacoes.push(info),
    aoMudar: (estado) => mudancas.push(estado.status),
  });
  return { base, caminhos, fonte, config, registro, notificacoes, mudancas, sincronizador };
}

// ---------------------------------------------------------------------------
// Estados básicos
// ---------------------------------------------------------------------------

test('pasta não configurada: status nao-configurado e nada é aplicado', async (t) => {
  const a = ambiente(t);
  a.config.fonteSnippets = '';
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'nao-configurado');
  assert.deepEqual(listar(a.caminhos.oficial), []);
  a.config.fonteSnippets = '   ';
  assert.equal((await a.sincronizador.sincronizar()).status, 'nao-configurado');
});

test('fonte válida: aplicada em oficial\\, copiada para o cache e registrada no estado.json', async (t) => {
  const a = ambiente(t);
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.equal(r.totalSnippets, 2);
  assert.deepEqual(r.erros, []);
  assert.match(r.aplicadoEm, /^\d{4}-\d{2}-\d{2}T/);

  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
  assert.equal(fs.readFileSync(path.join(a.caminhos.oficial, 'a.yml'), 'utf8'), fs.readFileSync(path.join(a.fonte, 'a.yml'), 'utf8'));
  assert.deepEqual(listar(a.caminhos.ultimaValida), ['a.yml']);

  const estado = lerEstado(a.caminhos.estado);
  assert.match(estado.hash, /^[0-9a-f]{64}$/);
  assert.equal(estado.aplicadoEm, r.aplicadoEm);
  assert.equal(estado.totalSnippets, 2);
  assert.ok(Array.isArray(estado.avisos));
});

test('a troca não deixa pastas temporárias para trás', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/hoje'), bloco('/novo')));
  await a.sincronizador.sincronizar();
  assert.deepEqual(listar(a.caminhos.cache), ['estado.json', 'ultima-valida']);
});

test('conteúdo novo na fonte substitui o que estava em uso', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/hoje'), bloco('/novo')));
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.equal(r.totalSnippets, 3);
  assert.match(fs.readFileSync(path.join(a.caminhos.oficial, 'a.yml'), 'utf8'), /\/novo/);
});

test('hash igual não reaplica', async (t) => {
  const a = ambiente(t);
  const primeira = await a.sincronizador.sincronizar();
  // Um marcador em oficial\ só sobreviveria se a pasta NÃO fosse trocada.
  fs.writeFileSync(path.join(a.caminhos.oficial, 'marcador.txt'), 'x');
  const segunda = await a.sincronizador.sincronizar();
  assert.equal(segunda.status, 'atualizado');
  assert.equal(segunda.aplicadoEm, primeira.aplicadoEm);
  assert.ok(fs.existsSync(path.join(a.caminhos.oficial, 'marcador.txt')));
});

test('hash igual, mas com oficial\\ esvaziada: reaplica', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.rmSync(path.join(a.caminhos.oficial, 'a.yml'));
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
});

test('arquivo removido na fonte é removido de oficial\\', async (t) => {
  const a = ambiente(t, { 'a.yml': yml(bloco('/cont')), 'b.yml': yml(bloco('/hoje')) });
  await a.sincronizador.sincronizar();
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml', 'b.yml']);
  fs.rmSync(path.join(a.fonte, 'b.yml'));
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
  assert.deepEqual(listar(a.caminhos.ultimaValida), ['a.yml']);
});

test('ignora arquivos iniciados por _, pastas _ e ., e outras extensões', async (t) => {
  const a = ambiente(t, {
    'ok.yml': yml(bloco('/cont')),
    '_rascunho.yml': 'isto nem é yaml: [',
    'notas.txt': 'texto',
    '_historico/2026-01-01_a.yml': 'isto também não: [',
    '_instalador/versao.json': '{}',
    '.oculta/x.yml': 'nem isto: [',
    'sub/_rascunho.yml': 'nem isto: [',
    'sub/leia.txt': 'texto',
  });
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.deepEqual(arquivosDe(a.caminhos.oficial), ['ok.yml']);
});

// ---------------------------------------------------------------------------
// Marco 10: subpastas
// ---------------------------------------------------------------------------

const ARVORE = () => ({
  'exemplos.yml': yml(bloco('/hoje')),
  'Medicamentos/contestacao.yml': yml(bloco('/cont')),
  'Medicamentos/Recursos/agravo.yml': yml(bloco('/agravo')),
});

test('lerFonte: nomes são caminhos relativos com "/", em ordem, sem as pastas ignoradas', async (t) => {
  const a = ambiente(t, { ...ARVORE(), '_historico/velho.yml': yml(bloco('/cont')), '_pasta/x.yml': yml(bloco('/x1')) });
  const arquivos = await lerFonte(a.fonte);
  assert.deepEqual(arquivos.map((x) => x.nome), ['Medicamentos/Recursos/agravo.yml', 'Medicamentos/contestacao.yml', 'exemplos.yml']);
  assert.ok(arquivos.every((x) => !x.nome.includes('\\')));
});

test('lerFonte: trava de segurança em 10 níveis de pastas', async (t) => {
  const nove = Array.from({ length: 10 }, (_, i) => `n${i}`).join('/');
  const a = ambiente(t, { 'raiz.yml': yml(bloco('/a1')), [`${nove}/dentro.yml`]: yml(bloco('/b1')), [`${nove}/n10/fora.yml`]: yml(bloco('/c1')) });
  const nomes = (await lerFonte(a.fonte)).map((x) => x.nome);
  assert.ok(nomes.includes(`${nove}/dentro.yml`)); // 10 níveis: ainda lido
  assert.ok(!nomes.some((n) => n.endsWith('fora.yml'))); // 11: ignorado
});

test('árvore com raiz e 2 níveis é aplicada igual, e também no cache', async (t) => {
  const a = ambiente(t, ARVORE());
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.equal(r.totalSnippets, 3);
  const esperado = ['Medicamentos/Recursos/agravo.yml', 'Medicamentos/contestacao.yml', 'exemplos.yml'];
  assert.deepEqual(arquivosDe(a.caminhos.oficial), esperado);
  assert.deepEqual(arquivosDe(a.caminhos.ultimaValida), esperado);
  for (const nome of esperado) {
    assert.equal(fs.readFileSync(path.join(a.caminhos.oficial, nome), 'utf8'), fs.readFileSync(path.join(a.fonte, nome), 'utf8'));
  }
  assert.deepEqual(listar(a.caminhos.cache), ['estado.json', 'ultima-valida']); // sem temporárias
});

test('_historico e _pasta ficam de fora de oficial\\ e do cache', async (t) => {
  const a = ambiente(t, { ...ARVORE(), '_historico/velho.yml': 'isto nem é yaml: [', '_pasta/x.yml': 'nem isto: [' });
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.equal(r.totalSnippets, 3);
  assert.deepEqual(listar(a.caminhos.oficial), ['Medicamentos', 'exemplos.yml']);
  assert.ok(!arquivosDe(a.caminhos.ultimaValida).some((n) => n.startsWith('_')));
});

test('arquivo no 4º nível bloqueia a aplicação e mantém a versão anterior', async (t) => {
  const a = ambiente(t, ARVORE());
  await a.sincronizador.sincronizar();
  const antes = arquivosDe(a.caminhos.oficial);
  const estadoAntes = lerEstado(a.caminhos.estado);

  escrever(a.fonte, { 'A/B/C/D/x.yml': yml(bloco('/fundo')) });
  const r = await a.sincronizador.sincronizar();

  assert.equal(r.status, 'erro-na-fonte');
  const erro = r.erros.find((e) => e.regra === 'caminho-profundo');
  assert.ok(erro);
  assert.equal(erro.arquivo, 'A/B/C/D/x.yml');
  assert.deepEqual(arquivosDe(a.caminhos.oficial), antes);
  assert.equal(lerEstado(a.caminhos.estado).hash, estadoAntes.hash);
  assert.equal(a.notificacoes.length, 1);

  // Mover o arquivo para o 3º nível resolve.
  fs.rmSync(path.join(a.fonte, 'A'), { recursive: true });
  escrever(a.fonte, { 'A/B/C/x.yml': yml(bloco('/fundo')) });
  const certo = await a.sincronizador.sincronizar();
  assert.equal(certo.status, 'atualizado');
  assert.ok(arquivosDe(a.caminhos.oficial).includes('A/B/C/x.yml'));
});

test('/cont na raiz e /contestacao em Medicamentos/: não aplica e a mensagem cita os dois caminhos', async (t) => {
  const a = ambiente(t, { 'raiz.yml': yml(bloco('/cont')), 'Medicamentos/contestacao.yml': yml(bloco('/contestacao')) });
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'erro-na-fonte');
  const e = r.erros.find((x) => x.regra === 'trigger-prefixo');
  assert.ok(e);
  assert.match(e.mensagem, /raiz\.yml:\d+/);
  assert.match(e.mensagem, /Medicamentos\/contestacao\.yml:\d+/);
  assert.deepEqual(arquivosDe(a.caminhos.oficial), []);
});

test('arquivo movido de pasta na fonte sai do lugar antigo', async (t) => {
  const a = ambiente(t, ARVORE());
  await a.sincronizador.sincronizar();
  fs.mkdirSync(path.join(a.fonte, 'Outros'));
  fs.renameSync(path.join(a.fonte, 'Medicamentos', 'contestacao.yml'), path.join(a.fonte, 'Outros', 'contestacao.yml'));
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  const esperado = ['Medicamentos/Recursos/agravo.yml', 'Outros/contestacao.yml', 'exemplos.yml'];
  assert.deepEqual(arquivosDe(a.caminhos.oficial), esperado);
  assert.deepEqual(arquivosDe(a.caminhos.ultimaValida), esperado);
});

test('o hash muda quando só o caminho muda', async (t) => {
  const a = ambiente(t, { 'Medicamentos/x.yml': yml(bloco('/cont')) });
  const antes = calcularHash(await lerFonte(a.fonte));
  fs.mkdirSync(path.join(a.fonte, 'Outros'));
  fs.renameSync(path.join(a.fonte, 'Medicamentos', 'x.yml'), path.join(a.fonte, 'Outros', 'x.yml'));
  assert.notEqual(calcularHash(await lerFonte(a.fonte)), antes);
  assert.notEqual(
    calcularHash([{ nome: 'a/b.yml', conteudo: 'x' }]),
    calcularHash([{ nome: 'a_b.yml', conteudo: 'x' }]),
  );
});

test('hash igual com arquivos só em subpastas não reaplica (match\\oficial\\ conta como preenchida)', async (t) => {
  const a = ambiente(t, { 'Medicamentos/contestacao.yml': yml(bloco('/cont')) });
  const primeira = await a.sincronizador.sincronizar();
  fs.writeFileSync(path.join(a.caminhos.oficial, 'marcador.txt'), 'x');
  const segunda = await a.sincronizador.sincronizar();
  assert.equal(segunda.aplicadoEm, primeira.aplicadoEm);
  assert.ok(fs.existsSync(path.join(a.caminhos.oficial, 'marcador.txt')));
});

test('restauração do cache com subpastas', async (t) => {
  const a = ambiente(t, ARVORE());
  await a.sincronizador.sincronizar();
  fs.rmSync(a.caminhos.oficial, { recursive: true, force: true });
  assert.equal(await a.sincronizador.restaurarDoCache(), true);
  assert.deepEqual(arquivosDe(a.caminhos.oficial), ['Medicamentos/Recursos/agravo.yml', 'Medicamentos/contestacao.yml', 'exemplos.yml']);
  // Com a pasta preenchida só por subpastas, não restaura de novo.
  fs.writeFileSync(path.join(a.caminhos.oficial, 'marcador.txt'), 'x');
  assert.equal(await a.sincronizador.restaurarDoCache(), false);
  assert.ok(fs.existsSync(path.join(a.caminhos.oficial, 'marcador.txt')));
});

test('testarFonte conta os arquivos das subpastas e acusa caminho-profundo', async (t) => {
  const a = ambiente(t, { ...ARVORE(), 'A/B/C/D/x.yml': yml(bloco('/fundo')) });
  const r = await testarFonte(a.fonte);
  assert.equal(r.arquivos, 4);
  assert.ok(r.erros.some((e) => e.regra === 'caminho-profundo'));
});

// ---------------------------------------------------------------------------
// Fonte com erro
// ---------------------------------------------------------------------------

test('fonte com erro não é aplicada e a versão anterior é mantida', async (t) => {
  const a = ambiente(t);
  const boa = await a.sincronizador.sincronizar();
  const conteudoBom = fs.readFileSync(path.join(a.caminhos.oficial, 'a.yml'), 'utf8');

  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/contestacao')));
  const r = await a.sincronizador.sincronizar();

  assert.equal(r.status, 'erro-na-fonte');
  assert.ok(r.erros.some((e) => e.regra === 'trigger-prefixo' && /\/cont\b/.test(e.mensagem) && /\/contestacao/.test(e.mensagem)));
  assert.equal(fs.readFileSync(path.join(a.caminhos.oficial, 'a.yml'), 'utf8'), conteudoBom);
  assert.equal(lerEstado(a.caminhos.estado).aplicadoEm, boa.aplicadoEm);
  assert.equal(r.aplicadoEm, boa.aplicadoEm);
  assert.ok(a.registro.erro.length >= 1);
});

test('o aviso de erro é dado uma vez por versão com erro, sem repetir a cada ciclo', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/contestacao')));
  await a.sincronizador.sincronizar();
  await a.sincronizador.sincronizar();
  await a.sincronizador.sincronizar();
  assert.equal(a.notificacoes.length, 1);
  assert.ok(a.notificacoes[0].erros.length >= 1);

  // Outro conteúdo com erro: é uma versão nova, então avisa de novo.
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/contratos')));
  await a.sincronizador.sincronizar();
  assert.equal(a.notificacoes.length, 2);
});

test('depois de corrigido, volta a atualizar; o mesmo erro depois avisa de novo', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  const ruim = yml(bloco('/cont'), bloco('/contestacao'));
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), ruim);
  await a.sincronizador.sincronizar();
  assert.equal(a.notificacoes.length, 1);

  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/hoje'), bloco('/extra')));
  const corrigido = await a.sincronizador.sincronizar();
  assert.equal(corrigido.status, 'atualizado');
  assert.equal(corrigido.totalSnippets, 3);

  fs.writeFileSync(path.join(a.fonte, 'a.yml'), ruim);
  await a.sincronizador.sincronizar();
  assert.equal(a.notificacoes.length, 2);
});

test('voltar ao conteúdo já aplicado limpa o erro', async (t) => {
  const a = ambiente(t);
  const original = fs.readFileSync(path.join(a.fonte, 'a.yml'), 'utf8');
  await a.sincronizador.sincronizar();
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), yml(bloco('/cont'), bloco('/contestacao')));
  assert.equal((await a.sincronizador.sincronizar()).status, 'erro-na-fonte');
  fs.writeFileSync(path.join(a.fonte, 'a.yml'), original);
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.deepEqual(r.erros, []);
});

test('erro de YAML numa fonte inédita: nada é aplicado', async (t) => {
  const a = ambiente(t, { 'a.yml': 'matches:\n  - trigger: "/a1\n' });
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'erro-na-fonte');
  assert.deepEqual(listar(a.caminhos.oficial), []);
  assert.equal(lerEstado(a.caminhos.estado), null);
});

test('pasta sem nenhum .yml não apaga a versão em uso', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.rmSync(path.join(a.fonte, 'a.yml'));
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'erro-na-fonte');
  assert.equal(r.erros[0].regra, 'fonte-vazia');
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
});

test('conflito com um atalho pessoal é aviso e não impede a aplicação', async (t) => {
  const a = ambiente(t);
  fs.mkdirSync(path.dirname(a.caminhos.pessoalYml), { recursive: true });
  fs.writeFileSync(a.caminhos.pessoalYml, yml(bloco('/cont', 'Meu')));
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'atualizado');
  assert.deepEqual(r.erros, []);
  assert.ok(r.avisos.some((x) => x.regra === 'conflito-pessoal'));
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
});

test('os avisos da versão aplicada continuam disponíveis quando o hash não muda', async (t) => {
  const a = ambiente(t, { 'a.yml': 'matches:\n  - trigger: "/a1"\n    label: "x"\n    replace: ""\n' });
  const primeira = await a.sincronizador.sincronizar();
  assert.equal(primeira.status, 'atualizado');
  assert.ok(primeira.avisos.some((x) => x.regra === 'texto-vazio'));
  const segunda = await a.sincronizador.sincronizar();
  assert.ok(segunda.avisos.some((x) => x.regra === 'texto-vazio'));
});

// ---------------------------------------------------------------------------
// Fonte inacessível
// ---------------------------------------------------------------------------

test('fonte inacessível: status offline, mantém o que está em uso e registra no log', async (t) => {
  const a = ambiente(t);
  const boa = await a.sincronizador.sincronizar();
  fs.renameSync(a.fonte, `${a.fonte}-renomeada`);

  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'offline');
  assert.equal(r.aplicadoEm, boa.aplicadoEm);
  assert.equal(r.totalSnippets, 2);
  assert.match(r.mensagem, /pasta/);
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
  assert.equal(a.registro.aviso.length, 1);

  // O aviso no log não se repete a cada ciclo offline.
  await a.sincronizador.sincronizar();
  assert.equal(a.registro.aviso.length, 1);

  // Voltando a pasta, volta ao normal sem reaplicar.
  fs.renameSync(`${a.fonte}-renomeada`, a.fonte);
  const volta = await a.sincronizador.sincronizar();
  assert.equal(volta.status, 'atualizado');
  assert.equal(volta.aplicadoEm, boa.aplicadoEm);
});

test('fonte inacessível desde o início: offline sem versão aplicada', async (t) => {
  const a = ambiente(t);
  a.config.fonteSnippets = path.join(a.base, 'nao-existe');
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'offline');
  assert.equal(r.aplicadoEm, null);
  assert.deepEqual(listar(a.caminhos.oficial), []);
});

test('o caminho da fonte apontando para um arquivo também é "offline"', async (t) => {
  const a = ambiente(t);
  a.config.fonteSnippets = path.join(a.fonte, 'a.yml');
  assert.equal((await a.sincronizador.sincronizar()).status, 'offline');
});

// ---------------------------------------------------------------------------
// Restauração a partir do cache
// ---------------------------------------------------------------------------

test('restauração a partir do cache quando oficial\\ está vazia', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.rmSync(a.caminhos.oficial, { recursive: true });
  fs.mkdirSync(a.caminhos.oficial);

  assert.equal(await a.sincronizador.restaurarDoCache(), true);
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
  assert.equal(fs.readFileSync(path.join(a.caminhos.oficial, 'a.yml'), 'utf8'), fs.readFileSync(path.join(a.fonte, 'a.yml'), 'utf8'));
});

test('restauração também funciona se a pasta oficial\\ nem existir', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.rmSync(a.caminhos.oficial, { recursive: true });
  assert.equal(await a.sincronizador.restaurarDoCache(), true);
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
});

test('restauração não mexe em oficial\\ quando ela já tem arquivos', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.writeFileSync(path.join(a.caminhos.oficial, 'a.yml'), yml(bloco('/outro')));
  assert.equal(await a.sincronizador.restaurarDoCache(), false);
  assert.match(fs.readFileSync(path.join(a.caminhos.oficial, 'a.yml'), 'utf8'), /\/outro/);
});

test('restauração sem cache devolve false', async (t) => {
  const a = ambiente(t);
  assert.equal(await a.sincronizador.restaurarDoCache(), false);
  assert.deepEqual(listar(a.caminhos.oficial), []);
});

test('depois de restaurar do cache com a fonte offline, os atalhos seguem os mesmos', async (t) => {
  const a = ambiente(t);
  await a.sincronizador.sincronizar();
  fs.rmSync(a.caminhos.oficial, { recursive: true });
  fs.renameSync(a.fonte, `${a.fonte}-fora`);
  await a.sincronizador.restaurarDoCache();
  const r = await a.sincronizador.sincronizar();
  assert.equal(r.status, 'offline');
  assert.deepEqual(listar(a.caminhos.oficial), ['a.yml']);
});

// ---------------------------------------------------------------------------
// Concorrência
// ---------------------------------------------------------------------------

test('sem execuções simultâneas: um pedido durante outro devolve a mesma execução', async (t) => {
  const a = ambiente(t);
  const p1 = a.sincronizador.sincronizar();
  assert.equal(a.sincronizador.estadoAtual().sincronizando, true);
  const p2 = a.sincronizador.sincronizar();
  assert.equal(p1, p2);
  await p1;
  assert.equal(a.sincronizador.estadoAtual().sincronizando, false);
  assert.equal(a.mudancas.length, 1); // só uma execução de fato
  const p3 = a.sincronizador.sincronizar();
  assert.notEqual(p1, p3);
  await p3;
  assert.equal(a.mudancas.length, 2);
});

// ---------------------------------------------------------------------------
// Troca atômica (substituirPasta)
// ---------------------------------------------------------------------------

function pastas(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-troca-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { destino: path.join(base, 'destino'), staging: path.join(base, 'novo'), antigo: path.join(base, 'antigo'), base };
}

test('substituirPasta: troca o conteúdo e não deixa temporárias', async (t) => {
  const p = pastas(t);
  escrever(p.destino, { 'velho.yml': 'v' });
  await substituirPasta({ ...p, arquivos: [{ nome: 'novo.yml', conteudo: 'n' }] });
  assert.deepEqual(listar(p.destino), ['novo.yml']);
  assert.deepEqual(listar(p.base), ['destino']);
});

test('substituirPasta: cria o destino se ele não existir', async (t) => {
  const p = pastas(t);
  await substituirPasta({ ...p, arquivos: [{ nome: 'a.yml', conteudo: 'a' }] });
  assert.deepEqual(listar(p.destino), ['a.yml']);
});

test('substituirPasta: falha ao gravar mantém o destino intacto e limpa a pasta temporária', async (t) => {
  const p = pastas(t);
  escrever(p.destino, { 'velho.yml': 'v' });
  await assert.rejects(substituirPasta({ ...p, arquivos: [{ nome: 'bom.yml', conteudo: 'b' }, { nome: 'ruim\0.yml', conteudo: 'x' }] }));
  assert.deepEqual(listar(p.destino), ['velho.yml']);
  assert.equal(fs.readFileSync(path.join(p.destino, 'velho.yml'), 'utf8'), 'v');
  assert.deepEqual(listar(p.base), ['destino']);
});

test('substituirPasta: falha no meio da troca restaura a versão antiga', async (t) => {
  const p = pastas(t);
  escrever(p.destino, { 'velho.yml': 'v' });
  let chamadas = 0;
  const renomear = async (de, para) => {
    chamadas += 1;
    if (chamadas === 2) throw Object.assign(new Error('falha simulada'), { code: 'EXDEV' }); // staging -> destino
    return fs.promises.rename(de, para);
  };
  await assert.rejects(substituirPasta({ ...p, renomear, arquivos: [{ nome: 'novo.yml', conteudo: 'n' }] }), /falha simulada/);
  assert.deepEqual(listar(p.destino), ['velho.yml']);
  assert.equal(fs.readFileSync(path.join(p.destino, 'velho.yml'), 'utf8'), 'v');
  assert.deepEqual(listar(p.base), ['destino']);
});

test('substituirPasta: tenta de novo quando o Windows recusa a troca por instantes', async (t) => {
  const p = pastas(t);
  escrever(p.destino, { 'velho.yml': 'v' });
  let falhasRestantes = 2;
  const renomear = async (de, para) => {
    if (falhasRestantes > 0) {
      falhasRestantes -= 1;
      throw Object.assign(new Error('em uso'), { code: 'EBUSY' });
    }
    return fs.promises.rename(de, para);
  };
  await substituirPasta({ ...p, renomear, esperaMs: 5, arquivos: [{ nome: 'novo.yml', conteudo: 'n' }] });
  assert.deepEqual(listar(p.destino), ['novo.yml']);
});

// ---------------------------------------------------------------------------
// lerFonte, calcularHash e testarFonte
// ---------------------------------------------------------------------------

test('calcularHash: depende de nomes e conteúdos, não da ordem de entrada', () => {
  const a = { nome: 'a.yml', conteudo: '1' };
  const b = { nome: 'b.yml', conteudo: '2' };
  assert.equal(calcularHash([a, b]), calcularHash([b, a]));
  assert.notEqual(calcularHash([a, b]), calcularHash([a, { ...b, conteudo: '3' }]));
  assert.notEqual(calcularHash([a, b]), calcularHash([a, { ...b, nome: 'c.yml' }]));
  assert.notEqual(calcularHash([a]), calcularHash([a, b]));
  assert.match(calcularHash([]), /^[0-9a-f]{64}$/);
});

test('lerFonte: lê em ordem de nome e falha se a pasta não existir', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-ler-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  escrever(base, { 'b.yml': 'B', 'a.yml': 'A', 'c.YML': 'C' });
  assert.deepEqual((await lerFonte(base)).map((x) => x.nome), ['a.yml', 'b.yml', 'c.YML']);
  await assert.rejects(lerFonte(path.join(base, 'nao-existe')), { code: 'ENOENT' });
});

test('testarFonte: pasta válida, com erro, vazia, inexistente e em branco', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-testar-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  escrever(path.join(base, 'boa'), { 'a.yml': yml(bloco('/cont'), bloco('/hoje')) });
  const boa = await testarFonte(path.join(base, 'boa'));
  assert.equal(boa.acessivel, true);
  assert.equal(boa.snippets, 2);
  assert.equal(boa.arquivos, 1);
  assert.deepEqual(boa.erros, []);

  escrever(path.join(base, 'ruim'), { 'a.yml': yml(bloco('/cont'), bloco('/contestacao')) });
  const ruim = await testarFonte(path.join(base, 'ruim'));
  assert.equal(ruim.acessivel, true);
  assert.equal(ruim.erros[0].regra, 'trigger-prefixo');

  fs.mkdirSync(path.join(base, 'vazia'));
  const vazia = await testarFonte(path.join(base, 'vazia'));
  assert.equal(vazia.acessivel, true);
  assert.equal(vazia.erros[0].regra, 'fonte-vazia');

  const inexistente = await testarFonte(path.join(base, 'nao-existe'));
  assert.equal(inexistente.acessivel, false);
  assert.match(inexistente.mensagem, /Não foi possível acessar/);

  assert.equal((await testarFonte('   ')).acessivel, false);
});

test('testarFonte: considera os atalhos pessoais (conflito é aviso)', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-testar-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  escrever(base, { 'a.yml': yml(bloco('/cont')) });
  const r = await testarFonte(base, [{ nome: 'pessoal.yml', conteudo: yml(bloco('/cont', 'Meu')) }]);
  assert.deepEqual(r.erros, []);
  assert.ok(r.avisos.some((x) => x.regra === 'conflito-pessoal'));
});

test('testarFonte não altera nada em disco', async (t) => {
  const a = ambiente(t);
  await testarFonte(a.fonte);
  assert.deepEqual(listar(a.caminhos.oficial), []);
  assert.equal(fs.existsSync(a.caminhos.cache), false);
});
