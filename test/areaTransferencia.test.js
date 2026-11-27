'use strict';

// A área de transferência do Electron 45 é assíncrona e só aceita ClipboardItem (docs/WINDOWS-NOTAS.md). Estas
// verificações estáticas impedem a volta do formato antigo, que fazia o "Copiar texto" falhar com HTML.
// O comportamento no Electron real foi verificado à parte (ver WINDOWS-NOTAS.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const pastaMain = path.join(raiz, 'src', 'main');
const ler = (arquivo) => fs.readFileSync(path.join(pastaMain, arquivo), 'utf8');
const arquivosMain = fs.readdirSync(pastaMain).filter((n) => n.endsWith('.js'));

// Sem os comentários, que explicam justamente o que não se deve usar.
const semComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('só areaTransferencia.js importa o clipboard do Electron', () => {
  const importam = arquivosMain.filter((n) => /const\s*\{[^}]*\bclipboard\b[^}]*\}\s*=\s*require\('electron'\)/.test(ler(n)));
  assert.deepEqual(importam, ['areaTransferencia.js']);
});

test('areaTransferencia.js não usa a API antiga do clipboard', () => {
  const codigo = semComentarios(ler('areaTransferencia.js'));
  for (const antigo of ['readHTML', 'readRTF', 'readImage', 'writeHTML', 'availableFormats', 'clipboard.write({']) {
    assert.ok(!codigo.includes(antigo), antigo);
  }
  // write sempre recebe uma lista de ClipboardItem.
  assert.ok(codigo.includes('new ClipboardItem('));
  assert.match(codigo, /clipboard\.write\(\[/);
  assert.match(codigo, /clipboard\.write\(instantaneo\.map\(/);
});

test('areaTransferencia.js exporta o que a Biblioteca e o Inserir usam', () => {
  const codigo = ler('areaTransferencia.js');
  assert.match(codigo, /module\.exports = \{ escreverTexto, escreverFormatado, lerTexto, guardar, restaurar \}/);
});

test('a cópia da Biblioteca grava pela areaTransferencia e espera a gravação terminar', () => {
  const codigo = semComentarios(ler('janelaPrincipal.js'));
  assert.ok(codigo.includes("require('./areaTransferencia')"));
  assert.match(codigo, /await areaTransferencia\.escreverFormatado\(/);
  assert.match(codigo, /await areaTransferencia\.escreverTexto\(/);
});

test('o guardar ignora os formatos internos do Electron', () => {
  assert.match(ler('areaTransferencia.js'), /startsWith\('electron application\/'\)/);
});
