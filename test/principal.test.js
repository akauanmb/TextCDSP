'use strict';

// Estrutura da janela principal e do ícone flutuante (Marco 11): arquivos, ids da página, canais IPC e as regras
// de segurança do Electron. São verificações estáticas, sem abrir o Electron.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarCaminhos } = require('../src/main/caminhos');

const raiz = path.resolve(__dirname, '..');
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');
const caminhos = criarCaminhos({ empacotado: false, appPath: raiz, userData: path.join(raiz, 'dados-falsos') });
const renderer = (...partes) => path.join(raiz, 'src', 'renderer', ...partes);

const htmlPrincipal = ler('src', 'renderer', 'principal', 'index.html');
const scriptsDaPagina = ['comum.js', 'biblioteca.js', 'configuracoes.js', 'principal.js'];

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------

test('caminhos: a janela principal e o ícone flutuante existem; as janelas antigas foram removidas', () => {
  for (const caminho of [caminhos.paginaPrincipal, caminhos.preloadPrincipal, caminhos.paginaIcone, caminhos.preloadIcone]) {
    assert.ok(fs.existsSync(caminho), caminho);
  }
  assert.ok(fs.existsSync(path.join(raiz, 'assets', 'icon128.png')));
  for (const antigo of ['paginaBiblioteca', 'preloadBiblioteca', 'paginaConfiguracoes', 'preloadConfiguracoes']) {
    assert.equal(antigo in caminhos, false, antigo);
  }
  for (const removido of [
    ['src', 'main', 'janelaBiblioteca.js'],
    ['src', 'main', 'janelaConfiguracoes.js'],
    ['src', 'preload', 'biblioteca.js'],
    ['src', 'preload', 'configuracoes.js'],
    ['src', 'renderer', 'biblioteca'],
    ['src', 'renderer', 'configuracoes'],
  ]) {
    assert.equal(fs.existsSync(path.join(raiz, ...removido)), false, removido.join('/'));
  }
});

test('a página principal carrega só arquivos que existem, na ordem certa (comum antes das seções)', () => {
  const caminhosDosScripts = [...htmlPrincipal.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const origem of [...caminhosDosScripts, ...[...htmlPrincipal.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1])]) {
    assert.ok(fs.existsSync(renderer('principal', origem)), origem);
  }
  const ordem = caminhosDosScripts.map((s) => path.basename(s));
  assert.deepEqual(ordem, ['busca.js', 'arvore.js', ...scriptsDaPagina]);
});

test('a página do ícone carrega só arquivos que existem', () => {
  const html = ler('src', 'renderer', 'icone', 'index.html');
  for (const origem of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])) {
    assert.ok(fs.existsSync(renderer('icone', origem)), origem);
  }
});

// ---------------------------------------------------------------------------
// ids da página principal
// ---------------------------------------------------------------------------

const idsDoHtml = [...htmlPrincipal.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const idsCriadosPelosScripts = (nome) => [...ler('src', 'renderer', 'principal', nome).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]);

test('ids do HTML: sem repetição', () => {
  assert.deepEqual(idsDoHtml.filter((id, i) => idsDoHtml.indexOf(id) !== i), []);
});

test('ids: nenhum id criado por script repete um id do HTML (as duas seções vivem na mesma página)', () => {
  const criados = scriptsDaPagina.flatMap(idsCriadosPelosScripts);
  assert.deepEqual(criados.filter((id) => idsDoHtml.includes(id)), []);
  // E dois scripts diferentes não criam o mesmo id.
  const repetidos = criados.filter((id, i) => criados.indexOf(id) !== i);
  assert.deepEqual([...new Set(repetidos)].filter((id) => scriptsDaPagina.filter((n) => idsCriadosPelosScripts(n).includes(id)).length > 1), []);
});

test('ids: tudo que os scripts buscam com $("id") existe no HTML ou é criado por algum script', () => {
  const criados = scriptsDaPagina.flatMap(idsCriadosPelosScripts);
  for (const nome of scriptsDaPagina) {
    const codigo = ler('src', 'renderer', 'principal', nome);
    for (const [, id] of codigo.matchAll(/\$\('([^']+)'\)/g)) {
      assert.ok(idsDoHtml.includes(id) || criados.includes(id), `${nome}: $('${id}')`);
    }
  }
});

test('ids: as duas seções, o menu e o botão de minimizar estão no HTML', () => {
  for (const id of ['secao-biblioteca', 'secao-configuracoes', 'menu-biblioteca', 'menu-configuracoes', 'status-sync', 'minimizar', 'config-salvar', 'config-mensagem', 'minimizar-icone']) {
    assert.ok(idsDoHtml.includes(id), id);
  }
  // A seção Configurações começa escondida; a Biblioteca, à vista.
  assert.match(htmlPrincipal, /id="secao-configuracoes" class="secao" hidden/);
  assert.doesNotMatch(htmlPrincipal, /id="secao-biblioteca"[^>]*hidden/);
});

// ---------------------------------------------------------------------------
// Canais IPC: só os que o marco define
// ---------------------------------------------------------------------------

const canaisDe = (codigo, padrao) => [...codigo.matchAll(padrao)].map((m) => m[1]).sort();

test('janelaPrincipal.js: só os canais da Biblioteca, das Configurações e da janela', () => {
  const codigo = ler('src', 'main', 'janelaPrincipal.js');
  assert.deepEqual(canaisDe(codigo, /ipcMain\.handle\('([^']+)'/g), [
    'biblioteca:copiar', 'biblioteca:listar', 'config:ler', 'config:salvar', 'fonte:escolher', 'fonte:testar',
    'janela:minimizar-para-icone', 'pessoal:abrir-arquivo', 'pessoal:excluir', 'pessoal:salvar', 'sync:agora', 'sync:estado',
  ]);
  assert.equal(canaisDe(codigo, /ipcMain\.on\('([^']+)'/g).length, 0);
  // Os avisos do processo principal para a página.
  assert.deepEqual(canaisDe(codigo, /webContents\.send\('([^']+)'/g), ['biblioteca:mudou', 'janela:secao', 'janela:secao']);
});

test('preload da janela principal: um canal por função, e os mesmos do processo principal', () => {
  const codigo = ler('src', 'preload', 'principal.js');
  assert.deepEqual(canaisDe(codigo, /invoke\('([^']+)'/g), canaisDe(ler('src', 'main', 'janelaPrincipal.js'), /ipcMain\.handle\('([^']+)'/g));
  assert.deepEqual(canaisDe(codigo, /ipcRenderer\.on\('([^']+)'/g), ['biblioteca:mudou', 'janela:secao']);
});

test('ícone flutuante: só icone:mover, icone:abrir e icone:menu, no processo principal e no preload', () => {
  const principal = ler('src', 'main', 'iconeFlutuante.js');
  const preload = ler('src', 'preload', 'icone.js');
  assert.deepEqual(canaisDe(principal, /ipcMain\.on\('([^']+)'/g), ['icone:abrir', 'icone:menu', 'icone:mover']);
  assert.equal(canaisDe(principal, /ipcMain\.handle\('([^']+)'/g).length, 0);
  assert.deepEqual(canaisDe(preload, /\.send\('([^']+)'/g), ['icone:abrir', 'icone:menu', 'icone:mover']);
  // Cada tratador confere que a mensagem veio da janela do ícone.
  assert.equal((principal.match(/doIcone\(evento\)/g) || []).length, 3);
});

test('janelaPrincipal.js: cada tratador confere a origem (somenteDaJanela)', () => {
  const codigo = ler('src', 'main', 'janelaPrincipal.js');
  const total = (codigo.match(/ipcMain\.handle\(/g) || []).length;
  assert.equal((codigo.match(/ipcMain\.handle\('[^']+', somenteDaJanela\(/g) || []).length, total);
});

// ---------------------------------------------------------------------------
// Segurança: todas as BrowserWindow do projeto
// ---------------------------------------------------------------------------

function arquivosJs(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? arquivosJs(path.join(pasta, e.name)) : /\.js$/.test(e.name) ? [path.join(pasta, e.name)] : []));
}

test('toda BrowserWindow tem contextIsolation true, nodeIntegration false e sandbox true', () => {
  const comJanela = arquivosJs(path.join(raiz, 'src', 'main')).filter((f) => fs.readFileSync(f, 'utf8').includes('new BrowserWindow('));
  assert.deepEqual(comJanela.map((f) => path.basename(f)).sort(), ['iconeFlutuante.js', 'janelaPrincipal.js']);
  for (const arquivo of comJanela) {
    const codigo = fs.readFileSync(arquivo, 'utf8');
    const janelas = (codigo.match(/new BrowserWindow\(/g) || []).length;
    const nome = path.basename(arquivo);
    assert.equal((codigo.match(/contextIsolation: true/g) || []).length, janelas, `${nome}: contextIsolation`);
    assert.equal((codigo.match(/nodeIntegration: false/g) || []).length, janelas, `${nome}: nodeIntegration`);
    assert.equal((codigo.match(/sandbox: true/g) || []).length, janelas, `${nome}: sandbox`);
    // Nada de conteúdo remoto: sem navegação, sem novas janelas, sem permissões.
    assert.equal((codigo.match(/will-navigate', \(evento\) => evento\.preventDefault\(\)/g) || []).length, janelas, `${nome}: will-navigate`);
    assert.equal((codigo.match(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/g) || []).length, janelas, `${nome}: window.open`);
    assert.equal((codigo.match(/setPermissionRequestHandler\(\(_conteudo, _permissao, responder\) => responder\(false\)\)/g) || []).length, janelas, `${nome}: permissões`);
    assert.doesNotMatch(codigo, /nodeIntegration: true|contextIsolation: false|sandbox: false|webSecurity: false/);
  }
});

test('o ícone flutuante: 48x48, sem moldura, transparente, sempre por cima, fora da barra de tarefas e sem foco', () => {
  const codigo = ler('src', 'main', 'iconeFlutuante.js');
  for (const trecho of ['frame: false', 'transparent: true', 'resizable: false', 'alwaysOnTop: true', 'skipTaskbar: true', 'focusable: false', 'showInactive()']) {
    assert.ok(codigo.includes(trecho), trecho);
  }
  assert.ok(codigo.includes('width: TAMANHO_ICONE') && codigo.includes('height: TAMANHO_ICONE'));
  assert.doesNotMatch(codigo, /\.focus\(\)/); // nunca pede o foco
});

test('janela principal: título, tamanhos e a página certa', () => {
  const codigo = ler('src', 'main', 'janelaPrincipal.js');
  for (const trecho of ["title: 'TextCDSP'", 'width: 1100', 'height: 720', 'minWidth: 860', 'minHeight: 560', 'caminhos.preloadPrincipal', 'caminhos.paginaPrincipal']) {
    assert.ok(codigo.includes(trecho), trecho);
  }
});

test('o ícone usa pointer events e não -webkit-app-region (que engole o clique)', () => {
  const dir = path.join(raiz, 'src', 'renderer', 'icone');
  // Sem os comentários (que explicam justamente por que não se usa app-region).
  const semComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  const tudo = fs.readdirSync(dir).map((n) => semComentarios(fs.readFileSync(path.join(dir, n), 'utf8'))).join('\n');
  assert.match(tudo, /setPointerCapture/);
  assert.match(tudo, /pointerdown/);
  assert.match(tudo, /pointermove/);
  assert.match(tudo, /pointerup/);
  assert.doesNotMatch(tudo, /app-region/);
});

test('as páginas têm Content-Security-Policy e nenhuma carrega conteúdo remoto', () => {
  const pastas = [path.join(raiz, 'src', 'renderer', 'principal'), path.join(raiz, 'src', 'renderer', 'icone')];
  for (const pasta of pastas) {
    const html = fs.readFileSync(path.join(pasta, 'index.html'), 'utf8');
    assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
    for (const nome of fs.readdirSync(pasta)) {
      assert.doesNotMatch(fs.readFileSync(path.join(pasta, nome), 'utf8'), /https?:\/\//, nome);
    }
  }
});
