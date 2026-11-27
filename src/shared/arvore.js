'use strict';

// Árvore da Biblioteca (Marco 10): organiza os snippets em pastas e arquivos.
// Escrito para rodar no Node (testes) e também na janela, que o carrega por <script>:
// no navegador, as funções ficam em window.CDSPArvore. Função pura: só trabalha com dados em memória.
//
// Entrada: a lista de snippets da Biblioteca ({ id, trigger, origem, pasta, categoria, ... }).
//   - oficiais: `pasta` = "Medicamentos/Recursos" (ou "" na raiz) e `categoria` = "Medicamentos/Recursos/agravo"
//   - pessoais (origem "pessoal"): ficam todos na pasta "Pessoal", sem nível de arquivo.
// Saída: nós { tipo, nome, caminho, filhos, total }, com tipo:
//   "pasta"    filhos = pastas, arquivos (ou, na pasta "Pessoal", snippets)
//   "arquivo"  filhos = snippets
//   "snippet"  folha: { tipo, nome (o atalho), caminho (o id), snippet, total: 1 }

(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CDSPArvore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const NOME_PESSOAL = 'Pessoal';
  const SEPARADOR = ' › ';
  // Caminho interno da pasta Pessoal. Não é um nome de pasta possível: ela nunca se confunde com uma pasta
  // oficial que tenha o mesmo nome.
  const CAMINHO_PESSOAL = ':pessoal';

  const comparar = (a, b) => String(a).localeCompare(String(b), 'pt-BR');
  const ultimoNome = (caminho) => caminho.slice(caminho.lastIndexOf('/') + 1);

  /** "Medicamentos › contestacao" (oficial) ou "Pessoal". Usado na busca e nos detalhes. */
  function caminhoDoSnippet(snippet) {
    if (snippet.origem === 'pessoal') return NOME_PESSOAL;
    return String(snippet.categoria || '').split('/').join(SEPARADOR);
  }

  /** Identifica um nó entre os outros: pasta e arquivo podem ter o mesmo caminho ("Medicamentos"). */
  const chaveDe = (no) => `${no.tipo}:${no.caminho}`;

  function folha(snippet) {
    return { tipo: 'snippet', nome: snippet.trigger, caminho: snippet.id, snippet, filhos: [], total: 1 };
  }

  // Pastas antes dos arquivos, cada grupo em ordem pt-BR; atalhos em ordem de atalho. Calcula os totais.
  function ordenarEContar(no) {
    if (no.tipo === 'snippet') return no.total;
    no.filhos.sort((a, b) => {
      const peso = (n) => (n.tipo === 'pasta' ? 0 : n.tipo === 'arquivo' ? 1 : 2);
      return peso(a) - peso(b) || comparar(a.nome, b.nome) || comparar(a.caminho, b.caminho);
    });
    no.total = no.filhos.reduce((soma, filho) => soma + ordenarEContar(filho), 0);
    return no.total;
  }

  /**
   * @param {object[]} snippets
   * @returns {object[]} nós do primeiro nível: pastas, depois arquivos da raiz, e a pasta "Pessoal" por último
   */
  function montarArvore(snippets) {
    const topo = { filhos: [] };
    const pastas = new Map(); // caminho da pasta -> nó
    const arquivos = new Map(); // categoria -> nó
    const pessoais = [];

    function pastaNo(caminho) {
      if (caminho === '') return topo;
      if (pastas.has(caminho)) return pastas.get(caminho);
      const pai = pastaNo(caminho.includes('/') ? caminho.slice(0, caminho.lastIndexOf('/')) : '');
      const no = { tipo: 'pasta', nome: ultimoNome(caminho), caminho, filhos: [], total: 0 };
      pai.filhos.push(no);
      pastas.set(caminho, no);
      return no;
    }

    for (const s of snippets || []) {
      if (s.origem === 'pessoal') {
        pessoais.push(folha(s));
        continue;
      }
      let arquivo = arquivos.get(s.categoria);
      if (!arquivo) {
        arquivo = { tipo: 'arquivo', nome: ultimoNome(s.categoria), caminho: s.categoria, filhos: [], total: 0 };
        arquivos.set(s.categoria, arquivo);
        pastaNo(s.pasta || '').filhos.push(arquivo);
      }
      arquivo.filhos.push(folha(s));
    }

    ordenarEContar(topo);
    const nos = topo.filhos;
    if (pessoais.length > 0) {
      const pessoal = { tipo: 'pasta', nome: NOME_PESSOAL, caminho: CAMINHO_PESSOAL, pessoal: true, filhos: pessoais, total: 0 };
      ordenarEContar(pessoal);
      nos.push(pessoal);
    }
    return nos;
  }

  /**
   * Linhas que aparecem na lista, em ordem: um nó só mostra os filhos quando está aberto.
   * @param {object[]} nos  resultado de montarArvore
   * @param {(chave: string) => boolean} estaAberto
   * @returns {{no: object, chave: string, nivel: number, paiChave: string|null, aberto: boolean|null}[]}
   *   `aberto` é null nas folhas (snippets)
   */
  function linhasVisiveis(nos, estaAberto) {
    const linhas = [];
    (function percorrer(lista, nivel, paiChave) {
      for (const no of lista) {
        const chave = chaveDe(no);
        const ehFolha = no.tipo === 'snippet';
        const aberto = ehFolha ? null : Boolean(estaAberto(chave));
        linhas.push({ no, chave, nivel, paiChave, aberto });
        if (aberto) percorrer(no.filhos, nivel + 1, chave);
      }
    })(nos, 0, null);
    return linhas;
  }

  /** Chaves das pastas e arquivos que contêm o snippet (para abri-los ao mostrar o snippet escolhido). */
  function chavesDosAncestrais(nos, idDoSnippet) {
    let achado = null;
    (function procurar(lista, caminho) {
      for (const no of lista) {
        if (achado) return;
        if (no.tipo === 'snippet') {
          if (no.caminho === idDoSnippet) achado = caminho;
        } else {
          procurar(no.filhos, [...caminho, chaveDe(no)]);
        }
      }
    })(nos, []);
    return achado || [];
  }

  return { montarArvore, linhasVisiveis, chavesDosAncestrais, chaveDe, caminhoDoSnippet, NOME_PESSOAL, SEPARADOR };
});
