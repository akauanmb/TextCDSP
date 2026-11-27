'use strict';

// Regras do botão "Inserir" (Marco 12), puras: quais snippets podem ser inseridos, como o texto vai para a área de
// transferência e quando ela deve ser restaurada depois. Escrito para rodar no Node (processo principal e testes) e
// também na janela, que o carrega por <script>: no navegador, as funções ficam em window.CDSPInserir.
// A janela e o processo principal usam a MESMA função podeInserir.

(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CDSPInserir = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MENSAGEM_NAO_INSERIVEL = 'Só atalhos de texto simples podem ser inseridos. Use Copiar texto.';

  /**
   * Só o tipo "texto" pode ser inserido: sem variáveis (campos, escolhas, datas...) e sem html/markdown. Vale para
   * snippets oficiais e pessoais. Aceita o snippet bruto do validador e o que a Biblioteca entrega à janela.
   */
  function podeInserir(snippet) {
    if (!snippet || typeof snippet !== 'object') return false;
    if (snippet.tipo !== 'texto') return false;
    if (Array.isArray(snippet.campos) && snippet.campos.length > 0) return false;
    if (snippet.formato === 'html' || snippet.formato === 'markdown') return false;
    return true;
  }

  // Quebras de linha de qualquer tipo viram \r\n, a convenção do Windows (aceita também pelo Chrome, no Google Docs).
  function normalizarQuebrasDeLinha(texto) {
    return String(texto == null ? '' : texto).replace(/\r\n|\r|\n/g, '\r\n');
  }

  const comoLinhasUnix = (texto) => String(texto == null ? '' : texto).replace(/\r\n|\r/g, '\n');

  /**
   * A área de transferência só é restaurada se ainda tiver o texto que foi inserido. Se a pessoa copiou outra coisa
   * nesse meio tempo, não se mexe. A comparação ignora a diferença entre \n e \r\n.
   * @param {string} textoAtual     o que há na área de transferência agora
   * @param {string} textoInserido  o que o Inserir colocou lá
   */
  function deveRestaurarAreaDeTransferencia(textoAtual, textoInserido) {
    if (typeof textoAtual !== 'string' || typeof textoInserido !== 'string') return false;
    return comoLinhasUnix(textoAtual) === comoLinhasUnix(textoInserido);
  }

  return { MENSAGEM_NAO_INSERIVEL, podeInserir, normalizarQuebrasDeLinha, deveRestaurarAreaDeTransferencia };
});
