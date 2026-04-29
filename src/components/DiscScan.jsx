import { useState } from 'react';
import styles from './DiscScan.module.css';

export default function DiscScan() {
  const [imagePath, setImagePath] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pickImage = async () => {
    const file = await window.kjAPI.dialog.openFile([
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'tiff', 'bmp', 'webp'] },
    ]);
    if (file) setImagePath(file);
  };

  const runOCR = async () => {
    if (!imagePath) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await window.kjAPI.ocr.processImage(imagePath);
      setResult(data);
    } catch (err) {
      setError(err.message || 'OCR failed');
    } finally {
      setLoading(false);
    }
  };

  const importTracks = async () => {
    if (!result?.tracks?.length) return;
    for (const track of result.tracks) {
      await window.kjAPI.db.upsertTrack({
        disc_id: track.discId,
        artist: track.artist,
        title: track.title,
        file_path: `ocr:${track.discId}:${track.artist} - ${track.title}`,
      });
    }
    alert(`Imported ${result.tracks.length} track(s) from OCR.`);
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Disc Jacket OCR Scanner</h2>
      <p className={styles.desc}>
        Select an image of a physical karaoke disc jacket. The OCR engine will
        extract the track list and map it into the KJ database schema.
      </p>

      <div className={styles.toolbar}>
        <button className={styles.btn} onClick={pickImage}>📷 Choose Image</button>
        <span className={styles.path}>{imagePath || 'No image selected'}</span>
        <button className={styles.btn} onClick={runOCR} disabled={!imagePath || loading}>
          {loading ? 'Scanning…' : '🔍 Run OCR'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <div className={styles.results}>
          <div className={styles.meta}>
            <span>Disc ID: <strong>{result.discId || '(none detected)'}</strong></span>
            <span>Confidence: <strong>{result.confidence.toFixed(1)}%</strong></span>
            <span>{result.tracks.length} track(s) found</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Disc ID</th>
                  <th>Artist</th>
                  <th>Title</th>
                  <th>Raw OCR Line</th>
                </tr>
              </thead>
              <tbody>
                {result.tracks.map((t, i) => (
                  <tr key={i} className={styles.row}>
                    <td className={styles.mono}>{t.discId}</td>
                    <td>{t.artist}</td>
                    <td>{t.title}</td>
                    <td className={`${styles.mono} ${styles.raw}`}>{t.rawLine}</td>
                  </tr>
                ))}
                {result.tracks.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      No tracks could be parsed. Try a higher-quality image.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {result.tracks.length > 0 && (
            <div className={styles.footer}>
              <button className={styles.btn} onClick={importTracks}>
                💾 Import {result.tracks.length} Track(s) to Library
              </button>
            </div>
          )}

          <details className={styles.rawText}>
            <summary>Raw OCR text</summary>
            <pre>{result.rawText}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
