'use strict';

// Confere a configuração do instalador e dos avisos de licença sem precisar gerar o .exe.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarCaminhos } = require('../src/main/caminhos');

const raiz = path.resolve(__dirname, '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');
const pacote = JSON.parse(lerTexto('package.json'));
const lock = JSON.parse(lerTexto('espanso.lock.json'));
const build = pacote.build;

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

test('script "dist": baixa o motor e depois gera o instalador NSIS', () => {
  assert.equal(pacote.scripts.dist, 'node scripts/baixar-espanso.js && electron-builder --win nsis');
});

test('identidade do aplicativo', () => {
  assert.equal(build.appId, 'textcdsp.cdsp');
  assert.equal(build.productName, 'TextCDSP');
  assert.equal(pacote.productName, 'TextCDSP'); // o Electron usa este nome (userData, entrada de início, etc.)
});

test('alvo: NSIS x64 com o ícone do projeto', () => {
  assert.deepEqual(build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(build.win.icon, 'assets/icone.ico');
  assert.ok(fs.existsSync(path.join(raiz, build.win.icon)));
});

test('NSIS: por usuário, sem administrador, sem atalho na área de trabalho', () => {
  const n = build.nsis;
  assert.equal(n.oneClick, true);
  assert.equal(n.perMachine, false);
  assert.equal(n.allowElevation, false);
  assert.equal(n.createDesktopShortcut, false);
  assert.equal(n.createStartMenuShortcut, true);
  assert.equal(n.runAfterFinish, true);
});

test('NSIS: nome do instalador e script personalizado', () => {
  assert.equal(build.nsis.artifactName, 'TextCDSP-Setup-${version}.exe');
  assert.equal(build.nsis.include, 'build/installer.nsh');
  assert.ok(fs.existsSync(path.join(raiz, build.nsis.include)));
});

test('os dados do usuário (%APPDATA%\\TextCDSP) não são apagados na desinstalação', () => {
  // A pasta de dados tem o mesmo nome do app: se esta opção ligasse, o pessoal.yml seria apagado.
  assert.equal(build.nsis.deleteAppDataOnUninstall, false);
});

test('files: só src, assets, package.json e snippets/exemplos.yml', () => {
  assert.deepEqual(build.files, ['src/**/*', 'assets/**/*', 'package.json', 'snippets/exemplos.yml']);
  for (const proibido of ['test', 'docs', 'scripts', 'vendor', 'dist', 'node_modules']) {
    assert.ok(!build.files.some((f) => f.startsWith(`${proibido}/`) || f === proibido), `${proibido} não pode ir no pacote`);
  }
});

test('extraResources: o motor vai para resources\\espanso e os avisos para resources\\', () => {
  assert.deepEqual(build.extraResources, [
    { from: 'vendor/espanso', to: 'espanso' },
    { from: 'THIRD_PARTY_NOTICES.txt', to: 'THIRD_PARTY_NOTICES.txt' },
  ]);
});

test('electron e electron-builder são só de desenvolvimento; yaml é a única dependência de execução', () => {
  assert.deepEqual(Object.keys(pacote.dependencies), ['yaml']);
  assert.ok(pacote.devDependencies.electron);
  assert.ok(pacote.devDependencies['electron-builder']);
});

// ---------------------------------------------------------------------------
// build/installer.nsh
// ---------------------------------------------------------------------------

const nsh = lerTexto('build', 'installer.nsh');
const nshSemComentarios = nsh.split(/\r?\n/).filter((l) => !l.trim().startsWith(';')).join('\n');

test('installer.nsh: antes de remover, fecha o app, para o motor e tira o início automático', () => {
  assert.match(nshSemComentarios, /!macro customUnInstall/);
  assert.match(nshSemComentarios, /taskkill\.exe" \/F \/IM "\$\{APP_EXECUTABLE_FILENAME\}"/);
  assert.match(nshSemComentarios, /espanso-portable\\espansod\.exe" service stop/);
  assert.match(nshSemComentarios, /DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "TextCDSP"/);
});

test('installer.nsh: só encerra o motor que roda de %APPDATA%\\TextCDSP\\engine (critério por pasta)', () => {
  assert.match(nshSemComentarios, /\$APPDATA\\TextCDSP\\engine\\\*/);
  // Nunca por nome: isso derrubaria um Espanso instalado pelo próprio usuário.
  assert.doesNotMatch(nshSemComentarios, /taskkill[^\n]*espansod/i);
});

test('installer.nsh: não apaga nada dos dados do usuário', () => {
  assert.doesNotMatch(nshSemComentarios, /RMDir/i);
  assert.doesNotMatch(nshSemComentarios, /Delete\s+["`][^\n]*APPDATA/i);
  assert.doesNotMatch(nshSemComentarios, /pessoal\.yml/i);
});

// ---------------------------------------------------------------------------
// Avisos de licença
// ---------------------------------------------------------------------------

const avisos = lerTexto('THIRD_PARTY_NOTICES.txt');

test('avisos: citam a versão fixada em espanso.lock.json, a release e o código-fonte', () => {
  assert.ok(avisos.includes(`Versão incluída:     ${lock.versao}`), 'versão do Espanso');
  assert.ok(avisos.includes(`https://github.com/espanso/espanso/releases/tag/v${lock.versao}`), 'release');
  assert.ok(avisos.includes(`https://github.com/espanso/espanso/tree/v${lock.versao}`), 'código-fonte');
  assert.ok(avisos.includes(`https://github.com/espanso/espanso/archive/refs/tags/v${lock.versao}.zip`), 'zip do código-fonte');
  assert.ok(avisos.includes(lock.sha256), 'sha256 do arquivo distribuído');
});

test('avisos: aviso da GPL-3 e texto completo da licença', () => {
  assert.match(avisos, /GNU General Public License, versão 3/);
  assert.match(avisos, /SEM NENHUMA GARANTIA/);
  assert.match(avisos, /\bGNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.match(avisos, /END OF TERMS AND CONDITIONS/);
  assert.match(avisos, /nenhuma\. O TextCDSP inclui o Espanso exatamente como/); // sem modificações
});

test('avisos: também citam o Electron e a biblioteca yaml', () => {
  assert.match(avisos, /Electron/);
  assert.match(avisos, /LICENSE\.electron\.txt/);
  assert.match(avisos, /"yaml"/);
  assert.match(avisos, /Copyright Eemeli Aro/);
});

// ---------------------------------------------------------------------------
// Caminhos: desenvolvimento e instalado
// ---------------------------------------------------------------------------

test('caminhos em desenvolvimento: motor em vendor\\ e avisos na raiz do projeto', () => {
  const c = criarCaminhos({ empacotado: false, appPath: 'C:\\proj', userData: 'C:\\dados\\TextCDSP' });
  assert.equal(c.origem, path.join('C:\\proj', 'vendor', 'espanso'));
  assert.equal(c.origemVersao, path.join('C:\\proj', 'vendor', 'espanso', 'VERSAO.txt'));
  assert.equal(c.avisos, path.join('C:\\proj', 'THIRD_PARTY_NOTICES.txt'));
});

test('caminhos instalado: motor e avisos em resources\\, fora do app.asar', () => {
  const c = criarCaminhos({
    empacotado: true,
    resourcesPath: 'C:\\Users\\x\\AppData\\Local\\Programs\\TextCDSP\\resources',
    appPath: 'C:\\Users\\x\\AppData\\Local\\Programs\\TextCDSP\\resources\\app.asar',
    userData: 'C:\\Users\\x\\AppData\\Roaming\\TextCDSP',
  });
  assert.equal(c.origem, path.join('C:\\Users\\x\\AppData\\Local\\Programs\\TextCDSP\\resources', 'espanso'));
  assert.equal(c.origemPortable, path.join(c.origem, 'espanso-portable'));
  assert.equal(c.avisos, path.join('C:\\Users\\x\\AppData\\Local\\Programs\\TextCDSP\\resources', 'THIRD_PARTY_NOTICES.txt'));
  assert.ok(!c.avisos.includes('app.asar'));
  assert.ok(!c.exe.includes('app.asar')); // o executável do motor roda de engine\, nunca de dentro do asar
});

test('o motor em uso fica sempre em %APPDATA%\\TextCDSP\\engine, instalado ou não', () => {
  for (const empacotado of [true, false]) {
    const c = criarCaminhos({ empacotado, resourcesPath: 'C:\\r', appPath: 'C:\\a', userData: 'C:\\dados\\TextCDSP' });
    assert.equal(c.engine, path.join('C:\\dados\\TextCDSP', 'engine'));
    assert.equal(c.exe, path.join('C:\\dados\\TextCDSP', 'engine', 'espanso-portable', 'espansod.exe'));
  }
});
