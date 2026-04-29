import { useState } from 'react';
import Library from './components/Library';
import FileSync from './components/FileSync';
import DiscScan from './components/DiscScan';
import Cleaner from './components/Cleaner';
import styles from './App.module.css';

const TABS = [
  { id: 'library',  label: '🎵 Library' },
  { id: 'sync',     label: '🔄 File Sync' },
  { id: 'scan',     label: '📷 Disc Scan' },
  { id: 'cleaner',  label: '✨ Cleaner' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('library');

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.logo}>KJ File Manager</h1>
        <nav className={styles.nav}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.navBtn} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        {activeTab === 'library' && <Library />}
        {activeTab === 'sync'    && <FileSync />}
        {activeTab === 'scan'    && <DiscScan />}
        {activeTab === 'cleaner' && <Cleaner />}
      </main>
    </div>
  );
}
