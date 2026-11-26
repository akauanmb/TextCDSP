'use strict';

// Baixa o Espanso portable fixado em espanso.lock.json e extrai em vendor/espanso/.
// Sem dependências npm. Idempotente: se vendor/espanso/VERSAO.txt já tiver a versão do lock, não faz nada.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const arquivoLock = path.join(raiz, 'espanso.lock.json');
const destino = path.join(raiz, 'vendor', 'espanso');
const arquivoVersao = path.join(destino, 'VERSAO.txt');

function falhar(mensagem) {
  console.error(`ERRO: ${mensagem}`);
  process.exit(1);
}

function lerLock() {
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(arquivoLock, 'utf8'));
  } catch (e) {
    falhar(`não foi possível ler espanso.lock.json (${e.message}).`);
  }
  for (const chave of ['versao', 'url', 'sha256']) {
    if (typeof lock[chave] !== 'string' || !lock[chave]) {
      falhar(`espanso.lock.json sem a chave "${chave}".`);
    }
  }
  if (!/^https:\/\//.test(lock.url)) falhar('a url do lock precisa ser https.');
  if (!/^[0-9a-f]{64}$/.test(lock.sha256)) falhar('o sha256 do lock precisa ter 64 caracteres hexadecimais minúsculos.');
  return lock;
}

function baixar(url, arquivo, redirecionamentos = 0) {
  return new Promise((resolve, reject) => {
    if (redirecionamentos > 5) return reject(new Error('redirecionamentos demais'));
    const req = https.get(url, { headers: { 'User-Agent': 'textcdsp-dev' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const proxima = new URL(res.headers.location, url).toString();
        if (!proxima.startsWith('https://')) return reject(new Error('redirecionamento para endereço não https'));
        return resolve(baixar(proxima, arquivo, redirecionamentos + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`o servidor respondeu HTTP ${res.statusCode}`));
      }
      const saida = fs.createWriteStream(arquivo);
      res.pipe(saida);
      saida.on('finish', () => saida.close(resolve));
      saida.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function calcularSha256(arquivo) {
  return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
}

function aspas(texto) {
  return `'${String(texto).replace(/'/g, "''")}'`;
}

async function principal() {
  const lock = lerLock();

  if (fs.existsSync(arquivoVersao) && fs.readFileSync(arquivoVersao, 'utf8').trim() === lock.versao) {
    console.log(`Espanso ${lock.versao} já está em vendor/espanso. Nada a fazer.`);
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-espanso-'));
  const zip = path.join(temp, 'espanso.zip');
  const extraido = path.join(temp, 'extraido');
  try {
    console.log(`Baixando Espanso ${lock.versao}...`);
    try {
      await baixar(lock.url, zip);
    } catch (e) {
      falhar(`falha ao baixar ${lock.url}: ${e.message}`);
    }

    const calculado = calcularSha256(zip);
    if (calculado !== lock.sha256) {
      falhar(
        `o sha256 do arquivo baixado não confere. Esperado: ${lock.sha256}. Obtido: ${calculado}. ` +
          'Nada foi extraído. Se a versão foi trocada de propósito, atualize o espanso.lock.json.'
      );
    }
    console.log('sha256 conferido.');

    try {
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command',
          `Expand-Archive -LiteralPath ${aspas(zip)} -DestinationPath ${aspas(extraido)} -Force`],
        { stdio: 'pipe', windowsHide: true }
      );
    } catch (e) {
      falhar(`falha ao extrair o zip com Expand-Archive: ${(e.stderr || e.message).toString().trim()}`);
    }

    fs.rmSync(destino, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.cpSync(extraido, destino, { recursive: true });
    fs.writeFileSync(arquivoVersao, `${lock.versao}\n`, 'utf8');
    console.log(`Espanso ${lock.versao} extraído em vendor/espanso.`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

principal().catch((e) => falhar(e.message));
