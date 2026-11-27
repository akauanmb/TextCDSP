'use strict';

// Comparação de versões no formato semver (https://semver.org), sem dependência.
// Função pura: usada para decidir se a versão publicada na pasta compartilhada é mais nova que a instalada.

const PADRAO = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Lê "maior.menor.correcao[-preliberacao][+build]". Devolve null se o texto não for uma versão válida.
 * Não aceita "v" na frente nem versões incompletas como "1.2". O "+build" é aceito e ignorado na comparação.
 */
function analisarVersao(texto) {
  if (typeof texto !== 'string') return null;
  const m = PADRAO.exec(texto);
  if (!m) return null;
  const numeros = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!numeros.every(Number.isSafeInteger)) return null;
  return { maior: numeros[0], menor: numeros[1], correcao: numeros[2], preLiberacao: m[4] ? m[4].split('.') : [] };
}

const ehNumerico = (identificador) => /^\d+$/.test(identificador);

// Regra do semver para a parte depois do "-": números vêm antes de textos; conjunto menor vem antes do maior
// se o início for igual (1.0.0-alfa < 1.0.0-alfa.1).
function compararPreLiberacao(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] === b[i]) continue;
    const numA = ehNumerico(a[i]);
    const numB = ehNumerico(b[i]);
    if (numA && numB) return Number(a[i]) < Number(b[i]) ? -1 : 1;
    if (numA) return -1;
    if (numB) return 1;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Devolve -1, 0 ou 1 (a menor, igual ou maior que b). Lança erro se alguma das versões for inválida:
 * quem chama deve validar com analisarVersao antes quando o texto vem de fora.
 */
function compararVersoes(a, b) {
  const va = analisarVersao(a);
  const vb = analisarVersao(b);
  if (!va) throw new Error(`Versão inválida: ${JSON.stringify(a)}`);
  if (!vb) throw new Error(`Versão inválida: ${JSON.stringify(b)}`);
  for (const parte of ['maior', 'menor', 'correcao']) {
    if (va[parte] !== vb[parte]) return va[parte] < vb[parte] ? -1 : 1;
  }
  // Com a mesma base, uma versão sem pré-liberação é MAIOR (1.0.0 > 1.0.0-rc.1).
  if (va.preLiberacao.length === 0 && vb.preLiberacao.length === 0) return 0;
  if (va.preLiberacao.length === 0) return 1;
  if (vb.preLiberacao.length === 0) return -1;
  return compararPreLiberacao(va.preLiberacao, vb.preLiberacao);
}

/** true se `candidata` é uma versão válida e maior que `atual`. Qualquer entrada inválida dá false. */
function ehVersaoMaior(candidata, atual) {
  if (!analisarVersao(candidata) || !analisarVersao(atual)) return false;
  return compararVersoes(candidata, atual) > 0;
}

module.exports = { analisarVersao, compararVersoes, ehVersaoMaior };
