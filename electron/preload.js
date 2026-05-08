const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),

  // File system
  scanFolders: (folderPaths) => ipcRenderer.invoke('fs:scanFolders', folderPaths),
  scanFoldersDetailed: (folderPaths) => ipcRenderer.invoke('fs:scanFoldersDetailed', folderPaths),

  // Metadata
  readMetadata: (filePaths) => ipcRenderer.invoke('metadata:read', filePaths),
  reparseMetadata: (filePaths) => ipcRenderer.invoke('metadata:reparse', filePaths),
  lookupMetadataOnline: (seed) => ipcRenderer.invoke('metadata:lookupOnline', seed),
  writeMetadata: (filePath, tags) => ipcRenderer.invoke('metadata:write', filePath, tags),
  getMetadataCacheStats: () => ipcRenderer.invoke('metadata:getCacheStats'),

  // App / updates
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  resetUpdateCache: () => ipcRenderer.invoke('app:resetUpdateCache'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
});
