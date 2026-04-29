import { useState } from 'react';
import styles from './FileSync.module.css';

const DEFAULT_TEMPLATE = '{discId} {artist} - {title}';

export default function FileSync() {
  const [dirPath, setDirPath] = useState('');
  const [pairs, setPairs] = useState([]);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickDirectory = async () => {
    const dir = await window.kjAPI.dialog.openDirectory();
    if (dir) setDirPath(dir);
  };

  const scanDirectory = async () => {
    if (!dirPath) return;
    setLoading(true);
    setStatus(null);
    const found = await window.kjAPI.fs.discoverPairs(dirPath);
    setPairs(found);
    setSelected(new Set(found.map((_, i) => i)));
    setLoading(false);
    setStatus(`Found ${found.length} pairs.`);
  };

  const toggleSelect = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleBatchRename = async () => {
    const operations = pairs
      .filter((_, i) => selected.has(i))
      .map((pair) => ({
        type: pair.inZip ? 'zip' : 'loose',
        basePath: pair.basePath,
        template,
        track: { artist: pair.artist, title: pair.title, discId: pair.discId },
        zipPath: pair.zipPath,
        mp3Entry: pair.mp3?.includes(':') ? pair.mp3.slice(pair.mp3.indexOf(':') + 1) : undefined,
        cdgEntry: pair.cdg?.includes(':') ? pair.cdg.slice(pair.cdg.indexOf(':') + 1) : undefined,
      }));

    if (!operations.length) return;
    setLoading(true);
    const result = await window.kjAPI.fs.batchRename(operations);
    setLoading(false);
    setStatus(
      `Renamed ${result.succeeded} pair(s).` +
      (result.failed.length ? ` ${result.failed.length} failed.` : '')
    );
    // Re-scan to reflect changes
    await scanDirectory();
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button className={styles.btn} onClick={pickDirectory}>📂 Choose Folder</button>
        <span className={styles.path}>{dirPath || 'No folder selected'}</span>
        <button className={styles.btn} onClick={scanDirectory} disabled={!dirPath || loading}>
          🔍 Scan
        </button>
      </div>

      <div className={styles.templateRow}>
        <label>Rename Template:</label>
        <input
          className={styles.templateInput}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <span className={styles.hint}>Variables: {'{discId}'} {'{artist}'} {'{title}'}</span>
      </div>

      {status && <div className={styles.status}>{status}</div>}

      {loading && <div className={styles.loading}>Scanning…</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(pairs.map((_, i) => i)) : new Set())
                  }
                  checked={selected.size === pairs.length && pairs.length > 0}
                />
              </th>
              <th>Disc ID</th>
              <th>Artist</th>
              <th>Title</th>
              <th>Type</th>
              <th>Base Path</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair, i) => (
              <tr
                key={i}
                className={`${styles.row} ${selected.has(i) ? styles.selected : ''}`}
                onClick={() => toggleSelect(i)}
              >
                <td>
                  <input type="checkbox" checked={selected.has(i)} readOnly />
                </td>
                <td className={styles.mono}>{pair.discId}</td>
                <td>{pair.artist}</td>
                <td>{pair.title}</td>
                <td>
                  <span className={pair.inZip ? styles.badgeZip : styles.badgeLoose}>
                    {pair.inZip ? 'ZIP' : 'File'}
                  </span>
                </td>
                <td className={`${styles.mono} ${styles.path}`} title={pair.basePath}>
                  {pair.basePath}
                </td>
              </tr>
            ))}
            {!loading && pairs.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Scan a folder to discover .mp3/.cdg pairs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pairs.length > 0 && (
        <div className={styles.footer}>
          <span className={styles.selCount}>{selected.size} of {pairs.length} selected</span>
          <button
            className={styles.btn}
            onClick={handleBatchRename}
            disabled={!selected.size || loading}
          >
            ✏️ Rename Selected
          </button>
        </div>
      )}
    </div>
  );
}
