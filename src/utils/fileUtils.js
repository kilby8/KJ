/**
 * Shift metadata fields left or right (circular rotation).
 *
 * Fields cycled: [artist, title, album]
 *
 * Shift Right: album → artist, artist → title, title → album
 *   Before: artist="Diamond in my Pocket", title="Cody Johnson", album="XYZ"
 *   After:  artist="XYZ", title="Diamond in my Pocket", album="Cody Johnson"
 *
 * Shift Left: artist → album, title → artist, album → title
 *   Before: artist="Diamond in my Pocket", title="Cody Johnson", album="XYZ"
 *   After:  artist="Cody Johnson", title="XYZ", album="Diamond in my Pocket"
 */
export function shiftFieldsLeft(file) {
  return {
    ...file,
    artist: file.title,
    title: file.album,
    album: file.artist,
  };
}

export function shiftFieldsRight(file) {
  return {
    ...file,
    artist: file.album,
    title: file.artist,
    album: file.title,
  };
}

/**
 * Swap just Artist ↔ Title (the most common operation).
 */
export function swapArtistTitle(file) {
  return {
    ...file,
    artist: file.title,
    title: file.artist,
  };
}

/**
 * Format file size as human-readable string.
 */
export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Build a unique key for a file record.
 */
export function fileKey(file) {
  return file.filePath;
}
