const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Import services (require after app is ready to ensure native modules load)
let db;
let fileSync;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    show: false,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  // Initialize services
  const Database = require('./services/database');
  fileSync = require('./services/fileSync');
  db = new Database();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ── IPC Handlers ──────────────────────────────────────────────────────────

  // Database: query all tracks
  ipcMain.handle('db:getTracks', (_event, opts) => db.getTracks(opts));

  // Database: search tracks
  ipcMain.handle('db:searchTracks', (_event, query) => db.searchTracks(query));

  // Database: upsert a single track
  ipcMain.handle('db:upsertTrack', (_event, track) => db.upsertTrack(track));

  // Database: delete track by id
  ipcMain.handle('db:deleteTrack', (_event, id) => db.deleteTrack(id));

  // Database: bulk import from directory scan
  ipcMain.handle('db:importDirectory', async (_event, dirPath) => {
    const pairs = await fileSync.discoverPairs(dirPath);
    return db.bulkImport(pairs);
  });

  // File sync: discover .mp3/.cdg pairs in a directory
  ipcMain.handle('fs:discoverPairs', (_event, dirPath) =>
    fileSync.discoverPairs(dirPath)
  );

  // File sync: rename a pair
  ipcMain.handle('fs:renamePair', (_event, { filePath, template, track }) =>
    fileSync.renamePair(filePath, template, track)
  );

  // File sync: batch rename based on a list of operations
  ipcMain.handle('fs:batchRename', (_event, operations) =>
    fileSync.batchRename(operations)
  );

  // Dialog: open directory picker
  ipcMain.handle('dialog:openDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Dialog: open file picker
  ipcMain.handle('dialog:openFile', async (event, filters) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters || [],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // OCR: process a disc image
  ipcMain.handle('ocr:processImage', async (_event, imagePath) => {
    const ocrService = require('./services/ocrService');
    return ocrService.processDiscImage(imagePath);
  });

  // Cleaner: clean a list of filenames
  ipcMain.handle('cleaner:cleanFilenames', (_event, filenames) => {
    const cleaner = require('./services/filenameCleaner');
    return filenames.map((f) => cleaner.cleanFilename(f));
  });

  // Cleaner: clean and update tracks in DB
  ipcMain.handle('cleaner:cleanTracks', (_event, ids) => {
    const cleaner = require('./services/filenameCleaner');
    const tracks = ids.map((id) => db.getTrackById(id));
    return tracks.map((t) => {
      if (!t) return null;
      const cleaned = cleaner.cleanTrackFields(t);
      db.upsertTrack({ ...t, ...cleaned });
      return cleaned;
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
