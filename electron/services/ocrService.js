/**
 * ocrService.js
 *
 * Modular service for processing images of physical karaoke disc jackets using
 * Tesseract.js OCR. Extracts track lists and maps them into a JSON structure
 * compatible with the KJ database schema.
 *
 * Output format per track:
 * {
 *   discId  : string   – disc catalogue ID (e.g. "SC-123"), if detected
 *   artist  : string
 *   title   : string
 *   rawLine : string   – original OCR line for review / debugging
 * }
 */

const Tesseract = require('tesseract.js');
const cleaner = require('./filenameCleaner');

// ── Line-parsing heuristics ────────────────────────────────────────────────────

/**
 * Patterns that suggest a line is a disc header, not a track.
 */
const HEADER_PATTERNS = [
  /^\s*disc\s*\d+\s*$/i,
  /^\s*track\s*list/i,
  /^\s*side\s*[ab]\s*$/i,
  /^\s*page\s*\d+\s*$/i,
  /^\s*\d+\s*tracks?\s*$/i,
  /^\s*$/, // blank
];

/**
 * Detect a disc ID at the start of a line, e.g. "SC-123" or "VMP 45".
 */
const DISC_ID_RE = /^([A-Z]{1,5}[-\s]?\d{2,5})\s+/i;

/**
 * Detect a leading track number, e.g. "1." or "01 " or "A1 ".
 */
const TRACK_NUM_RE = /^[A-Za-z]?\d{1,3}[.):\s]+/;

/**
 * Determine whether a line should be skipped.
 * @param {string} line
 */
function isHeaderLine(line) {
  return HEADER_PATTERNS.some((re) => re.test(line));
}

/**
 * Parse a single OCR'd line into a track descriptor.
 * Returns null if the line cannot be meaningfully parsed.
 *
 * Supported formats:
 *  "Artist - Title"
 *  "SC-123 Artist - Title"
 *  "1. Artist - Title"
 *  "SC-123 1. Artist - Title"
 *
 * @param {string} rawLine
 * @param {string} [contextDiscId]  – disc ID inferred from the image file name
 * @returns {{ discId, artist, title, rawLine } | null}
 */
function parseLine(rawLine, contextDiscId = '') {
  if (isHeaderLine(rawLine)) return null;

  let line = rawLine.trim();

  // Extract optional disc ID prefix
  let discId = contextDiscId;
  const discMatch = line.match(DISC_ID_RE);
  if (discMatch) {
    discId = discMatch[1].trim();
    line = line.slice(discMatch[0].length);
  }

  // Strip leading track number
  line = line.replace(TRACK_NUM_RE, '').trim();

  if (!line) return null;

  // Split on " - " separator
  const dashIdx = line.indexOf(' - ');
  let artist = '';
  let title = line;

  if (dashIdx !== -1) {
    artist = line.slice(0, dashIdx).trim();
    title = line.slice(dashIdx + 3).trim();
  }

  // Clean individual fields
  const cleaned = cleaner.cleanTrackFields({ artist, title });

  if (!cleaned.title && !cleaned.artist) return null;

  return {
    discId: discId.toUpperCase(),
    artist: cleaned.artist,
    title: cleaned.title,
    rawLine,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Process an image of a karaoke disc jacket and extract the track list.
 *
 * @param {string} imagePath – absolute path to the image file (jpg/png/tiff/…)
 * @param {{ lang?: string, contextDiscId?: string }} [opts]
 * @returns {Promise<{
 *   discId  : string,
 *   tracks  : Array<{ discId, artist, title, rawLine }>,
 *   rawText : string,
 *   confidence: number
 * }>}
 */
async function processDiscImage(imagePath, { lang = 'eng', contextDiscId = '' } = {}) {
  const { data } = await Tesseract.recognize(imagePath, lang, {
    // Treat the image as a page of text (PSM 3 = fully automatic)
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
  });

  const rawText = data.text || '';
  const confidence = data.confidence || 0;

  // Split into lines and parse each one
  const lines = rawText.split('\n');

  // Attempt to infer a disc ID from the first meaningful line
  let inferredDiscId = contextDiscId;
  for (const line of lines) {
    const m = line.trim().match(DISC_ID_RE);
    if (m) {
      inferredDiscId = m[1].trim().toUpperCase();
      break;
    }
  }

  const tracks = lines
    .map((line) => parseLine(line, inferredDiscId))
    .filter(Boolean);

  return {
    discId: inferredDiscId,
    tracks,
    rawText,
    confidence,
  };
}

/**
 * Process multiple disc images and merge their track lists.
 *
 * @param {string[]} imagePaths
 * @param {{ lang?: string }} [opts]
 * @returns {Promise<Array<{ discId, artist, title, rawLine }>>}
 */
async function processDiscImages(imagePaths, opts = {}) {
  const results = await Promise.all(
    imagePaths.map((p) => processDiscImage(p, opts))
  );
  return results.flatMap((r) => r.tracks);
}

module.exports = { processDiscImage, processDiscImages, parseLine };
