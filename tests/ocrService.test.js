const { parseLine } = require('../electron/services/ocrService');

describe('parseLine', () => {
  test('parses "Artist - Title" from OCR line', () => {
    const result = parseLine('Madonna - Like a Prayer');
    expect(result).not.toBeNull();
    expect(result.artist).toBeTruthy();
    expect(result.title).toBeTruthy();
  });

  test('returns null for blank line', () => {
    expect(parseLine('')).toBeNull();
    expect(parseLine('   ')).toBeNull();
  });

  test('returns null for header line', () => {
    expect(parseLine('Track List')).toBeNull();
    expect(parseLine('Disc 1')).toBeNull();
  });

  test('extracts disc ID from line', () => {
    const result = parseLine('SC-123 Artist - My Song');
    expect(result.discId).toMatch(/SC-123/i);
  });

  test('uses context disc ID as fallback', () => {
    const result = parseLine('Artist - Song', 'VMP001');
    expect(result.discId).toBe('VMP001');
  });

  test('strips leading track number', () => {
    const result = parseLine('1. Artist - Title');
    expect(result).not.toBeNull();
    expect(result.title).toBe('Title');
  });
});
