'use strict';

// Seção Biblioteca da janela principal. Só fala com o processo principal pelo objeto window.textcdsp (preload).
// Todo texto vindo de fora entra na página por textContent (nunca como HTML).

(function () {
  const { api, $, el, irParaSecao, secaoAtiva } = window.CDSPComum;
  const { filtrarSnippets } = window.CDSPBusca;
  const { montarArvore, linhasVisiveis, chavesDosAncestrais, chaveDe, caminhoDoSnippet, SEPARADOR } = window.CDSPArvore;

  const ROTULO_TIPO = {
    texto: 'Texto',
    formatado: 'Texto formatado',
    formulario: 'Formulário',
    escolha: 'Escolha',
    data: 'Data',
    misto: 'Misto',
  };
  const ROTULO_CAMPO = {
    texto: 'Texto curto',
    'texto-longo': 'Texto longo',
    lista: 'Lista de opções',
    escolha: 'Escolha de parágrafo',
  };

  let dados = { snippets: [], erroPessoal: null, atualizadoEmTexto: null, prefixosTrigger: [], exemploAtalho: '' };

  // Ajuda do campo Atalho. A lista de caracteres vem do processo principal (validador.js), que é a única fonte dela.
  function ajudaDoAtalho() {
    const lista = dados.prefixosTrigger.join(' ');
    const exemplo = dados.exemploAtalho ? ` Exemplo: ${dados.exemploAtalho}` : '';
    return `Comece com um destes caracteres: ${lista}, seguido de 2 a 30 letras minúsculas sem acento ou números.${exemplo}`;
  }
  // Árvore (Marco 10). Começa tudo fechado; o que a pessoa abre fica lembrado enquanto a janela existir,
  // inclusive quando a lista é relida por "biblioteca:mudou".
  let arvore = [];
  let linhas = []; // as linhas que aparecem na lista agora (árvore, ou resultados da busca)
  const abertos = new Set(); // chaves das pastas e arquivos abertos
  let modoBusca = false; // com texto na busca, a árvore vira uma lista plana dos resultados
  let cursor = null; // chave da linha marcada (pasta, arquivo ou snippet)
  let selecionadoId = null; // id do snippet marcado; null quando o cursor está numa pasta ou arquivo
  let formulario = null; // { modo: "criar"|"editar", triggerOriginal, valores, erros, arquivoInvalido }
  let confirmandoExclusao = false;
  let mensagem = { texto: '', tipo: '' };

  // Troca o conteúdo do painel. Aceita listas e ignora vazios (replaceChildren transformaria null em "null").
  function mostrarNoPainel(...nos) {
    $('painel').replaceChildren(...nos.flat().filter((no) => no !== null && no !== undefined && no !== false));
  }

  const selecionado = () => dados.snippets.find((s) => s.id === selecionadoId) || null;

  function definirMensagem(texto, tipo) {
    mensagem = { texto: texto || '', tipo: tipo || '' };
    const e = $('mensagem');
    if (e) {
      e.textContent = mensagem.texto;
      e.className = `mensagem ${mensagem.tipo}`;
    }
  }

  // ---------------------------------------------------------------------
  // Lista, filtro e rodapé
  // ---------------------------------------------------------------------

  const chaveDoSnippet = (id) => chaveDe({ tipo: 'snippet', caminho: id });
  const indiceDoCursor = () => linhas.findIndex((l) => l.chave === cursor);
  const linhaDoCursor = () => linhas.find((l) => l.chave === cursor) || null;

  // Uma linha da lista. Pastas e arquivos têm seta e o total de snippets; os snippets mostram atalho e nome.
  // Na busca (lista plana), cada resultado mostra também o caminho: "Medicamentos › contestacao".
  function criarItem(linha) {
    const { no, chave, nivel, aberto } = linha;
    const comum = {
      role: 'treeitem',
      'aria-level': String(nivel + 1),
      'aria-selected': chave === cursor ? 'true' : 'false',
      'data-chave': chave,
      aoClicar: () => cliqueNaLinha(chave),
    };
    if (no.tipo === 'snippet') {
      const s = no.snippet;
      return el('li', { ...comum, classe: `n${nivel}` },
        el('span', { classe: 'item-trigger', texto: s.trigger }),
        el('span', { classe: 'item-nome', texto: s.label }),
        modoBusca ? el('span', { classe: 'item-categoria', texto: caminhoDoSnippet(s) }) : null);
    }
    return el('li', { ...comum, 'aria-expanded': aberto ? 'true' : 'false', classe: `no no-${no.tipo} n${nivel}` },
      el('span', { classe: 'seta', 'aria-hidden': 'true', texto: aberto ? '▾' : '▸' }),
      el('span', { classe: 'no-nome', texto: no.nome }),
      el('span', { classe: 'no-total', texto: String(no.total) }));
  }

  function renderLista() {
    const lista = $('lista');
    lista.replaceChildren();
    if (linhas.length === 0) {
      lista.append(el('li', { classe: 'vazio-lista', role: 'presentation', texto: dados.snippets.length === 0 ? 'Nenhum snippet ainda.' : 'Nenhum snippet encontrado.' }));
      return;
    }
    for (const linha of linhas) lista.append(criarItem(linha));
    const atual = lista.querySelector('[aria-selected="true"]');
    if (atual) atual.scrollIntoView({ block: 'nearest' });
  }

  function renderRodape() {
    const total = dados.snippets.length;
    const partes = [`${total} ${total === 1 ? 'snippet' : 'snippets'}`];
    if (dados.atualizadoEmTexto) partes.push(`atualizado em ${dados.atualizadoEmTexto}`);
    $('rodape').textContent = partes.join(', ');
  }

  function renderFaixa() {
    const faixa = $('faixa-arquivo');
    faixa.hidden = !dados.erroPessoal;
    $('faixa-arquivo-texto').textContent = dados.erroPessoal ? dados.erroPessoal.mensagem : '';
  }

  // Monta as linhas visíveis: a árvore (só o que está aberto) ou, com texto na busca, os resultados em lista plana.
  function reconstruirLinhas() {
    const texto = $('busca').value;
    modoBusca = texto.trim() !== '';
    if (modoBusca) {
      linhas = filtrarSnippets(dados.snippets, { texto }).map((s) => {
        const no = { tipo: 'snippet', nome: s.trigger, caminho: s.id, snippet: s };
        return { no, chave: chaveDe(no), nivel: 0, paiChave: null, aberto: null };
      });
    } else {
      linhas = linhasVisiveis(arvore, (chave) => abertos.has(chave));
    }
  }

  // Marca um snippet (ou nenhum). Trocar de snippet apaga a mensagem e a confirmação de exclusão do anterior.
  function marcarSnippet(id) {
    if (id !== selecionadoId) {
      confirmandoExclusao = false;
      definirMensagem('');
    }
    selecionadoId = id;
    cursor = id ? chaveDoSnippet(id) : null;
  }

  // Relê as linhas e acerta a marcação. Na busca, mantém o snippet marcado se ele ainda for um resultado;
  // senão, marca o primeiro resultado. Na árvore, não escolhe nada sozinho.
  function atualizarLista() {
    reconstruirLinhas();
    const chaveDoSelecionado = selecionadoId ? chaveDoSnippet(selecionadoId) : null;
    const visivel = (chave) => linhas.some((l) => l.chave === chave);
    if (modoBusca) {
      if (visivel(chaveDoSelecionado)) cursor = chaveDoSelecionado;
      else marcarSnippet(linhas.length > 0 ? linhas[0].no.snippet.id : null);
    } else if (chaveDoSelecionado && visivel(chaveDoSelecionado)) {
      cursor = chaveDoSelecionado;
    } else if (cursor && !visivel(cursor)) {
      cursor = null;
    }
    renderLista();
    if (!formulario) renderPainel();
  }

  // A busca mudou. Ao esvaziá-la, a árvore volta com as pastas do snippet marcado abertas, para ele continuar à vista.
  function aoMudarBusca() {
    if (modoBusca && $('busca').value.trim() === '' && selecionadoId) {
      for (const chave of chavesDosAncestrais(arvore, selecionadoId)) abertos.add(chave);
    }
    atualizarLista();
  }

  // Leva o cursor a uma linha visível. Snippet: mostra os detalhes. Pasta ou arquivo: mostra o resumo.
  function irParaChave(chave) {
    const linha = linhas.find((l) => l.chave === chave);
    if (!linha) return;
    if (linha.no.tipo === 'snippet') {
      if (linha.no.snippet.id === selecionadoId && !formulario) return;
      marcarSnippet(linha.no.snippet.id);
    } else {
      marcarSnippet(null);
      cursor = chave;
    }
    formulario = null;
    confirmandoExclusao = false;
    renderLista();
    renderPainel();
  }

  function alternarAberto(chave, abrir) {
    const abrirDeFato = abrir === undefined ? !abertos.has(chave) : abrir;
    if (abrirDeFato) abertos.add(chave);
    else abertos.delete(chave);
    reconstruirLinhas();
  }

  function cliqueNaLinha(chave) {
    const linha = linhas.find((l) => l.chave === chave);
    if (!linha) return;
    if (linha.no.tipo === 'snippet') {
      irParaChave(chave);
      return;
    }
    alternarAberto(chave);
    // Com o formulário aberto, abrir ou fechar uma pasta só mexe na lista: não descarta o que foi digitado.
    if (formulario) renderLista();
    else irParaChave(chave);
  }

  // Setas para cima e para baixo percorrem as linhas visíveis.
  function mover(passo) {
    if (linhas.length === 0) return;
    const indice = indiceDoCursor();
    const novo = indice === -1 ? 0 : Math.min(Math.max(indice + passo, 0), linhas.length - 1);
    irParaChave(linhas[novo].chave);
  }

  // Seta para a direita abre a pasta (ou arquivo). Seta para a esquerda fecha; se já estiver fechada, ou for um
  // snippet, volta para a pasta de cima. Não valem na busca, onde a lista é plana.
  function abrirOuFechar(direcao) {
    const linha = linhaDoCursor();
    if (modoBusca || !linha) return;
    const ehNo = linha.no.tipo !== 'snippet';
    if (direcao === 'direita') {
      if (ehNo && !linha.aberto) {
        alternarAberto(linha.chave, true);
        irParaChave(linha.chave);
      }
    } else if (ehNo && linha.aberto) {
      alternarAberto(linha.chave, false);
      irParaChave(linha.chave);
    } else if (linha.paiChave) {
      irParaChave(linha.paiChave);
    }
  }

  // Enter: copia o texto do snippet; numa pasta ou arquivo, abre ou fecha.
  function confirmarLinha() {
    const linha = linhaDoCursor();
    if (!linha) return;
    if (linha.no.tipo === 'snippet') copiar('texto');
    else {
      alternarAberto(linha.chave);
      irParaChave(linha.chave);
    }
  }

  // ---------------------------------------------------------------------
  // Painel de detalhes
  // ---------------------------------------------------------------------

  function tabelaDeCampos(campos) {
    return el('table', {},
      el('thead', {}, el('tr', {}, el('th', { texto: 'Campo' }), el('th', { texto: 'Tipo' }), el('th', { texto: 'Opções' }))),
      el('tbody', {}, campos.map((c) =>
        el('tr', {},
          el('td', { classe: 'nome-campo', texto: c.nome }),
          el('td', { texto: ROTULO_CAMPO[c.tipo] || c.tipo }),
          el('td', { texto: c.opcoes && c.opcoes.length > 0 ? c.opcoes.join(' | ') : '' })))));
  }

  function renderDetalhes(s) {
    const ehPessoal = s.origem === 'pessoal';
    const acoes = [
      el('button', { id: 'copiar-atalho', type: 'button', aoClicar: () => copiar('atalho') }, 'Copiar atalho'),
      el('button', { id: 'copiar-texto', type: 'button', classe: 'principal', aoClicar: () => copiar('texto') }, 'Copiar texto'),
    ];
    if (ehPessoal && s.editavel) {
      acoes.push(
        el('button', { id: 'editar', type: 'button', aoClicar: abrirEdicao }, 'Editar'),
        el('button', { id: 'excluir', type: 'button', classe: 'perigo', aoClicar: () => { confirmandoExclusao = true; renderPainel(); } }, 'Excluir'),
      );
    }

    const confirmacao = confirmandoExclusao
      ? el('div', { classe: 'confirmacao', role: 'alertdialog', 'aria-label': 'Confirmar exclusão' },
        el('p', { texto: `Excluir o atalho ${s.trigger}? Ele deixa de funcionar na hora.` }),
        el('div', { classe: 'acoes' },
          el('button', { id: 'confirmar-exclusao', type: 'button', classe: 'perigo-forte', aoClicar: excluir }, 'Excluir'),
          el('button', { id: 'cancelar-exclusao', type: 'button', aoClicar: () => { confirmandoExclusao = false; renderPainel(); } }, 'Cancelar')))
      : null;

    const avisoDoArquivo = ehPessoal && !s.editavel
      ? el('div', { classe: 'aviso-arquivo' },
        el('p', { texto: 'Este atalho foi criado direto no arquivo.' }),
        el('p', { texto: 'Para alterá-lo ou excluí-lo, edite o arquivo de atalhos pessoais.' }),
        el('button', { id: 'abrir-arquivo', type: 'button', aoClicar: abrirArquivo }, 'Abrir arquivo'))
      : null;

    mostrarNoPainel(
      el('p', { classe: 'trigger-grande', texto: s.trigger }),
      el('h2', { texto: s.label }),
      el('div', { classe: 'etiquetas' },
        el('span', { classe: `etiqueta ${ehPessoal ? 'pessoal' : ''}`, texto: ehPessoal ? 'Pessoal' : 'Oficial' }),
        el('span', { classe: 'etiqueta', texto: ROTULO_TIPO[s.tipo] || s.tipo })),
      !ehPessoal ? el('p', { id: 'caminho-snippet', classe: 'caminho', texto: `Pasta: ${caminhoDoSnippet(s)}` }) : null,
      s.campos.length > 0 ? [el('h3', { texto: 'Campos' }), tabelaDeCampos(s.campos)] : null,
      el('h3', { texto: 'Texto' }),
      el('pre', { classe: 'texto', texto: s.previewCompleto }),
      confirmacao || el('div', { classe: 'acoes' }, acoes, el('span', { id: 'mensagem', classe: `mensagem ${mensagem.tipo}`, texto: mensagem.texto })),
      avisoDoArquivo,
    );
  }

  // Resumo de uma pasta ou arquivo da árvore.
  function renderResumoDoNo(no) {
    const onde = no.pessoal ? 'Pessoal' : no.caminho.split('/').join(SEPARADOR);
    mostrarNoPainel(
      el('h2', { texto: no.nome }),
      el('p', { id: 'caminho-no', classe: 'caminho', texto: `${no.tipo === 'pasta' ? 'Pasta' : 'Arquivo'}: ${onde}` }),
      el('p', { classe: 'dica', texto: `${no.total} ${no.total === 1 ? 'snippet' : 'snippets'}. Enter, ou as setas para a direita e para a esquerda, abrem e fecham.` }),
    );
  }

  function renderPainel() {
    if (formulario) return renderFormulario();
    const s = selecionado();
    const linha = !s ? linhaDoCursor() : null;
    if (linha && linha.no.tipo !== 'snippet') return renderResumoDoNo(linha.no);
    if (!s) {
      mostrarNoPainel(el('p', { classe: 'vazio-painel', texto: dados.snippets.length === 0 ? 'Nenhum snippet disponível ainda.' : 'Selecione um atalho na lista para ver os detalhes.' }));
      return undefined;
    }
    return renderDetalhes(s);
  }

  // ---------------------------------------------------------------------
  // Copiar
  // ---------------------------------------------------------------------

  async function copiar(modo) {
    const s = selecionado();
    if (!s) return;
    try {
      const r = await api.copiar({ id: s.id, modo });
      if (r.ok) {
        definirMensagem(modo === 'atalho' ? 'Atalho copiado.' : r.comFormatacao ? 'Texto copiado, com formatação.' : 'Texto copiado.', '');
      } else {
        definirMensagem(r.mensagem || 'Não foi possível copiar.', 'erro');
        await recarregar();
      }
    } catch {
      definirMensagem('Não foi possível copiar.', 'erro');
    }
  }

  async function abrirArquivo() {
    const r = await api.abrirArquivoPessoal();
    if (!r.ok) definirMensagem(r.mensagem, 'erro');
  }

  // ---------------------------------------------------------------------
  // Formulário de atalho pessoal
  // ---------------------------------------------------------------------

  function abrirNovo() {
    formulario = { modo: 'criar', triggerOriginal: null, valores: { trigger: '', label: '', texto: '' }, erros: {}, arquivoInvalido: null };
    confirmandoExclusao = false;
    renderPainel();
    $('campo-trigger').focus();
  }

  function abrirEdicao() {
    const s = selecionado();
    if (!s || !s.editavel) return;
    formulario = { modo: 'editar', triggerOriginal: s.trigger, valores: { trigger: s.trigger, label: s.label, texto: s.textoOriginal || '' }, erros: {}, arquivoInvalido: null };
    renderPainel();
    $('campo-trigger').focus();
  }

  function campoDoFormulario(rotulo, id, controle, dica, erro) {
    return el('div', { classe: 'campo' },
      el('label', { for: id, texto: rotulo }),
      controle,
      dica ? el('p', { id: `${id}-dica`, classe: 'dica', texto: dica }) : null,
      erro ? el('p', { id: `${id}-erro`, classe: 'erro-campo', role: 'alert', texto: erro }) : null);
  }

  function renderFormulario() {
    const f = formulario;
    const erros = f.erros || {};
    const descricao = (id, temDica, temErro) => [temDica ? `${id}-dica` : null, temErro ? `${id}-erro` : null].filter(Boolean).join(' ') || false;

    const trigger = el('input', { id: 'campo-trigger', type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-invalid': erros.trigger ? 'true' : false, 'aria-describedby': descricao('campo-trigger', true, erros.trigger) });
    trigger.value = f.valores.trigger;
    const nome = el('input', { id: 'campo-label', type: 'text', autocomplete: 'off', 'aria-invalid': erros.label ? 'true' : false, 'aria-describedby': descricao('campo-label', true, erros.label) });
    nome.value = f.valores.label;
    const texto = el('textarea', { id: 'campo-texto', spellcheck: 'true', 'aria-invalid': erros.texto ? 'true' : false, 'aria-describedby': descricao('campo-texto', true, erros.texto) });
    texto.value = f.valores.texto;

    const geral = [];
    if (erros.geral) geral.push(el('p', { texto: erros.geral }));
    if (f.arquivoInvalido) {
      geral.push(
        el('p', { texto: f.arquivoInvalido.mensagem }),
        el('button', { id: 'formulario-abrir-arquivo', type: 'button', aoClicar: abrirArquivo }, 'Abrir arquivo'));
    }

    mostrarNoPainel(
      el('h2', { texto: f.modo === 'criar' ? 'Novo atalho pessoal' : 'Editar atalho pessoal' }),
      el('p', { classe: 'dica', texto: 'Atalhos pessoais inserem um texto simples (sem campos, escolhas ou formatação). Ficam só neste computador.' }),
      campoDoFormulario('Atalho', 'campo-trigger', trigger, ajudaDoAtalho(), erros.trigger),
      campoDoFormulario('Nome', 'campo-label', nome, 'Aparece na lista e na busca. Exemplo: Saudação', erros.label),
      campoDoFormulario('Texto', 'campo-texto', texto, 'O texto que será inserido, com as quebras de linha que você digitar. Não use "{{" nem "}}".', erros.texto),
      geral.length > 0 ? el('div', { classe: 'erro-geral', role: 'alert' }, geral) : null,
      el('div', { classe: 'acoes' },
        el('button', { id: 'salvar', type: 'button', classe: 'principal', aoClicar: salvarFormulario }, 'Salvar'),
        el('button', { id: 'cancelar', type: 'button', aoClicar: cancelarFormulario }, 'Cancelar')),
    );
  }

  function cancelarFormulario() {
    formulario = null;
    renderPainel();
  }

  async function salvarFormulario() {
    const f = formulario;
    const valores = { trigger: $('campo-trigger').value, label: $('campo-label').value, texto: $('campo-texto').value };
    // Enquanto grava, trava o formulário: o que fosse digitado agora seria perdido quando a resposta chegar.
    for (const id of ['salvar', 'cancelar', 'campo-trigger', 'campo-label', 'campo-texto']) $(id).disabled = true;
    try {
      const r = await api.salvarPessoal({ operacao: f.modo, triggerOriginal: f.triggerOriginal, ...valores });
      if (r.ok) {
        formulario = null;
        await recarregar({ selecionarTrigger: r.trigger });
        definirMensagem('Atalho salvo.', '');
        return;
      }
      // Mantém o formulário aberto, com as mensagens ao lado dos campos.
      formulario = { ...f, valores, erros: r.erros || {}, arquivoInvalido: r.arquivoInvalido || null };
      renderFormulario();
      // Se o problema é o pessoal.yml, a faixa de aviso do topo também precisa aparecer.
      if (r.arquivoInvalido) recarregar().catch(() => {});
      const primeiro = ['trigger', 'label', 'texto'].find((c) => formulario.erros[c]);
      if (primeiro) $(`campo-${primeiro}`).focus();
    } catch {
      formulario = { ...f, valores, erros: { geral: 'Não foi possível salvar. Tente de novo.' }, arquivoInvalido: null };
      renderFormulario();
    }
  }

  async function excluir() {
    const s = selecionado();
    if (!s) return;
    const r = await api.excluirPessoal({ trigger: s.trigger });
    confirmandoExclusao = false;
    if (r.ok) {
      selecionadoId = null;
      await recarregar();
      definirMensagem('Atalho excluído.', '');
    } else {
      renderPainel();
      definirMensagem((r.arquivoInvalido && r.arquivoInvalido.mensagem) || (r.erros && r.erros.geral) || 'Não foi possível excluir.', 'erro');
      await recarregar();
    }
  }

  // ---------------------------------------------------------------------
  // Carga de dados
  // ---------------------------------------------------------------------

  async function recarregar({ selecionarTrigger } = {}) {
    const anterior = selecionado();
    dados = await api.listar();
    arvore = montarArvore(dados.snippets);
    if (selecionarTrigger) {
      const novo = dados.snippets.find((s) => s.origem === 'pessoal' && s.trigger === selecionarTrigger);
      if (novo) {
        selecionadoId = novo.id;
        cursor = chaveDoSnippet(novo.id);
        // O atalho recém-salvo precisa estar à vista: abre a pasta Pessoal.
        for (const chave of chavesDosAncestrais(arvore, novo.id)) abertos.add(chave);
      }
    } else if (anterior && !dados.snippets.some((s) => s.id === selecionadoId)) {
      // O id muda se a posição do atalho mudou; procura o mesmo atalho de novo.
      const mesmo = dados.snippets.find((s) => s.origem === anterior.origem && s.trigger === anterior.trigger);
      selecionadoId = mesmo ? mesmo.id : null;
      cursor = mesmo ? chaveDoSnippet(mesmo.id) : null;
    }
    renderFaixa();
    renderRodape();
    atualizarLista();
  }

  // ---------------------------------------------------------------------
  // Teclado
  // ---------------------------------------------------------------------

  document.addEventListener('keydown', (evento) => {
    const alvo = evento.target;
    const tag = alvo && alvo.tagName;

    // Ctrl+F vale em qualquer seção: leva para a Biblioteca e foca a busca.
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'f') {
      evento.preventDefault();
      irParaSecao('biblioteca');
      $('busca').focus();
      $('busca').select();
      return;
    }

    // As demais teclas só valem com a Biblioteca à vista (as Configurações têm campos próprios).
    if (secaoAtiva() !== 'biblioteca') return;

    // Esc: fecha o formulário ou a confirmação aberta; se não houver nada, minimiza a janela (Marco 11).
    if (evento.key === 'Escape') {
      evento.preventDefault();
      if (formulario) cancelarFormulario();
      else if (confirmandoExclusao) {
        confirmandoExclusao = false;
        renderPainel();
      } else window.CDSPComum.minimizar();
      return;
    }

    // Dentro do formulário e de outros campos, as teclas são do campo.
    const emCampo = (tag === 'INPUT' && alvo.id !== 'busca') || tag === 'TEXTAREA' || tag === 'SELECT';
    if (formulario || emCampo) return;

    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      mover(evento.key === 'ArrowDown' ? 1 : -1);
    } else if ((evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') && !modoBusca) {
      // Com o foco na caixa de busca (vazia), as setas laterais também abrem e fecham as pastas.
      evento.preventDefault();
      abrirOuFechar(evento.key === 'ArrowRight' ? 'direita' : 'esquerda');
    } else if (evento.key === 'Enter' && tag !== 'BUTTON') {
      evento.preventDefault();
      confirmarLinha();
    }
  });

  // ---------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------

  $('busca').addEventListener('input', aoMudarBusca);
  $('novo').addEventListener('click', abrirNovo);
  $('faixa-arquivo-abrir').addEventListener('click', abrirArquivo);
  api.aoMudar(() => {
    recarregar().catch(() => {});
  });

  recarregar()
    .then(() => $('busca').focus())
    .catch(() => {
      mostrarNoPainel(el('p', { classe: 'vazio-painel', texto: 'Não foi possível carregar a lista de snippets.' }));
    });
})();
