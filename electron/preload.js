const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),

  // File system
  scanFolders: (folderPaths) => ipcRenderer.invoke('fs:scanFolders', folderPaths),

  // Metadata
  readMetadata: (filePaths) => ipcRenderer.invoke('metadata:read', filePaths),
  writeMetadata: (filePath, tags) => ipcRenderer.invoke('metadata:write', filePath, tags),

  // App / updates
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
});
