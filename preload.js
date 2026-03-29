const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setWindowSize: (width, height) => ipcRenderer.send('set-window-size', width, height),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  getModelsPath: () => ipcRenderer.invoke('get-models-path'),
  onMediaUpdate: (callback) => ipcRenderer.on('media-update', (_event, data) => callback(data))
});
