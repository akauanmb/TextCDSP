'use strict';

// Valida uma pasta de snippets: node scripts/validar.js <pasta>   (ou: npm run validar -- <pasta>)
// Lê os .yml da pasta e das subpastas, com a MESMA função da sincronização (lerFonte): ignora arquivos
// iniciados por "_", pastas iniciadas por "_" ou "." (_historico, _instalador) e o que não for .yml.
// Imprime os problemas como "arquivo:linha [regra] mensagem" e sai com código 1 se houver erro.

const { validarBiblioteca } = require('../src/shared/validador');
const { lerFonte, descreverErroDeArquivo } = require('../src/main/sincronizacao');

function falharUso(mensagem) {
  console.error(mensagem);
  console.error('Uso: npm run validar -- <pasta>');
  process.exit(2);
}

function formatar(problema) {
  const local = problema.linha ? `${problema.arquivo}:${problema.linha}` : problema.arquivo;
  return `${local} [${problema.regra}] ${problema.mensagem}`;
}

async function principal() {
  const pasta = process.argv[2];
  if (!pasta) falharUso('Informe a pasta de snippets.');

  let arquivos;
  try {
    arquivos = await lerFonte(pasta);
  } catch (e) {
    return falharUso(`Não foi possível ler a pasta "${pasta}": ${descreverErroDeArquivo(e)}`);
  }

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

principal().catch((e) => {
  console.error(`Falha ao validar: ${e.message}`);
  process.exit(2);
});
