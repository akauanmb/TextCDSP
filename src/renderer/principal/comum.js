'use strict';

// Peças compartilhadas pelas seções da janela principal (carregado antes de biblioteca.js, configuracoes.js e
// principal.js): a ponte com o processo principal, ajudantes de DOM, a seção ativa e o estado da sincronização.
// Todo texto vindo de fora entra na página por textContent (nunca como HTML).

(function () {
  const SECOES = ['biblioteca', 'configuracoes'];
  let ativa = 'biblioteca';
  const ouvintesDeSecao = [];
  const ouvintesDeEstado = [];

  const $ = (id) => document.getElementById(id);

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

  // Mostra uma seção e esconde a outra. As seções nunca são recriadas: o que foi digitado fica onde está.
  function irParaSecao(nome) {
    if (!SECOES.includes(nome)) return;
    const anterior = ativa;
    ativa = nome;
    for (const secao of SECOES) {
      $(`secao-${secao}`).hidden = secao !== nome;
      const botao = $(`menu-${secao}`);
      botao.classList.toggle('ativo', secao === nome);
      if (secao === nome) botao.setAttribute('aria-current', 'page');
      else botao.removeAttribute('aria-current');
    }
    if (anterior !== nome) for (const ouvinte of ouvintesDeSecao) ouvinte(nome);
  }

  window.CDSPComum = {
    api: window.textcdsp,
    SECOES,
    $,
    el,
    irParaSecao,
    secaoAtiva: () => ativa,
    aoMudarSecao: (ouvinte) => ouvintesDeSecao.push(ouvinte),
    // O estado da sincronização chega de tempos em tempos (principal.js); as seções que o mostram se registram aqui.
    aoEstado: (ouvinte) => ouvintesDeEstado.push(ouvinte),
    publicarEstado: (estado) => ouvintesDeEstado.forEach((ouvinte) => ouvinte(estado)),
  };
})();
