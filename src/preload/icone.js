'use strict';

// Ponte entre a página do ícone flutuante e o processo principal.
// Expõe só estas três funções, uma por canal IPC; nada além disso chega à página.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('textcdspIcone', {
  // Posição de tela desejada para o canto superior esquerdo do ícone. `fim` = true ao soltar o botão.
  mover: (x, y, fim) => ipcRenderer.send('icone:mover', { x, y, fim: fim === true }),
  abrir: () => ipcRenderer.send('icone:abrir'),
  menu: () => ipcRenderer.send('icone:menu'),
});
