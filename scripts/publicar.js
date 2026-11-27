'use strict';

// Publica o instalador na pasta compartilhada: npm run publicar -- <pasta-fonte>
// Copia dist\TextCDSP-Setup-<versao>.exe para <pasta-fonte>\_instalador\ e grava o versao.json, pedindo as notas
// pelo terminal. A versão é a do package.json. Os apps instalados avisam quando essa versão for maior que a deles
// (src/main/atualizacao.js). O formato do versao.json está em src/shared/versaoInstalador.js.
//
// Ordem de gravação: primeiro o .exe (para um arquivo temporário e depois o nome final), por último o versao.json
// (também por arquivo temporário). Assim nenhum app enxerga uma versão anunciada sem o instalador completo ao lado.

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { analisarVersao, compararVersoes } = require('../src/shared/semver');
const { lerVersaoJson, montarVersaoJson, TAMANHO_MAXIMO_NOTAS } = require('../src/shared/versaoInstalador');

const PASTA_INSTALADOR = '_instalador';

// Erro esperado (uso errado, arquivo faltando): o terminal mostra só a mensagem, sem pilha.
class ErroPublicar extends Error {}

function hashDoArquivo(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(arquivo)
      .on('error', rejeitar)
      .on('data', (parte) => hash.update(parte))
      .on('end', () => resolver(hash.digest('hex')));
  });
}

async function gravarAtomico(destino, conteudo) {
  const temporario = `${destino}.tmp`;
  await fsp.writeFile(temporario, conteudo, 'utf8');
  await fsp.rename(temporario, destino);
}

/**
 * @param {object} p
 * @param {string} p.pastaFonte  pasta compartilhada de snippets
 * @param {string} p.raiz        raiz do projeto (tem package.json e dist\)
 * @param {string} [p.notas]     texto curto sobre a versão
 * @returns {Promise<{versao: string, arquivo: string, notas: string, sha256: string, bytes: number, destino: string}>}
 */
async function publicar({ pastaFonte, raiz, notas = '' }) {
  const pacote = JSON.parse(await fsp.readFile(path.join(raiz, 'package.json'), 'utf8'));
  const versao = pacote.version;
  if (!analisarVersao(versao)) throw new ErroPublicar(`A versão "${versao}" do package.json não é válida (use o formato 0.2.0).`);

  const arquivo = `TextCDSP-Setup-${versao}.exe`;
  const origem = path.join(raiz, 'dist', arquivo);
  let estatisticas;
  try {
    estatisticas = await fsp.stat(origem);
  } catch {
    estatisticas = null;
  }
  if (!estatisticas || !estatisticas.isFile()) {
    throw new ErroPublicar(`O instalador da versão ${versao} não existe: ${origem}\nGere-o antes com "npm run dist" (confira se a versão do package.json é a que você quer publicar).`);
  }

  try {
    if (!(await fsp.stat(pastaFonte)).isDirectory()) throw new Error('não é pasta');
  } catch {
    throw new ErroPublicar(`A pasta de snippets não existe ou não está acessível: ${pastaFonte}`);
  }

  const textoNotas = String(notas).replace(/\s+/g, ' ').trim();
  if (textoNotas.length > TAMANHO_MAXIMO_NOTAS) {
    throw new ErroPublicar(`As notas têm ${textoNotas.length} caracteres; o máximo é ${TAMANHO_MAXIMO_NOTAS}. Escreva algo mais curto.`);
  }

  const pastaInstalador = path.join(pastaFonte, PASTA_INSTALADOR);
  const arquivoVersao = path.join(pastaInstalador, 'versao.json');

  // Não publica uma versão MENOR que a já publicada: os apps só avisam de versões maiores, então nada aconteceria
  // e a pasta ficaria anunciando a versão errada. Republicar a mesma versão é permitido (troca o .exe).
  try {
    const publicada = lerVersaoJson(await fsp.readFile(arquivoVersao, 'utf8'));
    if (publicada.ok && compararVersoes(publicada.info.versao, versao) > 0) {
      throw new ErroPublicar(`A pasta já anuncia a versão ${publicada.info.versao}, que é maior que a ${versao} do package.json. Nada foi alterado.`);
    }
  } catch (erro) {
    if (erro instanceof ErroPublicar) throw erro;
    // sem versao.json (ou ilegível): é a primeira publicação, ou o arquivo será substituído
  }

  const sha256 = await hashDoArquivo(origem);
  const textoVersao = montarVersaoJson({ versao, arquivo, notas: textoNotas, sha256 });

  await fsp.mkdir(pastaInstalador, { recursive: true });
  const destino = path.join(pastaInstalador, arquivo);
  const parcial = `${destino}.parcial`;
  try {
    await fsp.copyFile(origem, parcial);
    // Confere a cópia: uma pasta de rede pode gravar errado sem avisar, e o app recusa um .exe que não confere.
    if ((await hashDoArquivo(parcial)) !== sha256) throw new ErroPublicar('A cópia do instalador na pasta não confere com o original. Tente de novo.');
    await fsp.rename(parcial, destino);
  } catch (erro) {
    await fsp.rm(parcial, { force: true }).catch(() => {});
    throw erro;
  }
  await gravarAtomico(arquivoVersao, textoVersao);

  return { versao, arquivo, notas: textoNotas, sha256, bytes: estatisticas.size, destino: pastaInstalador };
}

// Lê uma linha do terminal. Sem terminal (entrada vazia ou fechada), devolve "" em vez de ficar esperando.
function perguntar(pergunta) {
  return new Promise((resolver) => {
    const leitor = readline.createInterface({ input: process.stdin, output: process.stdout });
    let respondeu = false;
    leitor.on('close', () => {
      if (!respondeu) resolver('');
    });
    leitor.question(pergunta, (resposta) => {
      respondeu = true;
      leitor.close();
      resolver(resposta);
    });
  });
}

async function principal() {
  const pastaFonte = process.argv[2];
  if (!pastaFonte) {
    console.error('Informe a pasta de snippets (a mesma configurada no TextCDSP).');
    console.error('Uso: npm run publicar -- <pasta-fonte>');
    process.exit(2);
  }
  const raiz = path.resolve(__dirname, '..');

  // Falha rápida: não pede as notas se já se sabe que não dá para publicar.
  const pacote = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  const exe = path.join(raiz, 'dist', `TextCDSP-Setup-${pacote.version}.exe`);
  if (!fs.existsSync(exe)) {
    console.error(`O instalador da versão ${pacote.version} não existe: ${exe}`);
    console.error('Gere-o antes com "npm run dist" (confira se a versão do package.json é a que você quer publicar).');
    process.exit(1);
  }
  if (!fs.existsSync(pastaFonte) || !fs.statSync(pastaFonte).isDirectory()) {
    console.error(`A pasta de snippets não existe ou não está acessível: ${pastaFonte}`);
    process.exit(1);
  }

  console.log(`Publicando o TextCDSP ${pacote.version} em ${pastaFonte}`);
  const notas = await perguntar('Notas desta versão (uma linha, opcional): ');
  const r = await publicar({ pastaFonte, raiz, notas });
  console.log(`Publicado: ${r.arquivo} (${(r.bytes / 1024 / 1024).toFixed(1)} MB) em ${r.destino}`);
  console.log(`versao.json: versão ${r.versao}${r.notas ? `, notas: "${r.notas}"` : ', sem notas'}`);
  console.log('Os apps avisarão na próxima sincronização (até o intervalo configurado, 15 min por padrão).');
}

if (require.main === module) {
  principal().catch((erro) => {
    console.error(erro instanceof ErroPublicar ? erro.message : `Falha ao publicar: ${erro.stack || erro.message}`);
    process.exit(1);
  });
}

module.exports = { publicar, ErroPublicar };
