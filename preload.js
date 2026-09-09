const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Prolabore (tabelas relacionais próprias)
  loadState: () => ipcRenderer.sendSync('db:load'),
  saveState: (state) => ipcRenderer.sendSync('db:save', state),

  // Estado genérico dos demais apps (substitui o localStorage deles)
  appGet: (app, key) => ipcRenderer.sendSync('app:get', app, key),
  appSet: (app, key, value) => ipcRenderer.sendSync('app:set', app, key, value),
  appRemove: (app, key) => ipcRenderer.sendSync('app:remove', app, key),
  appKeys: (app) => ipcRenderer.sendSync('app:keys', app),
  historyInfo: () => ipcRenderer.sendSync('app:historyInfo'),
  abrirWhatsApp: (url) => ipcRenderer.sendSync('app:abrirWhatsApp', url),
  enviarParaPedidos: (pedido) => ipcRenderer.sendSync('app:enviarParaPedidos', pedido),

  salvarBaixa: (nome, conteudo) => ipcRenderer.sendSync('app:salvarBaixa', nome, conteudo),
  abrirPastaBaixas: () => ipcRenderer.send('app:abrirPastaBaixas'),

  openBackupFolder: () => ipcRenderer.send('db:openBackupFolder'),
  backupInfo: () => ipcRenderer.sendSync('db:backupInfo'),

  // atualizações
  versao: () => ipcRenderer.sendSync('app:version'),
  procurarAtualizacao: () => ipcRenderer.send('update:check'),
  baixarAtualizacao: () => ipcRenderer.send('update:download'),
  instalarAtualizacao: () => ipcRenderer.send('update:install'),
  aoAtualizar: (cb) => ipcRenderer.on('update:status', (_e, info) => cb(info))
});
