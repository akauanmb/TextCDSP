'use strict';

// Monta assets/icone.ico (bandeja, janelas e instalador) a partir das imagens do ícone do programa:
//   assets/icon16.png, assets/icon48.png, assets/icon128.png   (fornecidas; entram no .ico sem alteração)
// e gera os tamanhos que faltam por redimensionamento (32 e 256 px; o electron-builder exige o de 256).
// O ícone flutuante (Marco 11) usa assets/icon128.png direto, mostrado em 48 px.
//
// Uso:  npx electron scripts/gerar-icone.js
// Roda dentro do Electron só para usar o redimensionador de imagens dele (nativeImage); não abre janela.
// Para trocar o ícone: substitua os três PNGs e rode de novo. Quanto maior o icon128.png, mais nítido fica o de 256.

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.resolve(__dirname, '..', 'assets');
const FORNECIDOS = [16, 48, 128];
const GERADOS = [32, 256];

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

function principal() {
  const imagens = [];
  for (const tamanho of FORNECIDOS) {
    const arquivo = path.join(ASSETS, `icon${tamanho}.png`);
    const imagem = nativeImage.createFromPath(arquivo);
    const medida = imagem.getSize();
    if (imagem.isEmpty() || medida.width !== tamanho || medida.height !== tamanho) {
      throw new Error(`${arquivo} precisa existir e ter ${tamanho}x${tamanho} px.`);
    }
    imagens.push({ tamanho, png: fs.readFileSync(arquivo) });
  }
  const maior = nativeImage.createFromPath(path.join(ASSETS, 'icon128.png'));
  for (const tamanho of GERADOS) {
    imagens.push({ tamanho, png: maior.resize({ width: tamanho, height: tamanho, quality: 'best' }).toPNG() });
  }
  imagens.sort((a, b) => a.tamanho - b.tamanho);

  const destino = path.join(ASSETS, 'icone.ico');
  fs.writeFileSync(destino, montarIco(imagens));
  console.log(`Ícone gerado em ${destino} (${imagens.map((i) => i.tamanho).join(', ')} px).`);
}

app.whenReady().then(() => {
  try {
    principal();
    app.exit(0);
  } catch (erro) {
    console.error(erro.message);
    app.exit(1);
  }
});
