/**
 * fileSync.js
 *
 * Utilities for discovering and renaming synchronized .mp3 / .cdg pairs.
 * Supports both loose files on disk and pairs stored inside zip archives.
 *
 * A "pair" is represented as:
 * {
 *   basePath : string  – absolute path without extension (loose) or entry name without ext (zipped)
 *   mp3      : string  – absolute path to the .mp3 file
 *   cdg      : string  – absolute path to the .cdg file
 *   inZip    : boolean – true when the pair lives inside a zip
 *   zipPath  : string|null – path to the zip archive (null for loose files)
 *   artist   : string  – guessed from filename (may be empty)
 *   title    : string  – guessed from filename (may be empty)
 *   discId   : string  – guessed from filename (may be empty)
 * }
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const cleaner = require('./filenameCleaner');

const AUDIO_EXT = '.mp3';
const CDG_EXT = '.cdg';
const ZIP_EXT = '.zip';

// ── Filename parsing ───────────────────────────────────────────────────────────

/**
 * Attempt to parse "Artist - Title" or "DiscID Artist - Title" from a basename.
 * Returns { discId, artist, title }.
 */
function parseFilename(basename) {
  // Strip extension
  let name = path.parse(basename).name;
  name = cleaner.stripJunk(name);

  // Pattern: optional disc-id prefix like "SC-123 " or "SC123 "
  const discIdMatch = name.match(/^([A-Z]{1,5}[-]?\d{2,5})\s+(.+)$/i);
  let discId = '';
  if (discIdMatch) {
    discId = discIdMatch[1];
    name = discIdMatch[2];
  }

  // Pattern: "Artist - Title"
  const dashIdx = name.indexOf(' - ');
  if (dashIdx !== -1) {
    return {
      discId,
      artist: name.slice(0, dashIdx).trim(),
      title: name.slice(dashIdx + 3).trim(),
    };
  }

  return { discId, artist: '', title: name.trim() };
}

// ── Loose-file discovery ───────────────────────────────────────────────────────

/**
 * Recursively walk a directory and collect all files grouped by their
 * lowercased base name (no extension).
 * @param {string} dirPath
 * @returns {Map<string, { mp3?: string, cdg?: string }>}
 */
function walkDirectory(dirPath) {
  const map = new Map();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== AUDIO_EXT && ext !== CDG_EXT && ext !== ZIP_EXT) continue;

        if (ext === ZIP_EXT) {
          // Handled separately
          continue;
        }

        const key = path.join(dir, path.basename(entry.name, ext)).toLowerCase();
        const slot = map.get(key) || {};
        if (ext === AUDIO_EXT) slot.mp3 = full;
        if (ext === CDG_EXT) slot.cdg = full;
        map.set(key, slot);
      }
    }
  }

  walk(dirPath);
  return map;
}

/**
 * Collect pairs stored inside zip archives under a directory.
 * @param {string} dirPath
 * @returns {Array<Object>}
 */
function discoverZipPairs(dirPath) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(ZIP_EXT)) continue;

      let zip;
      try {
        zip = new AdmZip(full);
      } catch {
        continue;
      }

      const entries = zip.getEntries();
      const byBase = new Map();
      for (const ze of entries) {
        const ext = path.extname(ze.entryName).toLowerCase();
        if (ext !== AUDIO_EXT && ext !== CDG_EXT) continue;
        const base = ze.entryName.slice(0, -ext.length).toLowerCase();
        const slot = byBase.get(base) || {};
        if (ext === AUDIO_EXT) slot.mp3Entry = ze.entryName;
        if (ext === CDG_EXT) slot.cdgEntry = ze.entryName;
        byBase.set(base, slot);
      }

      for (const [base, slot] of byBase) {
        if (!slot.mp3Entry || !slot.cdgEntry) continue;
        const parsed = parseFilename(path.basename(base));
        results.push({
          basePath: `${full}:${base}`,
          mp3: `${full}:${slot.mp3Entry}`,
          cdg: `${full}:${slot.cdgEntry}`,
          inZip: true,
          zipPath: full,
          ...parsed,
        });
      }
    }
  }

  walk(dirPath);
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Discover all .mp3/.cdg pairs (loose and zipped) inside a directory tree.
 * @param {string} dirPath
 * @returns {Promise<Array<Object>>}
 */
async function discoverPairs(dirPath) {
  const looseMap = walkDirectory(dirPath);
  const loosePairs = [];

  for (const [keyPath, slot] of looseMap) {
    if (!slot.mp3 || !slot.cdg) continue; // incomplete pair
    const parsed = parseFilename(path.basename(keyPath));
    loosePairs.push({
      basePath: keyPath,
      mp3: slot.mp3,
      cdg: slot.cdg,
      inZip: false,
      zipPath: null,
      ...parsed,
    });
  }

  const zipPairs = discoverZipPairs(dirPath);
  return [...loosePairs, ...zipPairs];
}

/**
 * Rename a loose .mp3/.cdg pair using a template string.
 *
 * Template variables: {artist}, {title}, {discId}
 * e.g. template = "{discId} {artist} - {title}"
 *
 * @param {string} currentBasePath  – absolute path without extension
 * @param {string} template         – rename template
 * @param {{ artist: string, title: string, discId: string }} track
 * @returns {{ mp3: string, cdg: string }} – new absolute paths
 */
function renamePair(currentBasePath, template, track) {
  const { artist = '', title = '', discId = '' } = track;
  const newName = template
    .replace(/\{artist\}/gi, artist)
    .replace(/\{title\}/gi, title)
    .replace(/\{discId\}/gi, discId)
    .trim();

  const dir = path.dirname(currentBasePath);
  const newBase = path.join(dir, newName);

  const oldMp3 = `${currentBasePath}${AUDIO_EXT}`;
  const oldCdg = `${currentBasePath}${CDG_EXT}`;
  const newMp3 = `${newBase}${AUDIO_EXT}`;
  const newCdg = `${newBase}${CDG_EXT}`;

  if (fs.existsSync(oldMp3)) fs.renameSync(oldMp3, newMp3);
  if (fs.existsSync(oldCdg)) fs.renameSync(oldCdg, newCdg);

  return { mp3: newMp3, cdg: newCdg, basePath: newBase };
}

/**
 * Rename a pair stored inside a zip archive.
 * The old entries are removed and new entries with the correct names are added.
 *
 * @param {string} zipPath
 * @param {string} oldMp3Entry  – entry name inside the zip (with extension)
 * @param {string} oldCdgEntry  – entry name inside the zip (with extension)
 * @param {string} newBaseName  – new base name (without extension)
 * @returns {{ mp3Entry: string, cdgEntry: string }}
 */
function renameZipPair(zipPath, oldMp3Entry, oldCdgEntry, newBaseName) {
  const zip = new AdmZip(zipPath);

  const mp3Data = zip.readFile(oldMp3Entry);
  const cdgData = zip.readFile(oldCdgEntry);

  if (!mp3Data || !cdgData) {
    throw new Error(`Could not read entries from zip: ${zipPath}`);
  }

  const newMp3Entry = newBaseName + AUDIO_EXT;
  const newCdgEntry = newBaseName + CDG_EXT;

  zip.deleteFile(oldMp3Entry);
  zip.deleteFile(oldCdgEntry);
  zip.addFile(newMp3Entry, mp3Data);
  zip.addFile(newCdgEntry, cdgData);
  zip.writeZip(zipPath);

  return { mp3Entry: newMp3Entry, cdgEntry: newCdgEntry };
}

/**
 * Execute a batch of rename operations atomically (best-effort).
 *
 * Each operation:
 * {
 *   type       : 'loose' | 'zip'
 *   basePath   : string   (loose: path without ext; zip: "<zipPath>:<entry base>")
 *   template   : string
 *   track      : { artist, title, discId }
 *   zipPath?   : string   (zip only)
 *   mp3Entry?  : string   (zip only)
 *   cdgEntry?  : string   (zip only)
 * }
 *
 * @param {Array<Object>} operations
 * @returns {{ succeeded: number, failed: Array<{ op, error }> }}
 */
async function batchRename(operations) {
  let succeeded = 0;
  const failed = [];

  for (const op of operations) {
    try {
      if (op.type === 'zip') {
        const newBaseName = buildName(op.template, op.track);
        renameZipPair(op.zipPath, op.mp3Entry, op.cdgEntry, newBaseName);
      } else {
        renamePair(op.basePath, op.template, op.track);
      }
      succeeded++;
    } catch (err) {
      failed.push({ op, error: err.message });
    }
  }

  return { succeeded, failed };
}

function buildName(template, track) {
  const { artist = '', title = '', discId = '' } = track;
  return template
    .replace(/\{artist\}/gi, artist)
    .replace(/\{title\}/gi, title)
    .replace(/\{discId\}/gi, discId)
    .trim();
}

module.exports = { discoverPairs, renamePair, renameZipPair, batchRename, parseFilename };
