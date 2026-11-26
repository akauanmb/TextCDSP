'use strict';

// Busca instantânea da Biblioteca: sem diferenciar maiúsculas nem acentos.
// Escrito para rodar no Node (testes) e também na janela, que o carrega por <script>:
// no navegador, as funções ficam em window.CDSPBusca.

(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CDSPBusca = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // "Preliminar", "PRELIMINAR" e "preliminár" viram a mesma coisa.
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  // Cada palavra digitada precisa aparecer em algum lugar do snippet (trigger, label, preview ou categoria).
  function combina(snippet, termos) {
    if (termos.length === 0) return true;
    const alvo = normalizar([snippet.trigger, snippet.label, snippet.preview, snippet.categoria].join('\n'));
    return termos.every((termo) => alvo.includes(termo));
  }

  /**
   * @param {object[]} snippets
   * @param {{texto?: string, categoria?: string}} filtro  categoria vazia ou "Todas" não filtra
   */
  function filtrarSnippets(snippets, { texto = '', categoria = '' } = {}) {
    const termos = normalizar(texto).split(/\s+/).filter(Boolean);
    const cat = categoria && categoria !== 'Todas' ? categoria : null;
    return snippets.filter((s) => (!cat || s.categoria === cat) && combina(s, termos));
  }

  return { normalizar, filtrarSnippets };
});
