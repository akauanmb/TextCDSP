'use strict';

// Ponte entre a janela Biblioteca e o processo principal.
// Expõe só os cinco canais IPC abaixo e o aviso "biblioteca:mudou"; nada além disso chega à página.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('textcdsp', {
  listar: () => ipcRenderer.invoke('biblioteca:listar'),
  copiar: (pedido) => ipcRenderer.invoke('biblioteca:copiar', pedido),
  salvarPessoal: (entrada) => ipcRenderer.invoke('pessoal:salvar', entrada),
  excluirPessoal: (pedido) => ipcRenderer.invoke('pessoal:excluir', pedido),
  abrirArquivoPessoal: () => ipcRenderer.invoke('pessoal:abrir-arquivo'),
  // A lista mudou (sincronização aplicou uma versão nova ou um atalho pessoal foi gravado).
  aoMudar: (chamar) => {
    ipcRenderer.on('biblioteca:mudou', () => chamar());
  },
});
