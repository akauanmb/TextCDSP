'use strict';

// Posição do ícone flutuante (Marco 11). Funções puras: recebem as áreas de trabalho dos monitores
// ({ x, y, width, height }, como em screen.getAllDisplays()[i].workArea) e devolvem posições.
// Nada aqui importa Electron nem acessa disco.

const TAMANHO_ICONE = 48;
const MARGEM_PADRAO = 24;

const ehNumeroFinito = (n) => typeof n === 'number' && Number.isFinite(n);
const ehArea = (a) => a && ehNumeroFinito(a.x) && ehNumeroFinito(a.y) && ehNumeroFinito(a.width) && ehNumeroFinito(a.height) && a.width > 0 && a.height > 0;

/**
 * Confere os números que a página do ícone manda ao arrastar. Devolve { x, y } inteiros ou null.
 * Recusa o que não for objeto com dois números finitos (nada de texto, NaN ou Infinity) e valores absurdos.
 */
function validarPosicaoRecebida(entrada, limite = 100000) {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const { x, y } = entrada;
  if (!ehNumeroFinito(x) || !ehNumeroFinito(y) || Math.abs(x) > limite || Math.abs(y) > limite) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/** O ícone inteiro cabe dentro da área de trabalho de algum monitor? */
function posicaoVisivel(posicao, areas, tamanho = TAMANHO_ICONE) {
  if (!posicao || !ehNumeroFinito(posicao.x) || !ehNumeroFinito(posicao.y)) return false;
  return (areas || []).filter(ehArea).some((a) =>
    posicao.x >= a.x && posicao.y >= a.y && posicao.x + tamanho <= a.x + a.width && posicao.y + tamanho <= a.y + a.height);
}

/** Canto inferior direito da área de trabalho, com margem. */
function posicaoPadrao(areaPrimaria, tamanho = TAMANHO_ICONE, margem = MARGEM_PADRAO) {
  return { x: areaPrimaria.x + areaPrimaria.width - tamanho - margem, y: areaPrimaria.y + areaPrimaria.height - tamanho - margem };
}

/**
 * Onde mostrar o ícone: na posição salva, se ela estiver numa área de trabalho; senão, no canto
 * inferior direito do monitor principal (monitor desconectado, resolução menor...).
 */
function posicaoInicial(salva, areas, areaPrimaria, tamanho = TAMANHO_ICONE, margem = MARGEM_PADRAO) {
  return posicaoVisivel(salva, areas, tamanho) ? { x: salva.x, y: salva.y } : posicaoPadrao(areaPrimaria, tamanho, margem);
}

// Distância do ponto ao retângulo (0 se estiver dentro).
function distanciaAteArea(px, py, a) {
  const dx = Math.max(a.x - px, 0, px - (a.x + a.width));
  const dy = Math.max(a.y - py, 0, py - (a.y + a.height));
  return Math.hypot(dx, dy);
}

/**
 * Limita o arraste à área de trabalho: escolhe o monitor onde está o centro do ícone (ou o mais próximo) e
 * mantém o ícone inteiro dentro dele. Sem nenhuma área válida, devolve a posição como veio.
 */
function limitarPosicao(posicao, areas, tamanho = TAMANHO_ICONE) {
  const validas = (areas || []).filter(ehArea);
  if (validas.length === 0) return { x: posicao.x, y: posicao.y };
  const cx = posicao.x + tamanho / 2;
  const cy = posicao.y + tamanho / 2;
  const area = validas.reduce((melhor, a) => (distanciaAteArea(cx, cy, a) < distanciaAteArea(cx, cy, melhor) ? a : melhor));
  const maxX = Math.max(area.x, area.x + area.width - tamanho);
  const maxY = Math.max(area.y, area.y + area.height - tamanho);
  return { x: Math.min(Math.max(posicao.x, area.x), maxX), y: Math.min(Math.max(posicao.y, area.y), maxY) };
}

module.exports = { TAMANHO_ICONE, MARGEM_PADRAO, validarPosicaoRecebida, posicaoVisivel, posicaoPadrao, posicaoInicial, limitarPosicao };
