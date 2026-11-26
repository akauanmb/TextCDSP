'use strict';

// Ponte entre a janela de configurações e o processo principal.
// Expõe só estas seis funções, uma por canal IPC; nada além disso chega à página.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('textcdsp', {
  lerConfig: () => ipcRenderer.invoke('config:ler'),
  salvarConfig: (configuracao) => ipcRenderer.invoke('config:salvar', configuracao),
  escolherFonte: () => ipcRenderer.invoke('fonte:escolher'),
  testarFonte: (pasta) => ipcRenderer.invoke('fonte:testar', pasta),
  estadoSync: () => ipcRenderer.invoke('sync:estado'),
  sincronizarAgora: () => ipcRenderer.invoke('sync:agora'),
});
