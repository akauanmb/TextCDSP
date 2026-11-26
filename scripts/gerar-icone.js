'use strict';

// Gera assets/icone.ico (letras "TC" brancas sobre fundo azul, 16/32/256 px).
// Uso: node scripts/gerar-icone.js
// Sem dependências: o PNG é montado com zlib e o .ico guarda um PNG por tamanho.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const TAMANHOS = [16, 32, 256];
const AMOSTRAS = 4; // 4x4 subpixels por pixel, para suavizar as bordas
const AZUL = [31, 78, 121];
const BRANCO = [255, 255, 255];

// Formas em coordenadas de 0 a 1.
function dentroDoFundo(x, y) {
  const raio = 0.2;
  const cx = Math.min(Math.max(x, raio), 1 - raio);
  const cy = Math.min(Math.max(y, raio), 1 - raio);
  return Math.hypot(x - cx, y - cy) <= raio;
}

function dentroDaLetra(x, y) {
  // T: barra no alto e haste no meio.
  const barraT = x >= 0.08 && x <= 0.42 && y >= 0.28 && y <= 0.37;
  const hasteT = x >= 0.205 && x <= 0.295 && y >= 0.28 && y <= 0.72;
  if (barraT || hasteT) return true;
  // C: anel com abertura de 40 graus para cada lado, à direita.
  const dx = x - 0.68;
  const dy = y - 0.5;
  const d = Math.hypot(dx, dy);
  if (d < 0.13 || d > 0.22) return false;
  const anguloAbertura = (40 * Math.PI) / 180;
  return !(dx > 0 && Math.abs(Math.atan2(dy, dx)) < anguloAbertura);
}

function desenhar(tamanho) {
  const rgba = Buffer.alloc(tamanho * tamanho * 4);
  const total = AMOSTRAS * AMOSTRAS;
  for (let py = 0; py < tamanho; py++) {
    for (let px = 0; px < tamanho; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const x = (px + (sx + 0.5) / AMOSTRAS) / tamanho;
          const y = (py + (sy + 0.5) / AMOSTRAS) / tamanho;
          if (!dentroDoFundo(x, y)) continue;
          const cor = dentroDaLetra(x, y) ? BRANCO : AZUL;
          r += cor[0];
          g += cor[1];
          b += cor[2];
          a += 1;
        }
      }
      const i = (py * tamanho + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round((255 * a) / total);
      }
    }
  }
  return rgba;
}

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function codificarPng(tamanho, rgba) {
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(tamanho, 0);
  cabecalho.writeUInt32BE(tamanho, 4);
  cabecalho[8] = 8; // 8 bits por canal
  cabecalho[9] = 6; // RGBA
  const linhas = Buffer.alloc(tamanho * (tamanho * 4 + 1));
  for (let y = 0; y < tamanho; y++) {
    const inicio = y * (tamanho * 4 + 1);
    linhas[inicio] = 0; // sem filtro
    rgba.copy(linhas, inicio + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

function montarIco(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // tipo: ícone
  cabecalho.writeUInt16LE(imagens.length, 4);
  const entradas = [];
  let deslocamento = 6 + 16 * imagens.length;
  for (const { tamanho, png } of imagens) {
    const entrada = Buffer.alloc(16);
    entrada[0] = tamanho >= 256 ? 0 : tamanho;
    entrada[1] = tamanho >= 256 ? 0 : tamanho;
    entrada.writeUInt16LE(1, 4); // planos
    entrada.writeUInt16LE(32, 6); // bits por pixel
    entrada.writeUInt32LE(png.length, 8);
    entrada.writeUInt32LE(deslocamento, 12);
    entradas.push(entrada);
    deslocamento += png.length;
  }
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.png)]);
}

const imagens = TAMANHOS.map((tamanho) => ({ tamanho, png: codificarPng(tamanho, desenhar(tamanho)) }));
const destino = path.resolve(__dirname, '..', 'assets', 'icone.ico');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, montarIco(imagens));
console.log(`Ícone gerado em ${destino} (${TAMANHOS.join(', ')} px).`);
