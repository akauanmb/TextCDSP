'use strict';

// Área de transferência do Windows, pela API do Electron 45 (assíncrona, no estilo W3C): writeText devolve
// Promise e write recebe uma lista de ClipboardItem. O formato antigo, clipboard.write({ text, html }), lança
// "clipboard.write expects an array of ClipboardItem" (era o que o "Copiar texto" usava; ver docs/WINDOWS-NOTAS.md).
// Um módulo só, para a cópia da Biblioteca (Marco 5) e para o "Inserir" (Marco 12).

const { clipboard, ClipboardItem } = require('electron');

// Formatos internos do Electron/Chromium (origem da cópia etc.): não fazem parte do conteúdo do usuário.
const ehInterno = (tipo) => tipo.startsWith('electron application/');

/** Grava texto puro. */
async function escreverTexto(texto) {
  await clipboard.writeText(String(texto));
}

/** Grava texto puro e HTML juntos (o Google Docs usa o HTML e mantém negrito, listas etc.; o resto usa o texto). */
async function escreverFormatado({ texto, html }) {
  await clipboard.write([new ClipboardItem({ 'text/plain': String(texto), 'text/html': String(html) })]);
}

/** Texto puro que está na área de transferência agora ("" se não houver). */
async function lerTexto() {
  return clipboard.readText();
}

/**
 * Guarda o que há na área de transferência, em todos os formatos que o Electron consegue ler (texto, HTML, RTF,
 * imagem...). Devolve um instantâneo para `restaurar`. Formatos que o Electron não expõe (por exemplo, lista de
 * arquivos copiada no Explorador, ou formatos próprios de uma planilha) não entram e se perdem na restauração.
 */
async function guardar() {
  const itens = await clipboard.read();
  const instantaneo = [];
  for (const item of itens) {
    const tipos = {};
    for (const tipo of item.types) {
      if (ehInterno(tipo)) continue;
      try {
        tipos[tipo] = await item.getType(tipo);
      } catch {
        // formato que não pôde ser lido: fica de fora
      }
    }
    if (Object.keys(tipos).length > 0) instantaneo.push(tipos);
  }
  return instantaneo;
}

/** Devolve à área de transferência o que `guardar` registrou. Instantâneo vazio = a área estava vazia. */
async function restaurar(instantaneo) {
  if (!instantaneo || instantaneo.length === 0) {
    clipboard.clear();
    return;
  }
  await clipboard.write(instantaneo.map((tipos) => new ClipboardItem(tipos)));
}

module.exports = { escreverTexto, escreverFormatado, lerTexto, guardar, restaurar };
