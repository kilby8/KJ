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
});
