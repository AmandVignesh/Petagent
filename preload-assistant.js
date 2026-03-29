const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantAPI', {
  setWindowSize: (width, height) => ipcRenderer.send('assistant-set-size', width, height),
  sendQuery: (message) => ipcRenderer.invoke('gemini-query', message)
});
