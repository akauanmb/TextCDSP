'use strict';

// Seção Configurações da janela principal. Só fala com o processo principal pelo objeto
// window.textcdsp (preload). Todo texto vindo de fora entra na página por textContent.

(function () {
  const { api, $, aoEstado } = window.CDSPComum;

  const campos = {
    fonte: $('fonte'),
    intervalo: $('intervalo'),
    iniciarWindows: $('iniciar-windows'),
    minimizarIcone: $('minimizar-icone'),
    modoAdmin: $('modo-admin'),
  };
  const botoes = {
    escolher: $('escolher'),
    testar: $('testar'),
    salvar: $('config-salvar'),
    fechar: $('fechar'),
    sincronizar: $('sincronizar'),
  };
  let ocupado = false;

  function dataHora(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const dois = (n) => String(n).padStart(2, '0');
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }

  function definirMensagem(texto, tipo) {
    const caixa = $('config-mensagem');
    caixa.textContent = texto || '';
    caixa.className = tipo || '';
  }

  function onde(problema) {
    return `${problema.arquivo || ''}${problema.linha ? `:${problema.linha}` : ''}`;
  }

  function preencherLista(lista, titulo, problemas, rotulo) {
    lista.replaceChildren();
    titulo.hidden = problemas.length === 0;
    titulo.textContent = problemas.length === 0 ? '' : `${rotulo} (${problemas.length})`;
    for (const p of problemas) {
      const li = document.createElement('li');
      const local = document.createElement('span');
      local.className = 'onde';
      local.textContent = `${onde(p)} [${p.regra}]`;
      li.append(local, document.createTextNode(p.mensagem));
      lista.append(li);
    }
  }

  // Alterna entre desabilitado e habilitado enquanto uma operação está em andamento.
  async function comOcupado(botao, textoEnquanto, acao) {
    if (ocupado) return;
    ocupado = true;
    const textoOriginal = botao.textContent;
    Object.values(botoes).forEach((b) => { b.disabled = true; });
    botao.textContent = textoEnquanto;
    try {
      await acao();
    } finally {
      botao.textContent = textoOriginal;
      Object.values(botoes).forEach((b) => { b.disabled = false; });
      ocupado = false;
    }
  }

  function mostrarEstado(estado) {
    const status = $('status-texto');
    status.textContent = estado.texto;
    status.className = `status ${estado.status}`;
    $('ultima-atualizacao').textContent = dataHora(estado.aplicadoEm);
    $('ultima-verificacao').textContent = estado.sincronizando ? 'verificando agora...' : dataHora(estado.verificadoEm);
    $('total-snippets').textContent = estado.aplicadoEm || estado.totalSnippets ? String(estado.totalSnippets) : '-';

    const mensagem = $('status-mensagem');
    mensagem.hidden = !estado.mensagem;
    mensagem.textContent = estado.mensagem || '';

    const erros = estado.erros || [];
    const avisos = estado.avisos || [];
    $('problemas').hidden = erros.length === 0 && avisos.length === 0;
    preencherLista($('lista-erros'), $('titulo-erros'), erros, 'Erros (a versão anterior foi mantida)');
    preencherLista($('lista-avisos'), $('titulo-avisos'), avisos, 'Avisos');
  }

  function mostrarTeste(resultado) {
    const caixa = $('resultado-teste');
    caixa.hidden = false;
    caixa.replaceChildren();
    const resumo = document.createElement('p');
    const erros = resultado.erros || [];
    const avisos = resultado.avisos || [];
    if (!resultado.acessivel) {
      caixa.className = 'caixa erro';
      resumo.textContent = resultado.mensagem || 'Não foi possível acessar a pasta.';
      caixa.append(resumo);
      return;
    }
    caixa.className = `caixa ${erros.length > 0 ? 'erro' : avisos.length > 0 ? 'aviso' : 'ok'}`;
    resumo.textContent = `${resultado.snippets} snippets em ${resultado.arquivos} arquivo(s), ${erros.length} erro(s), ${avisos.length} aviso(s).`;
    caixa.append(resumo);
    if (erros.length > 0) {
      const aviso = document.createElement('p');
      aviso.textContent = 'Com erros, esta pasta não é aplicada: os atalhos seguem na última versão válida.';
      caixa.append(aviso);
    }
    const lista = document.createElement('ul');
    lista.className = `problemas ${erros.length > 0 ? 'erros' : 'avisos'}`;
    for (const p of [...erros, ...avisos]) {
      const li = document.createElement('li');
      const local = document.createElement('span');
      local.className = 'onde';
      local.textContent = `${onde(p)} [${p.regra}]`;
      li.append(local, document.createTextNode(p.mensagem));
      lista.append(li);
    }
    if (lista.children.length > 0) caixa.append(lista);
  }

  function preencherCampos(config) {
    campos.fonte.value = config.fonteSnippets || '';
    campos.intervalo.value = config.intervaloSyncMin;
    campos.iniciarWindows.checked = Boolean(config.iniciarComWindows);
    campos.minimizarIcone.checked = config.minimizarParaIcone !== false;
    campos.modoAdmin.checked = Boolean(config.modoAdmin);
  }

  botoes.escolher.addEventListener('click', () =>
    comOcupado(botoes.escolher, 'Escolhendo...', async () => {
      const pasta = await api.escolherFonte();
      if (pasta) {
        campos.fonte.value = pasta;
        definirMensagem('');
      }
    }),
  );

  botoes.testar.addEventListener('click', () =>
    comOcupado(botoes.testar, 'Testando...', async () => {
      definirMensagem('');
      mostrarTeste(await api.testarFonte(campos.fonte.value));
    }),
  );

  botoes.salvar.addEventListener('click', () =>
    comOcupado(botoes.salvar, 'Salvando...', async () => {
      definirMensagem('');
      const resposta = await api.salvarConfig({
        fonteSnippets: campos.fonte.value,
        intervaloSyncMin: campos.intervalo.value,
        iniciarComWindows: campos.iniciarWindows.checked,
        minimizarParaIcone: campos.minimizarIcone.checked,
        modoAdmin: campos.modoAdmin.checked,
      });
      if (!resposta.ok) {
        definirMensagem(resposta.erros.join(' '), 'erro');
        return;
      }
      preencherCampos(resposta.config);
      mostrarEstado(resposta.estado);
      definirMensagem('Configurações salvas.', 'ok');
    }),
  );

  botoes.sincronizar.addEventListener('click', () =>
    comOcupado(botoes.sincronizar, 'Sincronizando...', async () => {
      mostrarEstado(await api.sincronizarAgora());
    }),
  );

  botoes.fechar.addEventListener('click', () => window.close());

  // Mantém a "Situação" em dia: principal.js consulta o estado de tempos em tempos e avisa as seções.
  // Durante uma operação desta seção (testar, salvar, sincronizar), a própria operação mostra o resultado.
  aoEstado((estado) => {
    if (!ocupado) mostrarEstado(estado);
  });

  api.lerConfig().then(preencherCampos).catch(() => {});
})();
