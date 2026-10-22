const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameConsoleAPI', {
  getLogs: () => ipcRenderer.invoke('console:get-logs'),
  clearLogs: () => ipcRenderer.invoke('console:clear'),
  close: () => ipcRenderer.send('console:close'),
  onLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on('console:log', listener);
    return () => ipcRenderer.removeListener('console:log', listener);
  },
});
