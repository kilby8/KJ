import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './Library.module.css';

const PAGE_SIZE = 100;
const SORT_COLS = ['artist', 'title', 'disc_id', 'file_path'];

export default function Library() {
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [orderBy, setOrderBy] = useState('artist');
  const [dir, setDir] = useState('ASC');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editTrack, setEditTrack] = useState(null);
  const searchTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = query.trim()
        ? await window.kjAPI.db.searchTracks(query.trim())
        : await window.kjAPI.db.getTracks({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            orderBy,
            dir,
          });
      setTracks(result.rows || []);
      setTotal(result.total || 0);
    } finally {
      setLoading(false);
    }
  }, [query, page, orderBy, dir]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e) => {
    clearTimeout(searchTimer.current);
    const val = e.target.value;
    setQuery(val);
    setPage(0);
    searchTimer.current = setTimeout(load, 300);
  };

  const handleSort = (col) => {
    if (orderBy === col) setDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
    else { setOrderBy(col); setDir('ASC'); }
    setPage(0);
  };

  const handleImport = async () => {
    const dir = await window.kjAPI.dialog.openDirectory();
    if (!dir) return;
    setLoading(true);
    const result = await window.kjAPI.db.importDirectory(dir);
    alert(`Import complete: ${result.inserted} inserted, ${result.skipped} skipped.`);
    setPage(0);
    load();
  };

  const handleDelete = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} track(s)?`)) return;
    for (const id of selected) {
      await window.kjAPI.db.deleteTrack(id);
    }
    setSelected(new Set());
    load();
  };

  const handleSaveEdit = async (updated) => {
    await window.kjAPI.db.upsertTrack(updated);
    setEditTrack(null);
    load();
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search artist, title, disc ID…"
          value={query}
          onChange={handleSearch}
        />
        <button className={styles.btn} onClick={handleImport}>
          📂 Import Folder
        </button>
        {selected.size > 0 && (
          <button className={`${styles.btn} ${styles.danger}`} onClick={handleDelete}>
            🗑 Delete ({selected.size})
          </button>
        )}
        <span className={styles.count}>{total.toLocaleString()} tracks</span>
      </div>

      {loading && <div className={styles.loading}>Loading…</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(tracks.map((t) => t.id)) : new Set())
                  }
                  checked={selected.size === tracks.length && tracks.length > 0}
                />
              </th>
              {SORT_COLS.map((col) => (
                <th
                  key={col}
                  className={styles.th}
                  onClick={() => handleSort(col)}
                >
                  {col.replace('_', ' ')}
                  {orderBy === col && (dir === 'ASC' ? ' ▲' : ' ▼')}
                </th>
              ))}
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr
                key={track.id}
                className={`${styles.row} ${selected.has(track.id) ? styles.selected : ''}`}
                onClick={() => toggleSelect(track.id)}
              >
                <td className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={selected.has(track.id)}
                    readOnly
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>{track.artist}</td>
                <td>{track.title}</td>
                <td className={styles.mono}>{track.disc_id}</td>
                <td className={`${styles.mono} ${styles.path}`} title={track.file_path}>
                  {track.file_path}
                </td>
                <td>
                  <button
                    className={styles.editBtn}
                    onClick={(e) => { e.stopPropagation(); setEditTrack({ ...track }); }}
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
            {!loading && tracks.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  No tracks found. Import a folder to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!query && totalPages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>◀ Prev</button>
          <span>Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next ▶</button>
        </div>
      )}

      {editTrack && (
        <EditModal track={editTrack} onSave={handleSaveEdit} onClose={() => setEditTrack(null)} />
      )}
    </div>
  );
}

function EditModal({ track, onSave, onClose }) {
  const [form, setForm] = useState({ ...track });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Edit Track</h2>
        <label>Artist<input value={form.artist} onChange={set('artist')} /></label>
        <label>Title<input value={form.title} onChange={set('title')} /></label>
        <label>Disc ID<input value={form.disc_id || ''} onChange={set('disc_id')} /></label>
        <label>File Path<input value={form.file_path} onChange={set('file_path')} /></label>
        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={() => onSave(form)}>Save</button>
          <button className={`${styles.btn} ${styles.ghost}`} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
