'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TAMANHO_ICONE,
  validarPosicaoRecebida,
  posicaoVisivel,
  posicaoPadrao,
  posicaoInicial,
  limitarPosicao,
} = require('../src/shared/posicaoIcone');

const principal = { x: 0, y: 0, width: 1920, height: 1040 }; // 1080 menos a barra de tarefas
const segundo = { x: 1920, y: 0, width: 1280, height: 1024 };
const aEsquerda = { x: -1280, y: 100, width: 1280, height: 1024 }; // monitor à esquerda do principal

test('o ícone tem 48 px', () => {
  assert.equal(TAMANHO_ICONE, 48);
});

test('validarPosicaoRecebida: aceita dois números e arredonda', () => {
  assert.deepEqual(validarPosicaoRecebida({ x: 10, y: 20 }), { x: 10, y: 20 });
  assert.deepEqual(validarPosicaoRecebida({ x: 10.6, y: -3.4 }), { x: 11, y: -3 });
  assert.deepEqual(validarPosicaoRecebida({ x: -1280, y: 0 }), { x: -1280, y: 0 }); // monitor à esquerda: negativo é válido
});

test('validarPosicaoRecebida: recusa o que não for um par de números finitos', () => {
  for (const ruim of [null, undefined, 5, 'x', [], [1, 2], {}, { x: 1 }, { y: 1 }, { x: '1', y: 2 }, { x: NaN, y: 1 }, { x: 1, y: Infinity },
    { x: -Infinity, y: 1 }, { x: 1e9, y: 1 }, { x: 1, y: -1e9 }, { x: null, y: 1 }, { x: {}, y: 1 }]) {
    assert.equal(validarPosicaoRecebida(ruim), null, JSON.stringify(ruim));
  }
});

test('posicaoVisivel: o ícone inteiro dentro da área de trabalho de algum monitor', () => {
  const areas = [principal, segundo];
  assert.equal(posicaoVisivel({ x: 100, y: 100 }, areas), true);
  assert.equal(posicaoVisivel({ x: 0, y: 0 }, areas), true);
  assert.equal(posicaoVisivel({ x: 1920 - 48, y: 1040 - 48 }, areas), true); // encostado no canto
  assert.equal(posicaoVisivel({ x: 2500, y: 500 }, areas), true); // no segundo monitor
});

test('posicaoVisivel: fora de todos os monitores (ou só parte dentro) não vale', () => {
  assert.equal(posicaoVisivel({ x: 3500, y: 500 }, [principal, segundo]), false); // além do segundo monitor
  assert.equal(posicaoVisivel({ x: 2500, y: 500 }, [principal]), false); // segundo monitor desconectado
  assert.equal(posicaoVisivel({ x: -10, y: 10 }, [principal]), false); // parte fora
  assert.equal(posicaoVisivel({ x: 1920 - 47, y: 10 }, [principal]), false);
  assert.equal(posicaoVisivel({ x: 10, y: 1040 - 47 }, [principal]), false); // sobre a barra de tarefas
  assert.equal(posicaoVisivel({ x: 10, y: 10 }, []), false);
  assert.equal(posicaoVisivel(null, [principal]), false);
  assert.equal(posicaoVisivel({ x: NaN, y: 1 }, [principal]), false);
});

test('posicaoVisivel: monitores com coordenadas negativas', () => {
  assert.equal(posicaoVisivel({ x: -600, y: 200 }, [principal, aEsquerda]), true);
  assert.equal(posicaoVisivel({ x: -600, y: 200 }, [principal]), false);
});

test('posicaoPadrao: canto inferior direito, 24 px de margem', () => {
  assert.deepEqual(posicaoPadrao(principal), { x: 1920 - 48 - 24, y: 1040 - 48 - 24 });
  // Monitor principal que não começa em 0,0.
  assert.deepEqual(posicaoPadrao({ x: -1280, y: 100, width: 1280, height: 1024 }), { x: -1280 + 1280 - 72, y: 100 + 1024 - 72 });
});

test('posicaoInicial: usa a salva se estiver visível; senão, o canto do monitor principal', () => {
  const areas = [principal, segundo];
  assert.deepEqual(posicaoInicial({ x: 2500, y: 500 }, areas, principal), { x: 2500, y: 500 });
  // Segundo monitor desconectado: cai no principal.
  assert.deepEqual(posicaoInicial({ x: 2500, y: 500 }, [principal], principal), posicaoPadrao(principal));
  assert.deepEqual(posicaoInicial(null, areas, principal), posicaoPadrao(principal));
  assert.deepEqual(posicaoInicial(undefined, areas, principal), posicaoPadrao(principal));
});

test('limitarPosicao: dentro da área, não mexe', () => {
  assert.deepEqual(limitarPosicao({ x: 300, y: 400 }, [principal]), { x: 300, y: 400 });
});

test('limitarPosicao: arrastar para fora da tela prende o ícone na borda', () => {
  assert.deepEqual(limitarPosicao({ x: -500, y: -500 }, [principal]), { x: 0, y: 0 });
  assert.deepEqual(limitarPosicao({ x: 5000, y: 5000 }, [principal]), { x: 1920 - 48, y: 1040 - 48 });
  assert.deepEqual(limitarPosicao({ x: 1900, y: 1030 }, [principal]), { x: 1920 - 48, y: 1040 - 48 });
});

test('limitarPosicao: escolhe o monitor do centro do ícone, ou o mais próximo', () => {
  const areas = [principal, segundo];
  // Metade em cada monitor: o centro (x = 1920 - 10 + 24) está no segundo; o ícone é puxado para dentro dele.
  assert.deepEqual(limitarPosicao({ x: 1910, y: 100 }, areas), { x: 1920, y: 100 });
  // O centro está no principal: o ícone é puxado para dentro do principal.
  assert.deepEqual(limitarPosicao({ x: 1890, y: 100 }, areas), { x: 1872, y: 100 });
  // Longe de tudo: o monitor mais próximo.
  assert.deepEqual(limitarPosicao({ x: 4000, y: 100 }, areas), { x: 3200 - 48, y: 100 });
});

test('limitarPosicao: sem áreas, devolve a posição como veio', () => {
  assert.deepEqual(limitarPosicao({ x: 7, y: 8 }, []), { x: 7, y: 8 });
  assert.deepEqual(limitarPosicao({ x: 7, y: 8 }, [{ x: 0, y: 0, width: 0, height: 0 }]), { x: 7, y: 8 });
});
