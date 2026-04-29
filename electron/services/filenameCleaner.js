/**
 * filenameCleaner.js
 *
 * Comprehensive regex-based cleaning module for karaoke music filenames.
 *
 * Features:
 *  - Strip common karaoke junk strings (e.g. "[KARAOKE]", "CDG -", "- CDG")
 *  - Replace underscores / excess dashes with spaces
 *  - Correct Artist/Title swap (heuristic)
 *  - Normalize Title Case
 *  - Clean disc-ID prefixes
 */

// ── Junk patterns to remove ───────────────────────────────────────────────────

const JUNK_PATTERNS = [
  // Common karaoke tags (case-insensitive, allow surrounding brackets/parens)
  /[\[(]?\bkaraoke\b[\])]?/gi,
  /[\[(]?\bcdg\b[\])]?/gi,
  /[\[(]?\bmp3\b[\])]?/gi,
  /[\[(]?\bvideo\b[\])]?/gi,
  /[\[(]?\bsound[\s_-]*track\b[\])]?/gi,
  /[\[(]?\blyrics\b[\])]?/gi,
  /[\[(]?\bsingalong\b[\])]?/gi,
  /[\[(]?\bsing[\s_-]*along\b[\])]?/gi,
  /[\[(]?\bperformance[\s_-]*track\b[\])]?/gi,
  // Numeric track numbers at the very start (e.g. "01 " or "001 - ")
  /^\d{1,3}[\s._-]+/,
  // Trailing noise
  /[\s._-]+$/,
  // Leading noise
  /^[\s._-]+/,
];

// ── Case-preservation list for Title Case ─────────────────────────────────────

const LOWERCASE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is', 'it',
  'vs', 'via', 'with', 'from', 'into', 'onto', 'upon',
]);

const UPPERCASE_WORDS = new Set([
  'dj', 'mc', 'r&b', 'usa', 'uk', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi',
]);

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Remove known junk patterns from a string.
 * @param {string} name
 * @returns {string}
 */
function stripJunk(name) {
  let result = name;
  for (const pattern of JUNK_PATTERNS) {
    result = result.replace(pattern, ' ');
  }
  // Collapse multiple spaces
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Replace underscores and excessive dashes/dots with spaces.
 * @param {string} name
 * @returns {string}
 */
function normalizeDelimiters(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s*-{2,}\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Apply Title Case to a string.
 * - First and last word always capitalised
 * - Common conjunctions / prepositions kept lowercase (unless first/last)
 * - Known abbreviations kept uppercase
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  const words = str.split(/\s+/);
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      const upper = word.toUpperCase();

      if (UPPERCASE_WORDS.has(lower)) return upper;
      if (idx === 0 || idx === words.length - 1) {
        return capitalise(word);
      }
      if (LOWERCASE_WORDS.has(lower)) return lower;
      return capitalise(word);
    })
    .join(' ');
}

function capitalise(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Heuristic: detect whether "Artist" and "Title" fields appear swapped.
 *
 * Rule: if the presumed artist field contains more than 4 words it is likely
 * the title. Swap when that is the case and the title field is shorter.
 *
 * @param {string} artist
 * @param {string} title
 * @returns {{ artist: string, title: string }}
 */
function fixArtistTitleSwap(artist, title) {
  if (!artist || !title) return { artist, title };

  const artistWords = artist.trim().split(/\s+/).length;
  const titleWords = title.trim().split(/\s+/).length;

  // If artist has significantly more words than title, suspect a swap
  if (artistWords > 4 && titleWords <= artistWords / 2) {
    return { artist: title, title: artist };
  }
  return { artist, title };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Clean a raw filename (with or without extension) and return a cleaned string.
 * @param {string} filename
 * @returns {string}
 */
function cleanFilename(filename) {
  const { name, ext } = require('path').parse(filename);
  let cleaned = name;
  cleaned = normalizeDelimiters(cleaned);
  cleaned = stripJunk(cleaned);
  cleaned = toTitleCase(cleaned);
  return ext ? `${cleaned}${ext}` : cleaned;
}

/**
 * Clean a track object's artist and title fields.
 * @param {{ artist: string, title: string }} track
 * @returns {{ artist: string, title: string }}
 */
function cleanTrackFields(track) {
  let artist = normalizeDelimiters(stripJunk(track.artist || ''));
  let title = normalizeDelimiters(stripJunk(track.title || ''));

  ({ artist, title } = fixArtistTitleSwap(artist, title));

  artist = toTitleCase(artist);
  title = toTitleCase(title);

  return { artist, title };
}

/**
 * Clean a list of raw filenames.
 * @param {string[]} filenames
 * @returns {string[]}
 */
function cleanFilenames(filenames) {
  return filenames.map(cleanFilename);
}

module.exports = {
  cleanFilename,
  cleanFilenames,
  cleanTrackFields,
  stripJunk,
  normalizeDelimiters,
  toTitleCase,
  fixArtistTitleSwap,
};
