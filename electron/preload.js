const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a safe, typed API to the renderer process via window.kjAPI.
 * Only whitelisted channels are forwarded to ipcMain.
 */
contextBridge.exposeInMainWorld('kjAPI', {
  // ── Database ──────────────────────────────────────────────────────────────
  db: {
    getTracks: (opts) => ipcRenderer.invoke('db:getTracks', opts),
    searchTracks: (query) => ipcRenderer.invoke('db:searchTracks', query),
    upsertTrack: (track) => ipcRenderer.invoke('db:upsertTrack', track),
    deleteTrack: (id) => ipcRenderer.invoke('db:deleteTrack', id),
    importDirectory: (dirPath) =>
      ipcRenderer.invoke('db:importDirectory', dirPath),
  },

  // ── File Sync ─────────────────────────────────────────────────────────────
  fs: {
    discoverPairs: (dirPath) => ipcRenderer.invoke('fs:discoverPairs', dirPath),
    renamePair: (args) => ipcRenderer.invoke('fs:renamePair', args),
    batchRename: (operations) => ipcRenderer.invoke('fs:batchRename', operations),
  },

  // ── Dialogs ───────────────────────────────────────────────────────────────
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  },

  // ── OCR ───────────────────────────────────────────────────────────────────
  ocr: {
    processImage: (imagePath) =>
      ipcRenderer.invoke('ocr:processImage', imagePath),
  },

  // ── Filename Cleaner ──────────────────────────────────────────────────────
  cleaner: {
    cleanFilenames: (filenames) =>
      ipcRenderer.invoke('cleaner:cleanFilenames', filenames),
    cleanTracks: (ids) => ipcRenderer.invoke('cleaner:cleanTracks', ids),
  },
});
