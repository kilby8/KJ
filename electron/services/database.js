const path = require('path');
const { app } = require('electron');
const BetterSqlite3 = require('better-sqlite3');

/**
 * Database service backed by SQLite via better-sqlite3.
 *
 * Schema
 * ──────
 * tracks
 *   id        INTEGER PRIMARY KEY AUTOINCREMENT
 *   disc_id   TEXT     – disc number / catalogue ID (e.g. "SC-123")
 *   artist    TEXT
 *   title     TEXT
 *   file_path TEXT     – absolute path to the .mp3 / .cdg base (no extension)
 *   in_zip    INTEGER  – 1 if stored inside a zip archive, 0 otherwise
 *   zip_path  TEXT     – path to the containing zip (NULL when in_zip = 0)
 *   created_at TEXT    – ISO-8601 timestamp
 *   updated_at TEXT    – ISO-8601 timestamp
 */
class Database {
  constructor(dbPath) {
    const userDataPath = app ? app.getPath('userData') : process.cwd();
    this._path = dbPath || path.join(userDataPath, 'kj-library.db');
    this._db = new BetterSqlite3(this._path);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');
    this._migrate();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _migrate() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        disc_id    TEXT,
        artist     TEXT    NOT NULL DEFAULT '',
        title      TEXT    NOT NULL DEFAULT '',
        file_path  TEXT    NOT NULL,
        in_zip     INTEGER NOT NULL DEFAULT 0,
        zip_path   TEXT,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path);

      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_tracks_title  ON tracks(title  COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_tracks_disc_id ON tracks(disc_id);

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
        artist,
        title,
        disc_id,
        content='tracks',
        content_rowid='id'
      );

      -- Keep FTS in sync with the tracks table
      CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
        INSERT INTO tracks_fts(rowid, artist, title, disc_id)
        VALUES (new.id, new.artist, new.title, new.disc_id);
      END;

      CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
        INSERT INTO tracks_fts(tracks_fts, rowid, artist, title, disc_id)
        VALUES ('delete', old.id, old.artist, old.title, old.disc_id);
      END;

      CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
        INSERT INTO tracks_fts(tracks_fts, rowid, artist, title, disc_id)
        VALUES ('delete', old.id, old.artist, old.title, old.disc_id);
        INSERT INTO tracks_fts(rowid, artist, title, disc_id)
        VALUES (new.id, new.artist, new.title, new.disc_id);
      END;
    `);
  }

  _now() {
    return new Date().toISOString();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Return a page of tracks.
   * @param {{ limit?: number, offset?: number, orderBy?: string, dir?: string }} opts
   */
  getTracks({ limit = 100, offset = 0, orderBy = 'artist', dir = 'ASC' } = {}) {
    const allowedCols = new Set(['id', 'artist', 'title', 'disc_id', 'file_path', 'created_at']);
    const col = allowedCols.has(orderBy) ? orderBy : 'artist';
    const direction = dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const rows = this._db
      .prepare(
        `SELECT * FROM tracks ORDER BY ${col} ${direction} LIMIT ? OFFSET ?`
      )
      .all(limit, offset);

    const total = this._db.prepare('SELECT COUNT(*) as cnt FROM tracks').get().cnt;
    return { rows, total, limit, offset };
  }

  /**
   * Full-text search across artist, title, and disc_id.
   * @param {string} query
   */
  searchTracks(query) {
    if (!query || !query.trim()) return this.getTracks();
    const rows = this._db
      .prepare(
        `SELECT tracks.* FROM tracks
         JOIN tracks_fts ON tracks.id = tracks_fts.rowid
         WHERE tracks_fts MATCH ?
         ORDER BY bm25(tracks_fts)`
      )
      .all(query.trim() + '*');
    return { rows, total: rows.length };
  }

  /**
   * Retrieve a single track by primary key.
   * @param {number} id
   */
  getTrackById(id) {
    return this._db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) || null;
  }

  /**
   * Insert or update a track record.
   * Uniqueness is enforced on file_path.
   */
  upsertTrack({ id, disc_id, artist, title, file_path, in_zip = 0, zip_path = null }) {
    const now = this._now();
    if (id) {
      this._db
        .prepare(
          `UPDATE tracks
           SET disc_id=?, artist=?, title=?, file_path=?, in_zip=?, zip_path=?, updated_at=?
           WHERE id=?`
        )
        .run(disc_id || '', artist || '', title || '', file_path, in_zip ? 1 : 0, zip_path, now, id);
      return this.getTrackById(id);
    }
    const info = this._db
      .prepare(
        `INSERT INTO tracks (disc_id, artist, title, file_path, in_zip, zip_path, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET
           disc_id=excluded.disc_id,
           artist=excluded.artist,
           title=excluded.title,
           in_zip=excluded.in_zip,
           zip_path=excluded.zip_path,
           updated_at=excluded.updated_at`
      )
      .run(disc_id || '', artist || '', title || '', file_path, in_zip ? 1 : 0, zip_path, now);
    return this.getTrackById(info.lastInsertRowid);
  }

  /**
   * Delete a track by id.
   * @param {number} id
   */
  deleteTrack(id) {
    return this._db.prepare('DELETE FROM tracks WHERE id = ?').run(id).changes;
  }

  /**
   * Bulk import an array of pair descriptors (from fileSync.discoverPairs).
   * Returns counts of inserted / skipped rows.
   */
  bulkImport(pairs) {
    let inserted = 0;
    let skipped = 0;

    const insertMany = this._db.transaction((items) => {
      for (const pair of items) {
        try {
          this.upsertTrack({
            artist: pair.artist || '',
            title: pair.title || '',
            disc_id: pair.discId || '',
            file_path: pair.basePath,
            in_zip: pair.inZip ? 1 : 0,
            zip_path: pair.zipPath || null,
          });
          inserted++;
        } catch {
          skipped++;
        }
      }
    });

    insertMany(pairs);
    return { inserted, skipped, total: pairs.length };
  }

  /** Close the database connection. */
  close() {
    this._db.close();
  }
}

module.exports = Database;
