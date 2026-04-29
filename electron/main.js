const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

let mainWindow;

function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', { status, ...data });
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info?.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
  autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: err?.message || 'Unknown updater error' }));
  autoUpdater.on('download-progress', (progress) => sendUpdateStatus('downloading', {
    percent: Math.round(progress?.percent || 0),
  }));

  autoUpdater.on('update-downloaded', async (info) => {
    sendUpdateStatus('downloaded', { version: info?.version });
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info?.version || 'new'} is ready to install.`,
      detail: 'Restart now to install the update?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'IronOrr Karaoke File Software (IKFS)',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#1a1a2e',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    setupAutoUpdater();
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        sendUpdateStatus('error', { message: err?.message || 'Failed to check for updates' });
      });
    }, 2500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Open folder dialog ──────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

// ── IPC: Open file dialog ────────────────────────────────────────────────────
ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Karaoke / Audio / Video',
        extensions: ['mp3', 'wav', 'mp4', 'mkv', 'cdg', 'zip', 'kar', 'ogg', 'flac', 'm4a', 'wma'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

// ── IPC: Scan a list of folders for files ───────────────────────────────────
function scanFolder(folderPath, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      scanFolder(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

ipcMain.handle('fs:scanFolders', async (_event, folderPaths) => {
  const files = [];
  for (const fp of folderPaths) {
    scanFolder(fp, files);
  }
  return files;
});

function extractDiscIdFromText(text) {
  const normalized = (text || '').toUpperCase();
  const patterns = [
    /\b([A-Z]{2,5})\s*-?\s*(\d{2,5})\s*[-_\s]\s*(\d{1,2})\b/,
    /\b([A-Z]{2,5})(\d{2,5})[-_\s](\d{1,2})\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const brand = match[1];
      const volume = match[2];
      const trackNo = match[3].padStart(2, '0');
      return {
        discId: `${brand}${volume}-${trackNo}`,
        raw: match[0],
      };
    }
  }

  return { discId: '', raw: '' };
}

function parseFromFileName(baseName) {
  const clean = baseName.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const { discId, raw } = extractDiscIdFromText(clean);

  const withoutDisc = raw
    ? clean.replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/^[-\s]+|[-\s]+$/g, '').trim()
    : clean;

  const parts = withoutDisc.split(/\s+-\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return {
      discId,
      artist: parts[0] || '',
      title: parts.slice(1).join(' - ') || '',
    };
  }

  return { discId, artist: '', title: withoutDisc };
}

// ── IPC: Read metadata for a list of file paths ──────────────────────────────
ipcMain.handle('metadata:read', async (_event, filePaths) => {
  const { parseFile } = await import('music-metadata');
  const results = [];

  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase().slice(1);
    const stat = fs.statSync(fp);

    let artist = '';
    let title = '';
    let album = '';
    let discId = '';
    let year = '';
    let track = '';

    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'wma', 'mp4', 'mkv'].includes(ext)) {
      try {
        const meta = await parseFile(fp, { duration: false, skipCovers: true });
        artist = meta.common.artist || '';
        title = meta.common.title || '';
        album = meta.common.album || '';
        discId = Array.isArray(meta.common.comment)
          ? (meta.common.comment[0] || '')
          : (meta.common.comment || '');
        year = meta.common.year ? String(meta.common.year) : '';
        track = meta.common.track && meta.common.track.no ? String(meta.common.track.no) : '';
      } catch {
        // leave empty — file may have no tags
      }
    } else if (ext === 'zip') {
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(fp);
        const mp3Entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.mp3'));
        if (mp3Entry) {
          const buf = mp3Entry.getData();
          const tmpMp3 = path.join(app.getPath('temp'), '__ikfs_tmp__.mp3');
          fs.writeFileSync(tmpMp3, buf);
          try {
            const meta = await parseFile(tmpMp3, { duration: false, skipCovers: true });
            artist = meta.common.artist || '';
            title = meta.common.title || '';
            album = meta.common.album || '';
            discId = Array.isArray(meta.common.comment)
              ? (meta.common.comment[0] || '')
              : (meta.common.comment || '');
            year = meta.common.year ? String(meta.common.year) : '';
            track = meta.common.track && meta.common.track.no ? String(meta.common.track.no) : '';
          } catch { /* empty */ }
          try { fs.unlinkSync(tmpMp3); } catch { /* empty */ }
        }
      } catch { /* empty */ }
    }

    const baseName = path.basename(fp, path.extname(fp));

    if (!discId) {
      discId = extractDiscIdFromText(baseName).discId;
    }

    if (ext === 'cdg' || ext === 'kar' || (!artist && !title && !discId)) {
      const parsed = parseFromFileName(baseName);
      artist = artist || parsed.artist;
      title = title || parsed.title;
      discId = discId || parsed.discId;
    }

    results.push({
      filePath: fp,
      fileName: path.basename(fp),
      ext: ext.toUpperCase(),
      size: stat.size,
      artist,
      title,
      album,
      discId,
      year,
      track,
      baseName,
    });
  }
  return results;
});

// ── IPC: Write metadata back to file ─────────────────────────────────────────
ipcMain.handle('metadata:write', async (_event, filePath, tags) => {
  const ext = path.extname(filePath).toLowerCase().slice(1);

  if (ext === 'mp3') {
    const NodeID3 = require('node-id3');
    const existing = NodeID3.read(filePath) || {};
    const merged = {
      ...existing,
      artist: tags.artist !== undefined ? tags.artist : existing.artist,
      title: tags.title !== undefined ? tags.title : existing.title,
      album: tags.album !== undefined ? tags.album : existing.album,
      year: tags.year !== undefined ? tags.year : existing.year,
      trackNumber: tags.track !== undefined ? tags.track : existing.trackNumber,
    };
    if (tags.discId !== undefined) {
      merged.comment = { language: 'eng', shortText: '', text: tags.discId };
    }
    const success = NodeID3.write(merged, filePath);
    return { ok: success !== false };
  }

  if (ext === 'zip') {
    try {
      const AdmZip = require('adm-zip');
      const NodeID3 = require('node-id3');
      const zip = new AdmZip(filePath);
      const mp3Entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.mp3'));
      if (!mp3Entry) return { ok: false, error: 'No MP3 inside zip' };

      const buf = mp3Entry.getData();
      const existing = NodeID3.read(buf) || {};
      const merged = {
        ...existing,
        artist: tags.artist !== undefined ? tags.artist : existing.artist,
        title: tags.title !== undefined ? tags.title : existing.title,
        album: tags.album !== undefined ? tags.album : existing.album,
        year: tags.year !== undefined ? tags.year : existing.year,
        trackNumber: tags.track !== undefined ? tags.track : existing.trackNumber,
      };
      if (tags.discId !== undefined) {
        merged.comment = { language: 'eng', shortText: '', text: tags.discId };
      }
      const newBuf = NodeID3.write(merged, buf);
      zip.updateFile(mp3Entry.entryName, newBuf);
      zip.writeZip(filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: `Tag writing not supported for .${ext} files yet` };
});

// ── IPC: App version and updates ────────────────────────────────────────────
ipcMain.handle('app:getVersion', async () => app.getVersion());
ipcMain.handle('app:checkForUpdates', async () => {
  if (isDev) {
    return { ok: false, message: 'Updater is disabled in development mode' };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || 'Failed to check for updates' };
  }
});
