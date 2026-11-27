'use strict';

// Lógica da janela Biblioteca. Só fala com o processo principal pelo objeto window.textcdsp (preload).
// Todo texto vindo de fora entra na página por textContent (nunca como HTML).

(function () {
  const api = window.textcdsp;
  const { filtrarSnippets } = window.CDSPBusca;
  const $ = (id) => document.getElementById(id);

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

  let dados = { snippets: [], categorias: [], erroPessoal: null, atualizadoEmTexto: null, prefixosTrigger: [], exemploAtalho: '' };

  // Ajuda do campo Atalho. A lista de caracteres vem do processo principal (validador.js), que é a única fonte dela.
  function ajudaDoAtalho() {
    const lista = dados.prefixosTrigger.join(' ');
    const exemplo = dados.exemploAtalho ? ` Exemplo: ${dados.exemploAtalho}` : '';
    return `Comece com um destes caracteres: ${lista}, seguido de 2 a 30 letras minúsculas sem acento ou números.${exemplo}`;
  }
  let visiveis = [];
  let selecionadoId = null;
  let formulario = null; // { modo: "criar"|"editar", triggerOriginal, valores, erros, arquivoInvalido }
  let confirmandoExclusao = false;
  let mensagem = { texto: '', tipo: '' };

  // ---------------------------------------------------------------------
  // Construção de elementos
  // ---------------------------------------------------------------------

  function el(tag, atributos, ...filhos) {
    const e = document.createElement(tag);
    for (const [chave, valor] of Object.entries(atributos || {})) {
      if (valor === false || valor === null || valor === undefined) continue;
      if (chave === 'classe') e.className = valor;
      else if (chave === 'texto') e.textContent = valor;
      else if (chave === 'aoClicar') e.addEventListener('click', valor);
      else e.setAttribute(chave, valor === true ? '' : valor);
    }
    for (const filho of filhos.flat()) {
      if (filho === null || filho === undefined || filho === false) continue;
      e.append(typeof filho === 'object' ? filho : document.createTextNode(String(filho)));
    }
    return e;
  }

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

  function montarCategorias() {
    const caixa = $('categoria');
    const atual = caixa.value || 'Todas';
    caixa.replaceChildren(el('option', { value: 'Todas', texto: 'Todas' }));
    for (const categoria of dados.categorias) caixa.append(el('option', { value: categoria, texto: categoria }));
    caixa.value = dados.categorias.includes(atual) || atual === 'Todas' ? atual : 'Todas';
  }

  function renderLista() {
    const lista = $('lista');
    lista.replaceChildren();
    if (visiveis.length === 0) {
      lista.append(el('li', { classe: 'vazio-lista', role: 'presentation', texto: dados.snippets.length === 0 ? 'Nenhum snippet ainda.' : 'Nenhum snippet encontrado.' }));
      return;
    }
    for (const s of visiveis) {
      lista.append(
        el('li', { role: 'option', 'aria-selected': s.id === selecionadoId ? 'true' : 'false', 'data-id': s.id, aoClicar: () => selecionar(s.id) },
          el('span', { classe: 'item-trigger', texto: s.trigger }),
          el('span', { classe: 'item-nome', texto: s.label }),
          el('span', { classe: 'item-categoria', texto: s.categoria })),
      );
    }
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

  // Aplica busca e categoria. Mantém a seleção se ainda estiver visível; senão, escolhe o primeiro resultado.
  function aplicarFiltro() {
    visiveis = filtrarSnippets(dados.snippets, { texto: $('busca').value, categoria: $('categoria').value });
    if (!visiveis.some((s) => s.id === selecionadoId)) {
      selecionadoId = visiveis.length > 0 ? visiveis[0].id : null;
      confirmandoExclusao = false;
      definirMensagem('');
    }
    renderLista();
    if (!formulario) renderPainel();
  }

  function selecionar(id) {
    if (id === selecionadoId && !formulario) return;
    selecionadoId = id;
    formulario = null;
    confirmandoExclusao = false;
    definirMensagem('');
    renderLista();
    renderPainel();
  }

  function mover(passo) {
    if (visiveis.length === 0) return;
    const indice = visiveis.findIndex((s) => s.id === selecionadoId);
    const novo = Math.min(Math.max(indice + passo, 0), visiveis.length - 1);
    selecionar(visiveis[novo].id);
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
        !ehPessoal ? el('span', { classe: 'etiqueta', texto: s.categoria }) : null,
        el('span', { classe: 'etiqueta', texto: ROTULO_TIPO[s.tipo] || s.tipo })),
      s.campos.length > 0 ? [el('h3', { texto: 'Campos' }), tabelaDeCampos(s.campos)] : null,
      el('h3', { texto: 'Texto' }),
      el('pre', { classe: 'texto', texto: s.previewCompleto }),
      confirmacao || el('div', { classe: 'acoes' }, acoes, el('span', { id: 'mensagem', classe: `mensagem ${mensagem.tipo}`, texto: mensagem.texto })),
      avisoDoArquivo,
    );
  }

  function renderPainel() {
    if (formulario) return renderFormulario();
    const s = selecionado();
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
    montarCategorias();
    if (selecionarTrigger) {
      const novo = dados.snippets.find((s) => s.origem === 'pessoal' && s.trigger === selecionarTrigger);
      if (novo) selecionadoId = novo.id;
    } else if (anterior && !dados.snippets.some((s) => s.id === selecionadoId)) {
      // O id muda se a posição do atalho mudou; procura o mesmo atalho de novo.
      const mesmo = dados.snippets.find((s) => s.origem === anterior.origem && s.trigger === anterior.trigger);
      selecionadoId = mesmo ? mesmo.id : null;
    }
    renderFaixa();
    renderRodape();
    aplicarFiltro();
  }

  // ---------------------------------------------------------------------
  // Teclado
  // ---------------------------------------------------------------------

  document.addEventListener('keydown', (evento) => {
    const alvo = evento.target;
    const tag = alvo && alvo.tagName;

    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'f') {
      evento.preventDefault();
      $('busca').focus();
      $('busca').select();
      return;
    }

    if (evento.key === 'Escape') {
      evento.preventDefault();
      if (formulario) cancelarFormulario();
      else if (confirmandoExclusao) {
        confirmandoExclusao = false;
        renderPainel();
      } else window.close();
      return;
    }

    // Dentro do formulário e de outros campos, as teclas são do campo.
    const emCampo = (tag === 'INPUT' && alvo.id !== 'busca') || tag === 'TEXTAREA' || tag === 'SELECT';
    if (formulario || emCampo) return;

    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      mover(evento.key === 'ArrowDown' ? 1 : -1);
    } else if (evento.key === 'Enter' && tag !== 'BUTTON') {
      evento.preventDefault();
      copiar('texto');
    }
  });

  // ---------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------

  $('busca').addEventListener('input', aplicarFiltro);
  $('categoria').addEventListener('change', aplicarFiltro);
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
