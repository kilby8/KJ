import { useState } from 'react';
import styles from './Cleaner.module.css';

export default function Cleaner() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const clean = async () => {
    const filenames = input.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!filenames.length) return;
    setLoading(true);
    const cleaned = await window.kjAPI.cleaner.cleanFilenames(filenames);
    setResults(filenames.map((orig, i) => ({ orig, cleaned: cleaned[i] })));
    setLoading(false);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(results.map((r) => r.cleaned).join('\n'));
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Filename Cleaner</h2>
      <p className={styles.desc}>
        Paste filenames below (one per line). The cleaner will remove junk tags,
        normalize delimiters, fix Artist/Title swaps, and apply Title Case.
      </p>

      <div className={styles.body}>
        <div className={styles.inputPane}>
          <label className={styles.label}>Input Filenames</label>
          <textarea
            className={styles.textarea}
            placeholder={'SC-123 ARTIST_NAME - song_title [KARAOKE]\nABCD456 Title/Artist - Blah CDG -'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className={styles.btn} onClick={clean} disabled={loading || !input.trim()}>
            {loading ? 'Cleaning…' : '✨ Clean'}
          </button>
        </div>

        <div className={styles.outputPane}>
          <div className={styles.outputHeader}>
            <label className={styles.label}>Cleaned Output</label>
            {results.length > 0 && (
              <button className={`${styles.btn} ${styles.ghost}`} onClick={copyAll}>
                📋 Copy All
              </button>
            )}
          </div>
          <div className={styles.resultList}>
            {results.map((r, i) => (
              <div key={i} className={styles.resultRow}>
                <span className={`${styles.orig} ${r.orig === r.cleaned ? styles.unchanged : ''}`}>
                  {r.orig}
                </span>
                <span className={styles.arrow}>→</span>
                <span className={`${styles.cleaned} ${r.orig !== r.cleaned ? styles.changed : ''}`}>
                  {r.cleaned}
                </span>
              </div>
            ))}
            {!loading && results.length === 0 && (
              <div className={styles.empty}>
                Results will appear here after cleaning.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
