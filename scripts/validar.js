'use strict';

// Valida uma pasta de snippets: node scripts/validar.js <pasta>   (ou: npm run validar -- <pasta>)
// Lê os .yml da pasta (sem entrar em subpastas e ignorando arquivos iniciados por "_"),
// imprime os problemas como "arquivo:linha [regra] mensagem" e sai com código 1 se houver erro.

const fs = require('node:fs');
const path = require('node:path');
const { validarBiblioteca } = require('../src/shared/validador');

function falharUso(mensagem) {
  console.error(mensagem);
  console.error('Uso: npm run validar -- <pasta>');
  process.exit(2);
}

function formatar(problema) {
  const local = problema.linha ? `${problema.arquivo}:${problema.linha}` : problema.arquivo;
  return `${local} [${problema.regra}] ${problema.mensagem}`;
}

function principal() {
  const pasta = process.argv[2];
  if (!pasta) falharUso('Informe a pasta de snippets.');

  let entradas;
  try {
    entradas = fs.readdirSync(pasta, { withFileTypes: true });
  } catch (e) {
    return falharUso(`Não foi possível ler a pasta "${pasta}": ${e.message}`);
  }

  const arquivos = entradas
    .filter((e) => e.isFile() && /\.yml$/i.test(e.name) && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
    .map((nome) => ({ nome, conteudo: fs.readFileSync(path.join(pasta, nome), 'utf8') }));

  const { erros, avisos, snippets } = validarBiblioteca(arquivos);

  if (erros.length > 0) {
    console.log(`ERROS (${erros.length}):`);
    erros.forEach((p) => console.log(`  ${formatar(p)}`));
  }
  if (avisos.length > 0) {
    if (erros.length > 0) console.log('');
    console.log(`AVISOS (${avisos.length}):`);
    avisos.forEach((p) => console.log(`  ${formatar(p)}`));
  }
  if (erros.length > 0 || avisos.length > 0) console.log('');
  console.log(`${snippets.length} snippets, ${erros.length} erros, ${avisos.length} avisos`);

  process.exit(erros.length > 0 ? 1 : 0);
}

principal();
