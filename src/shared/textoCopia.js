'use strict';

// Monta o texto que a Biblioteca mostra e copia para um snippet:
//   - as datas ({{data}}) já resolvidas para hoje, no formato do próprio snippet;
//   - os campos de formulário e escolhas ({{form1.nome}}, {{paragrafo}}) trocados por [nome];
//   - para html, também a versão em texto puro (o html vai para a área de transferência junto com o texto).
// Função pura: a data de "hoje" vem por parâmetro.

const { formatarDataEspanso, somarSegundos } = require('./datas');
const { htmlParaTexto } = require('./validador');

const PADRAO_VARIAVEL = /\{\{\s*([^{}\s]+?)\s*\}\}/g;

function substituirVariaveis(texto, datas, agora) {
  const porNome = new Map((datas || []).map((d) => [d.nome, d]));
  return String(texto).replace(PADRAO_VARIAVEL, (_, citada) => {
    const data = porNome.get(citada);
    if (data) return formatarDataEspanso(data.formato, somarSegundos(agora, data.offset));
    return `[${citada.slice(citada.lastIndexOf('.') + 1)}]`;
  });
}

/**
 * @param {{formato: string|null, saida: string, datas?: {nome: string, formato: string, offset?: number}[]}} snippet
 *   formato: "replace" | "html" | "markdown" (como devolvido por validarBiblioteca)
 * @param {Date} agora
 * @returns {{texto: string, html: string|null}}
 *   `html` só existe quando a saída é html; `texto` é sempre texto puro.
 */
function montarTextoParaCopia(snippet, agora) {
  const resolvido = substituirVariaveis(snippet.saida || '', snippet.datas, agora);
  if (snippet.formato === 'html') {
    const texto = htmlParaTexto(resolvido)
      .split('\n')
      .map((linha) => linha.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { texto, html: resolvido };
  }
  return { texto: resolvido, html: null };
}

module.exports = { montarTextoParaCopia, substituirVariaveis };
