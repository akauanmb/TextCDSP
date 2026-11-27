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

// Só o código ATIVO: o que está comentado (como a opção de pasta compartilhada, desativada em 27/11/2026) não conta.
const semComentariosJs = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const semComentariosHtml = (texto) => texto.replace(/<!--[\s\S]*?-->/g, '');
const htmlPrincipalCru = ler('src', 'renderer', 'principal', 'index.html');
const htmlPrincipal = semComentariosHtml(htmlPrincipalCru);
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
  assert.deepEqual(ordem, ['busca.js', 'arvore.js', 'inserir.js', ...scriptsDaPagina]);
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
const idsCriadosPelosScripts = (nome) => [...semComentariosJs(ler('src', 'renderer', 'principal', nome)).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]);

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
    const codigo = semComentariosJs(ler('src', 'renderer', 'principal', nome));
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
    'biblioteca:copiar', 'biblioteca:inserir', 'biblioteca:listar', 'config:ler', 'config:salvar', 'fonte:escolher', 'fonte:testar',
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

test('o Inserir: canal só da janela principal; o texto sai do processo principal, nunca da página', () => {
  const codigo = ler('src', 'main', 'janelaPrincipal.js');
  assert.match(codigo, /ipcMain\.handle\('biblioteca:inserir', somenteDaJanela\(/);
  // O tratador usa o id para montar o texto (prepararInsercao) e só passa adiante o que ela devolveu.
  const trecho = codigo.slice(codigo.indexOf("'biblioteca:inserir'"), codigo.indexOf("'pessoal:salvar'"));
  assert.match(trecho, /prepararInsercao\(caminhos, pedido\)/);
  assert.match(trecho, /inserirTexto\(\{ texto: preparo\.texto, trigger: preparo\.trigger \}\)/);
  assert.doesNotMatch(trecho, /pedido\.texto/);
  // A página manda só { id }.
  assert.match(ler('src', 'preload', 'principal.js'), /inserir: \(pedido\) => ipcRenderer\.invoke\('biblioteca:inserir', pedido\)/);
  assert.match(ler('src', 'renderer', 'principal', 'biblioteca.js'), /api\.inserir\(\{ id: s\.id \}\)/);
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

// ---------------------------------------------------------------------------
// Pasta compartilhada: desativada na interface, código mantido (27/11/2026)
// ---------------------------------------------------------------------------

const TAG = '[PASTA-COMPARTILHADA-DESATIVADA]';
const jsConfiguracoes = ler('src', 'renderer', 'principal', 'configuracoes.js');

test('pasta compartilhada: a opção NÃO aparece na interface (nenhum dos elementos está no HTML ativo)', () => {
  for (const id of ['fonte', 'escolher', 'testar', 'resultado-teste', 'titulo-pasta']) {
    assert.ok(!idsDoHtml.includes(id), `#${id} ainda está ativo no HTML`);
  }
  assert.doesNotMatch(htmlPrincipal, /Pasta de snippets oficiais|Escolher\.\.\.|Testar/);
  // O resto das Configurações continua: opções, salvar e situação.
  for (const id of ['intervalo', 'iniciar-windows', 'minimizar-icone', 'modo-admin', 'config-salvar', 'sincronizar', 'status-texto']) {
    assert.ok(idsDoHtml.includes(id), id);
  }
});

test('pasta compartilhada: o cartão continua no HTML, só comentado e marcado (para reativar depois)', () => {
  assert.ok(htmlPrincipalCru.includes(TAG));
  const comentarios = [...htmlPrincipalCru.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
  const doCartao = comentarios.find((c) => c.includes(TAG));
  assert.ok(doCartao, 'um comentário HTML com a marca');
  for (const trecho of ['id="fonte"', 'id="escolher"', 'id="testar"', 'id="resultado-teste"', 'Pasta de snippets oficiais', 'aria-labelledby="titulo-pasta"']) {
    assert.ok(doCartao.includes(trecho), trecho);
  }
});

test('pasta compartilhada: o código da página não a usa mais, mas o código dela continua lá, comentado e marcado', () => {
  const ativo = semComentariosJs(jsConfiguracoes);
  for (const usado of ["$('fonte')", "$('escolher')", "$('testar')", 'escolherFonte', 'testarFonte', 'fonteSnippets', 'mostrarTeste', 'resultado-teste']) {
    assert.ok(!ativo.includes(usado), `"${usado}" ainda está no código ativo`);
  }
  // Tudo que foi desativado continua no arquivo, para o caso de a escolha ser revogada.
  for (const guardado of ["fonte: $('fonte')", "escolher: $('escolher')", "testar: $('testar')", 'api.escolherFonte()', 'api.testarFonte(', 'fonteSnippets: campos.fonte.value', 'function mostrarTeste(', "campos.fonte.value = config.fonteSnippets"]) {
    assert.ok(jsConfiguracoes.includes(guardado), `"${guardado}" foi apagado em vez de comentado`);
  }
  assert.ok((jsConfiguracoes.match(/\[PASTA-COMPARTILHADA-DESATIVADA\]/g) || []).length >= 6);
});

test('pasta compartilhada: salvar as Configurações não manda mais a pasta, e a pasta já configurada não é apagada', () => {
  const ativo = semComentariosJs(jsConfiguracoes);
  const salvar = ativo.slice(ativo.indexOf('api.salvarConfig({'), ativo.indexOf('});', ativo.indexOf('api.salvarConfig({')));
  assert.ok(!salvar.includes('fonteSnippets'));
  for (const chave of ['intervaloSyncMin', 'iniciarComWindows', 'minimizarParaIcone', 'modoAdmin']) assert.ok(salvar.includes(chave), chave);
});

test('pasta compartilhada: a lógica de fundo continua ativa (canais IPC, preload, sincronização e config)', () => {
  assert.match(ler('src', 'main', 'janelaPrincipal.js'), /ipcMain\.handle\('fonte:escolher'/);
  assert.match(ler('src', 'main', 'janelaPrincipal.js'), /ipcMain\.handle\('fonte:testar'/);
  assert.match(ler('src', 'preload', 'principal.js'), /escolherFonte: \(\) => ipcRenderer\.invoke\('fonte:escolher'\)/);
  assert.match(ler('src', 'preload', 'principal.js'), /testarFonte: \(pasta\) => ipcRenderer\.invoke\('fonte:testar', pasta\)/);
  assert.match(ler('src', 'main', 'sincronizacao.js'), /const configurada = String\(obterConfig\(\)\.fonteSnippets/);
  assert.match(ler('src', 'main', 'config.js'), /fonteSnippets: ''/);
});

test('pasta compartilhada: a primeira execução não abre mais as Configurações; o código está comentado e marcado', () => {
  const index = ler('src', 'main', 'index.js');
  assert.ok(index.includes(TAG));
  const ativo = semComentariosJs(index);
  assert.doesNotMatch(ativo, /if \(!configuracao\.fonteSnippets\)/);
  assert.match(index, /\/\/ if \(!configuracao\.fonteSnippets\) janelaPrincipal\.abrir\('configuracoes'\);/);
  // A notificação de erro na fonte ainda leva às Configurações (a Situação mostra os erros).
  assert.match(ativo, /notificacao\.on\('click', \(\) => janelaPrincipal\.abrir\('configuracoes'\)\)/);
});
