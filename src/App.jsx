import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import FileGrid from './components/FileGrid';
import ContextMenu from './components/ContextMenu';
import EditModal from './components/EditModal';
import ToastContainer from './components/ToastContainer';
import { shiftFieldsLeft, shiftFieldsRight, swapArtistTitle, formatSize } from './utils/fileUtils';
import { useToasts, useSelection } from './hooks/useSelectionAndToasts';

const logo = `${import.meta.env.BASE_URL}ikfs-logo.png`;

// ── Sorting helper ──────────────────────────────────────────────────────────
function sortFiles(files, key, dir) {
  if (!key) return files;
  return [...files].sort((a, b) => {
    const av = (a[key] || '').toString().toLowerCase();
    const bv = (b[key] || '').toString().toLowerCase();
    const cmp = av.localeCompare(bv);
    return dir === 'asc' ? cmp : -cmp;
  });
}

export default function App() {
  const [files, setFiles]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [search, setSearch]       = useState('');
  const [sortKey, setSortKey]     = useState('artist');
  const [sortDir, setSortDir]     = useState('asc');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, indices }
  const [editTarget, setEditTarget]   = useState(null); // array of file objects
  const [appVersion, setAppVersion] = useState('dev');
  const [updateStatus, setUpdateStatus] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const { toasts, addToast, removeToast } = useToasts();

  const toShortUpdateMessage = useCallback((message) => {
    if (!message) return 'unknown error';
    const oneLine = String(message).replace(/\s+/g, ' ').trim();
    const cutAt = ['HttpError:', 'at ', '<!DOCTYPE', '<html', '\n'];
    let short = oneLine;
    for (const token of cutAt) {
      const idx = short.indexOf(token);
      if (idx > 0) {
        short = short.slice(0, idx).trim();
      }
    }
    if (short.length > 140) short = `${short.slice(0, 137)}...`;
    return short || 'unknown error';
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    let unsubscribe;
    window.electronAPI.getAppVersion()
      .then((v) => setAppVersion(v || 'dev'))
      .catch(() => setAppVersion('dev'));

    unsubscribe = window.electronAPI.onUpdateStatus((payload) => {
      const status = payload?.status;
      if (status === 'checking') {
        setUpdateStatus('Checking updates…');
        setCheckingUpdate(true);
      } else if (status === 'available') {
        setUpdateStatus(`Update available: v${payload.version}`);
      } else if (status === 'not-available') {
        setUpdateStatus('Up to date');
        setCheckingUpdate(false);
      } else if (status === 'downloading') {
        setUpdateStatus(`Downloading update… ${payload.percent || 0}%`);
      } else if (status === 'downloaded') {
        setUpdateStatus(`Update downloaded: v${payload.version}`);
        setCheckingUpdate(false);
      } else if (status === 'error') {
        const short = toShortUpdateMessage(payload.message);
        setUpdateStatus(`Update error: ${short}`);
        setCheckingUpdate(false);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleCheckUpdates = useCallback(async () => {
    if (!window.electronAPI) {
      addToast('Update check is only available in desktop app', 'info');
      return;
    }

    setCheckingUpdate(true);
    setUpdateStatus('Checking updates…');
    const result = await window.electronAPI.checkForUpdates();
    if (!result?.ok) {
      setCheckingUpdate(false);
      const message = toShortUpdateMessage(result?.message || 'Unable to check for updates');
      setUpdateStatus(`Update error: ${message}`);
      addToast(message, 'error');
    }
  }, [addToast, toShortUpdateMessage]);

  // ── Filtered + sorted view ────────────────────────────────────────────────
  const displayFiles = useMemo(() => {
    let result = files;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f =>
        (f.artist   || '').toLowerCase().includes(q) ||
        (f.title    || '').toLowerCase().includes(q) ||
        (f.album    || '').toLowerCase().includes(q) ||
        (f.discId   || '').toLowerCase().includes(q) ||
        (f.fileName || '').toLowerCase().includes(q)
      );
    }
    return sortFiles(result, sortKey, sortDir);
  }, [files, search, sortKey, sortDir]);

  const { selected, handleRowClick, selectAll, clearSelection, setSelected } =
    useSelection(displayFiles);

  // ── Open folder ──────────────────────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      if (!window.electronAPI) { addToast('Electron API not available (dev mode)', 'error'); return; }
      const folders = await window.electronAPI.openFolder();
      if (!folders.length) return;
      await loadFromPaths(null, folders);
    } catch (err) {
      addToast(`Unable to open folder: ${err?.message || 'unknown error'}`, 'error');
    }
  }, []);

  // ── Open files ───────────────────────────────────────────────────────────
  const handleOpenFiles = useCallback(async () => {
    try {
      if (!window.electronAPI) { addToast('Electron API not available (dev mode)', 'error'); return; }
      const filePaths = await window.electronAPI.openFiles();
      if (!filePaths.length) return;
      await loadFromPaths(filePaths, null);
    } catch (err) {
      addToast(`Unable to open files: ${err?.message || 'unknown error'}`, 'error');
    }
  }, []);

  // ── Core load routine ────────────────────────────────────────────────────
  const loadFromPaths = useCallback(async (filePaths, folderPaths) => {
    setLoading(true);
    setLoadProgress(0);
    clearSelection();

    try {
      let paths = filePaths || [];
      if (folderPaths) {
        paths = await window.electronAPI.scanFolders(folderPaths);
      }
      if (!paths.length) {
        addToast('No supported files found', 'info');
        setLoading(false);
        return;
      }

      // Read metadata in batches so we can show progress
      const BATCH = 50;
      const results = [];
      for (let i = 0; i < paths.length; i += BATCH) {
        const batch = paths.slice(i, i + BATCH);
        const meta = await window.electronAPI.readMetadata(batch);
        results.push(...meta);
        setLoadProgress(Math.round(((i + batch.length) / paths.length) * 100));
      }

      setFiles(results);
      addToast(`Loaded ${results.length} file${results.length !== 1 ? 's' : ''}`, 'success');
    } catch (err) {
      addToast(`Error loading files: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadProgress(100);
    }
  }, [clearSelection, addToast]);

  // ── Sort ─────────────────────────────────────────────────────────────────
  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setSortDir('asc'); }
      return key;
    });
  }, []);

  // ── Context menu ──────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e, clickedIndex) => {
    e.preventDefault();
    // If clicked row isn't selected, select it (unless Ctrl/Shift held)
    if (!selected.has(clickedIndex)) {
      handleRowClick(clickedIndex, e);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, clickedIndex });
  }, [selected, handleRowClick]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // ── Get selected files ────────────────────────────────────────────────────
  const getSelectedFiles = useCallback(() => {
    return [...selected].sort((a, b) => a - b).map(i => displayFiles[i]).filter(Boolean);
  }, [selected, displayFiles]);

  // ── Apply a transform to selected files and save ──────────────────────────
  const applyTransform = useCallback(async (transform, label) => {
    const selFiles = getSelectedFiles();
    if (!selFiles.length) { addToast('No files selected', 'info'); return; }

    const updated = selFiles.map(transform);

    // Write back to disk
    let saveOk = 0;
    let saveErr = 0;
    for (const f of updated) {
      try {
        const res = await window.electronAPI.writeMetadata(f.filePath, {
          artist: f.artist, title: f.title, album: f.album,
          discId: f.discId, year: f.year, track: f.track,
        });
        if (res.ok) saveOk++;
        else saveErr++;
      } catch {
        saveErr++;
      }
    }

    // Update in-memory state
    const updatedMap = new Map(updated.map(f => [f.filePath, f]));
    setFiles(prev => prev.map(f => updatedMap.has(f.filePath) ? updatedMap.get(f.filePath) : f));

    const msg = saveErr
      ? `${label}: updated ${saveOk}, ${saveErr} could not be saved to disk`
      : `${label}: updated ${saveOk} file${saveOk !== 1 ? 's' : ''}`;
    addToast(msg, saveErr ? 'error' : 'success');
  }, [getSelectedFiles, addToast]);

  // ── Bulk save after modal edit ────────────────────────────────────────────
  const handleSaveEdit = useCallback(async (targetFiles, patch) => {
    const updated = targetFiles.map(f => ({ ...f, ...patch }));

    let saveOk = 0;
    let saveErr = 0;
    for (const f of updated) {
      try {
        const res = await window.electronAPI.writeMetadata(f.filePath, {
          artist: f.artist, title: f.title, album: f.album,
          discId: f.discId, year: f.year, track: f.track,
        });
        if (res.ok) saveOk++;
        else saveErr++;
      } catch {
        saveErr++;
      }
    }

    const updatedMap = new Map(updated.map(f => [f.filePath, f]));
    setFiles(prev => prev.map(f => updatedMap.has(f.filePath) ? updatedMap.get(f.filePath) : f));

    const msg = saveErr
      ? `Saved ${saveOk} OK, ${saveErr} failed`
      : `Saved ${saveOk} file${saveOk !== 1 ? 's' : ''}`;
    addToast(msg, saveErr ? 'error' : 'success');
  }, [addToast]);

  // ── Context menu items ────────────────────────────────────────────────────
  const buildContextItems = useCallback(() => {
    const selFiles = getSelectedFiles();
    const count = selFiles.length;
    const label = count === 1 ? '1 file' : `${count} files`;

    return [
      { type: 'header', label: `${label} selected` },
      { icon: '✏️', label: 'Edit Tags…', action: () => setEditTarget(selFiles) },
      { type: 'separator' },
      { type: 'header', label: 'Field Shift (Artist → Title → Album)' },
      {
        icon: '◀',
        label: 'Shift Fields Left',
        action: () => applyTransform(shiftFieldsLeft, 'Shift Left'),
      },
      {
        icon: '▶',
        label: 'Shift Fields Right',
        action: () => applyTransform(shiftFieldsRight, 'Shift Right'),
      },
      {
        icon: '↔',
        label: 'Swap Artist ↔ Title',
        action: () => applyTransform(swapArtistTitle, 'Swap Artist/Title'),
      },
      { type: 'separator' },
      {
        icon: '☑',
        label: 'Select All',
        action: selectAll,
      },
      {
        icon: '✕',
        label: 'Clear Selection',
        action: clearSelection,
      },
    ];
  }, [getSelectedFiles, applyTransform, selectAll, clearSelection]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      if (e.key === 'F2') {
        const selFiles = getSelectedFiles();
        if (selFiles.length) setEditTarget(selFiles);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectAll, getSelectedFiles]);

  // ── Click outside grid to close context menu ──────────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const h = () => setContextMenu(null);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [contextMenu]);

  // ── Total size ────────────────────────────────────────────────────────────
  const totalSize = useMemo(() =>
    files.reduce((sum, f) => sum + (f.size || 0), 0), [files]);

  return (
    <div className="app">
      {/* ── Toolbar ── */}
      <div className="toolbar">
        <img src={logo} alt="IKFS logo" className="toolbar-logo" />
        <span className="toolbar-title">IronOrr Karaoke File System (IKFS)</span>

        <button className="btn primary" onClick={handleOpenFolder} disabled={loading} title="Open a folder (all sub-folders are scanned)">
          📂 Open Folder
        </button>
        <button className="btn" onClick={handleOpenFiles} disabled={loading} title="Select individual files">
          🎵 Open Files
        </button>

        <div className="toolbar-sep" />

        <button
          className="btn"
          disabled={!selected.size || loading}
          onClick={() => applyTransform(shiftFieldsLeft, 'Shift Left')}
          title="Shift fields left: Title→Artist, Album→Title, Artist→Album"
        >
          ◀ Shift Left
        </button>
        <button
          className="btn"
          disabled={!selected.size || loading}
          onClick={() => applyTransform(shiftFieldsRight, 'Shift Right')}
          title="Shift fields right: Artist→Title, Title→Album, Album→Artist"
        >
          Shift Right ▶
        </button>
        <button
          className="btn"
          disabled={!selected.size || loading}
          onClick={() => applyTransform(swapArtistTitle, 'Swap Artist/Title')}
          title="Swap Artist ↔ Title"
        >
          ↔ Swap Artist/Title
        </button>

        <div className="toolbar-sep" />

        <button
          className="btn"
          disabled={!selected.size || loading}
          onClick={() => { const f = getSelectedFiles(); if (f.length) setEditTarget(f); }}
          title="Edit tags for selected files (F2)"
        >
          ✏️ Edit Tags
        </button>

        <div className="toolbar-spacer" />

        <input
          className="search-input"
          placeholder="🔍 Search artist, title, file…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Main content ── */}
      <div className="grid-area">
        <img src={logo} alt="" className="grid-watermark" aria-hidden="true" />
        {loading && (
          <div style={{ padding: '8px 12px', background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading… {loadProgress}%</span>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${loadProgress}%` }} />
            </div>
          </div>
        )}

        {!loading && files.length === 0 ? (
          <div className="empty-state">
            <img src={logo} alt="IKFS logo" className="empty-logo" />
            <h2>IronOrr Karaoke File System (IKFS)</h2>
            <p>
              Click <strong>Open Folder</strong> to load a directory of karaoke files, or
              use <strong>Open Files</strong> to select individual tracks.
              <br /><br />
              Supported formats: MP3, WAV, MP4, MKV, CDG, MP3+G (ZIP), KAR, OGG, FLAC, M4A, WMA
            </p>
          </div>
        ) : (
          <>
            {/* Select-all bar */}
            {displayFiles.length > 0 && (
              <div style={{ padding: '4px 12px', background: 'var(--toolbar-bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={selected.size === displayFiles.length ? clearSelection : selectAll}
                >
                  {selected.size === displayFiles.length ? 'Deselect All' : 'Select All'}
                </button>
                <span>{displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''} shown</span>
                {selected.size > 0 && <span style={{ color: 'var(--accent2)' }}>{selected.size} selected</span>}
                {search && files.length !== displayFiles.length && (
                  <span style={{ color: 'var(--warning)' }}>({files.length - displayFiles.length} hidden by search)</span>
                )}
              </div>
            )}

            <FileGrid
              files={displayFiles}
              selected={selected}
              onRowClick={handleRowClick}
              onRowDoubleClick={(file) => setEditTarget([file])}
              onContextMenu={handleContextMenu}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </>
        )}
      </div>

      {/* ── Status bar ── */}
      <div className="statusbar">
        <span>
          <span className={`status-dot${loading ? ' loading' : ''}`} />
          {loading ? 'Loading…' : 'Ready'}
        </span>
        {files.length > 0 && (
          <>
            <span>📁 {files.length} files · {formatSize(totalSize)}</span>
            {selected.size > 0 && <span>✅ {selected.size} selected</span>}
          </>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}
          >v{appVersion} · {updateStatus || 'No update check yet'}</span
        >
        <button
          className="btn"
          style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}
          onClick={handleCheckUpdates}
          disabled={checkingUpdate}
          title="Check for updates"
        >
          {checkingUpdate ? 'Checking…' : 'Check Updates'}
        </button>
        <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-dim)' }}>Created by Kilby · IronOrr26</span>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems()}
          onClose={closeContextMenu}
        />
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <EditModal
          files={editTarget}
          onSave={handleSaveEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
