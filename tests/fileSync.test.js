const { parseFilename } = require('../electron/services/fileSync');

describe('parseFilename', () => {
  test('parses "Artist - Title" format', () => {
    const result = parseFilename('Madonna - Like a Prayer.mp3');
    expect(result.artist).toBe('Madonna');
    expect(result.title).toBe('Like a Prayer');
    expect(result.discId).toBe('');
  });

  test('parses disc ID prefix', () => {
    const result = parseFilename('SC-123 Artist - Title.mp3');
    expect(result.discId).toMatch(/SC-123/i);
    expect(result.artist).toBe('Artist');
    expect(result.title).toBe('Title');
  });

  test('handles filename with no separator', () => {
    const result = parseFilename('JustATitle.mp3');
    expect(result.title).toBeTruthy();
    expect(result.artist).toBe('');
  });

  test('strips junk before parsing', () => {
    const result = parseFilename('Artist - Title [KARAOKE].mp3');
    expect(result.title).not.toMatch(/karaoke/i);
  });
});
