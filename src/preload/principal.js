'use strict';

// Ponte entre a janela principal (Biblioteca + Configurações) e o processo principal.
// Expõe só as funções abaixo, uma por canal IPC; nada além disso chega à página.
//   biblioteca:listar, biblioteca:copiar, pessoal:salvar, pessoal:excluir, pessoal:abrir-arquivo
//   config:ler, config:salvar, fonte:escolher, fonte:testar, sync:estado, sync:agora
//   janela:minimizar-para-icone (da página para o processo principal)
// e dois avisos do processo principal para a página: biblioteca:mudou e janela:secao.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('textcdsp', {
  // Biblioteca
  listar: () => ipcRenderer.invoke('biblioteca:listar'),
  copiar: (pedido) => ipcRenderer.invoke('biblioteca:copiar', pedido),
  salvarPessoal: (entrada) => ipcRenderer.invoke('pessoal:salvar', entrada),
  excluirPessoal: (pedido) => ipcRenderer.invoke('pessoal:excluir', pedido),
  abrirArquivoPessoal: () => ipcRenderer.invoke('pessoal:abrir-arquivo'),
  // A lista mudou (sincronização aplicou uma versão nova ou um atalho pessoal foi gravado).
  aoMudar: (chamar) => {
    ipcRenderer.on('biblioteca:mudou', () => chamar());
  },

  // Configurações
  lerConfig: () => ipcRenderer.invoke('config:ler'),
  salvarConfig: (configuracao) => ipcRenderer.invoke('config:salvar', configuracao),
  escolherFonte: () => ipcRenderer.invoke('fonte:escolher'),
  testarFonte: (pasta) => ipcRenderer.invoke('fonte:testar', pasta),
  estadoSync: () => ipcRenderer.invoke('sync:estado'),
  sincronizarAgora: () => ipcRenderer.invoke('sync:agora'),

  // Janela
  minimizarParaIcone: () => ipcRenderer.invoke('janela:minimizar-para-icone'),
  // O processo principal pede para abrir numa seção ("biblioteca" ou "configuracoes").
  aoAbrirSecao: (chamar) => {
    ipcRenderer.on('janela:secao', (_evento, secao) => chamar(secao));
  },
});
