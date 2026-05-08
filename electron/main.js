const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

let mainWindow;
let ffmpegBinaryPath = process.env.FFMPEG_PATH || null;
if (!ffmpegBinaryPath) {
  try {
    ffmpegBinaryPath = require('ffmpeg-static');
  } catch {
    ffmpegBinaryPath = null;
  }
}

const METADATA_CACHE_VERSION = 1;
const METADATA_CACHE_MAX_ENTRIES = 200000;
let metadataCache = new Map();
let metadataCacheLoaded = false;
let metadataCacheDirty = false;
let metadataCacheFlushTimer = null;
let metadataCacheStats = { hits: 0, misses: 0 };

function getMetadataCachePath() {
  return path.join(app.getPath('userData'), 'metadata-cache.json');
}

function ensureMetadataCacheLoaded() {
  if (metadataCacheLoaded) return;
  metadataCacheLoaded = true;

  const cachePath = getMetadataCachePath();
  try {
    if (!fs.existsSync(cachePath)) return;
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== METADATA_CACHE_VERSION || !Array.isArray(parsed.entries)) return;
    metadataCache = new Map(parsed.entries);
  } catch (err) {
    console.warn(`Failed to load metadata cache: ${err?.message || err}`);
    metadataCache = new Map();
  }
}

async function flushMetadataCacheNow() {
  if (!metadataCacheDirty) return;
  metadataCacheDirty = false;

  const cachePath = getMetadataCachePath();
  const payload = {
    version: METADATA_CACHE_VERSION,
    entries: Array.from(metadataCache.entries()),
  };

  try {
    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.promises.writeFile(cachePath, JSON.stringify(payload), 'utf8');
  } catch (err) {
    console.warn(`Failed to persist metadata cache: ${err?.message || err}`);
  }
}

function scheduleMetadataCacheFlush() {
  metadataCacheDirty = true;
  if (metadataCacheFlushTimer) return;
  metadataCacheFlushTimer = setTimeout(async () => {
    metadataCacheFlushTimer = null;
    await flushMetadataCacheNow();
  }, 1500);
}

function metadataFingerprint(stat) {
  return `${Math.trunc(stat?.mtimeMs || 0)}:${stat?.size || 0}`;
}

function getCachedMetadata(filePath, stat) {
  ensureMetadataCacheLoaded();
  const entry = metadataCache.get(filePath);
  if (!entry) {
    metadataCacheStats.misses += 1;
    return null;
  }
  if (entry.fp !== metadataFingerprint(stat)) {
    metadataCacheStats.misses += 1;
    return null;
  }
  metadataCacheStats.hits += 1;
  return entry.data || null;
}

function setCachedMetadata(filePath, stat, data) {
  ensureMetadataCacheLoaded();
  if (metadataCache.has(filePath)) metadataCache.delete(filePath);
  metadataCache.set(filePath, {
    fp: metadataFingerprint(stat),
    data,
    ts: Date.now(),
  });

  while (metadataCache.size > METADATA_CACHE_MAX_ENTRIES) {
    const oldestKey = metadataCache.keys().next().value;
    if (!oldestKey) break;
    metadataCache.delete(oldestKey);
  }

  scheduleMetadataCacheFlush();
}

function invalidateCachedMetadata(filePath) {
  ensureMetadataCacheLoaded();
  if (!metadataCache.has(filePath)) return;
  metadataCache.delete(filePath);
  scheduleMetadataCacheFlush();
}

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
      sandbox: true,
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

app.on('before-quit', () => {
  if (metadataCacheFlushTimer) {
    clearTimeout(metadataCacheFlushTimer);
    metadataCacheFlushTimer = null;
  }
  // Best-effort synchronous flush during app shutdown.
  if (!metadataCacheDirty) return;
  metadataCacheDirty = false;
  try {
    const cachePath = getMetadataCachePath();
    const payload = {
      version: METADATA_CACHE_VERSION,
      entries: Array.from(metadataCache.entries()),
    };
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
  } catch {
    // Ignore shutdown flush failures.
  }
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
const SCAN_SUPPORTED_EXTS = new Set(['mp3', 'wav', 'mp4', 'mkv', 'cdg', 'zip', 'kar', 'ogg', 'flac', 'm4a', 'wma']);
const SCAN_MAX_FILES = 50000;

function scanFoldersDetailed(folderPaths) {
  const stack = [...folderPaths];
  const files = [];
  let seenFiles = 0;
  let skippedUnsupported = 0;

  while (stack.length && files.length < SCAN_MAX_FILES) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= SCAN_MAX_FILES) break;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      seenFiles += 1;
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!SCAN_SUPPORTED_EXTS.has(ext)) {
        skippedUnsupported += 1;
        continue;
      }

      files.push(fullPath);
    }
  }

  return {
    files,
    seenFiles,
    skippedUnsupported,
    truncated: stack.length > 0 || files.length >= SCAN_MAX_FILES,
    maxFiles: SCAN_MAX_FILES,
  };
}

ipcMain.handle('fs:scanFoldersDetailed', async (_event, folderPaths) => scanFoldersDetailed(folderPaths || []));

// Backward-compatible IPC used by older renderer builds.
ipcMain.handle('fs:scanFolders', async (_event, folderPaths) => {
  const details = scanFoldersDetailed(folderPaths || []);
  return details.files;
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
    let stat;
    try {
      stat = await fs.promises.stat(fp);
    } catch {
      continue;
    }

    const cached = getCachedMetadata(fp, stat);
    if (cached) {
      results.push(cached);
      continue;
    }

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
        const rawComment = Array.isArray(meta.common.comment)
          ? meta.common.comment[0]
          : meta.common.comment;
        discId = (typeof rawComment === 'object' && rawComment !== null)
          ? (rawComment.text || '')
          : (rawComment || '');
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
          const tmpMp3 = path.join(app.getPath('temp'), `__ikfs_tmp_${Date.now()}__.mp3`);
          fs.writeFileSync(tmpMp3, buf);
          try {
            const meta = await parseFile(tmpMp3, { duration: false, skipCovers: true });
            artist = meta.common.artist || '';
            title = meta.common.title || '';
            album = meta.common.album || '';
            const rawComment = Array.isArray(meta.common.comment)
              ? meta.common.comment[0]
              : meta.common.comment;
            discId = (typeof rawComment === 'object' && rawComment !== null)
              ? (rawComment.text || '')
              : (rawComment || '');
            year = meta.common.year ? String(meta.common.year) : '';
            track = meta.common.track && meta.common.track.no ? String(meta.common.track.no) : '';
          } catch { /* empty */ }
          try { fs.unlinkSync(tmpMp3); } catch { /* empty */ }
        }
      } catch { /* empty */ }
    }

    const baseName = path.basename(fp, path.extname(fp));

    // Always prefer a catalog disc ID extracted from the filename (e.g. KTYD486-08).
    // Comment tags rarely contain structured disc IDs; if the filename has one, use it.
    const fileDiscId = extractDiscIdFromText(baseName).discId;
    if (fileDiscId) {
      discId = fileDiscId;
    } else if (!discId) {
      discId = '';
    }

    if (ext === 'cdg' || ext === 'kar' || (!artist && !title && !discId)) {
      const parsed = parseFromFileName(baseName);
      artist = artist || parsed.artist;
      title = title || parsed.title;
      discId = discId || parsed.discId;
    }

    const record = {
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
    };
    results.push(record);
    setCachedMetadata(fp, stat, record);
  }
  return results;
});

ipcMain.handle('metadata:getCacheStats', async () => {
  ensureMetadataCacheLoaded();
  return {
    ...metadataCacheStats,
    entries: metadataCache.size,
  };
});

// ── IPC: Write metadata back to file ─────────────────────────────────────────
function normalizeTagValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function metadataPairsForExt(tags, ext) {
  const artist = normalizeTagValue(tags.artist);
  const title = normalizeTagValue(tags.title);
  const album = normalizeTagValue(tags.album);
  const year = normalizeTagValue(tags.year);
  const track = normalizeTagValue(tags.track);
  const discId = normalizeTagValue(tags.discId);

  const pairs = [];
  if (artist) pairs.push(['artist', artist]);
  if (title) pairs.push(['title', title]);
  if (album) pairs.push(['album', album]);
  if (year) {
    pairs.push(['date', year]);
    if (ext === 'flac' || ext === 'ogg' || ext === 'wav') pairs.push(['year', year]);
  }
  if (track) pairs.push(['track', track]);
  if (discId) pairs.push(['comment', discId]);

  if (ext === 'wma' && artist) {
    pairs.push(['WM/AlbumArtist', artist]);
  }

  return pairs;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinaryPath, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function replaceFileAtomic(tmpPath, finalPath) {
  try {
    await fs.promises.rename(tmpPath, finalPath);
  } catch (err) {
    if (err?.code === 'EXDEV' || err?.code === 'EEXIST' || err?.code === 'EPERM') {
      await fs.promises.copyFile(tmpPath, finalPath);
      await fs.promises.unlink(tmpPath).catch(() => {});
      return;
    }
    throw err;
  }
}

async function writeMetadataWithFfmpeg(filePath, tags, ext) {
  if (!ffmpegBinaryPath) {
    return { ok: false, error: 'FFmpeg binary not found. Install ffmpeg-static or set FFMPEG_PATH.' };
  }

  const dir = path.dirname(filePath);
  try {
    await fs.promises.access(dir, fs.constants.W_OK);
  } catch {
    return { ok: false, error: `No write permission for folder: ${dir}` };
  }

  const tmpPath = path.join(
    dir,
    `${path.basename(filePath, path.extname(filePath))}.ikfs-tmp-${Date.now()}${path.extname(filePath)}`,
  );

  const ffArgs = ['-y', '-i', filePath, '-map', '0', '-c', 'copy'];
  for (const [k, v] of metadataPairsForExt(tags, ext)) {
    ffArgs.push('-metadata', `${k}=${v}`);
  }
  ffArgs.push(tmpPath);

  try {
    await runFfmpeg(ffArgs);
    await replaceFileAtomic(tmpPath, filePath);
    return { ok: true };
  } catch (err) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    return { ok: false, error: err?.message || 'FFmpeg metadata write failed' };
  }
}

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
    if (success !== false) invalidateCachedMetadata(filePath);
    return { ok: success !== false };
  }

  if (ext === 'zip') {
    const tmpZip = path.join(
      path.dirname(filePath),
      `${path.basename(filePath, path.extname(filePath))}.ikfs-tmp-${Date.now()}.zip`,
    );
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
      // Write to a temp file first, then atomically replace the original
      zip.writeZip(tmpZip);
      await replaceFileAtomic(tmpZip, filePath);
      invalidateCachedMetadata(filePath);
      return { ok: true };
    } catch (err) {
      await fs.promises.unlink(tmpZip).catch(() => {});
      return { ok: false, error: err.message };
    }
  }

  if (ext === 'cdg' || ext === 'kar') {
    return { ok: false, error: `Tag writing not supported for .${ext} files` };
  }

  const ffmpegResult = await writeMetadataWithFfmpeg(filePath, tags || {}, ext);
  if (ffmpegResult?.ok) invalidateCachedMetadata(filePath);
  return ffmpegResult;
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
