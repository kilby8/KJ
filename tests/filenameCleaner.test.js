const {
  cleanFilename,
  cleanFilenames,
  cleanTrackFields,
  stripJunk,
  normalizeDelimiters,
  toTitleCase,
  fixArtistTitleSwap,
} = require('../electron/services/filenameCleaner');

describe('stripJunk', () => {
  test('removes [KARAOKE] tag', () => {
    expect(stripJunk('Song Title [KARAOKE]')).toBe('Song Title');
  });

  test('removes CDG tag', () => {
    expect(stripJunk('Artist - Song CDG -')).toBe('Artist - Song');
  });

  test('removes leading track number', () => {
    expect(stripJunk('01 Artist - Title')).toBe('Artist - Title');
  });

  test('removes [MP3] bracket', () => {
    expect(stripJunk('My Song [MP3]')).toBe('My Song');
  });

  test('handles multiple junk tags', () => {
    expect(stripJunk('[KARAOKE] Artist - Title [CDG]')).toBe('Artist - Title');
  });
});

describe('normalizeDelimiters', () => {
  test('replaces underscores with spaces', () => {
    expect(normalizeDelimiters('artist_name')).toBe('artist name');
  });

  test('collapses multiple dashes', () => {
    expect(normalizeDelimiters('artist -- title')).toBe('artist - title');
  });

  test('collapses multiple spaces', () => {
    expect(normalizeDelimiters('a  b   c')).toBe('a b c');
  });
});

describe('toTitleCase', () => {
  test('capitalizes first and last word', () => {
    expect(toTitleCase('the song of the year')).toBe('The Song of the Year');
  });

  test('keeps conjunctions lowercase in the middle', () => {
    expect(toTitleCase('beauty and the beast')).toBe('Beauty and the Beast');
  });

  test('uppercases known abbreviations', () => {
    expect(toTitleCase('dj shadow')).toBe('DJ Shadow');
  });
});

describe('fixArtistTitleSwap', () => {
  test('does not swap when fields look normal', () => {
    const result = fixArtistTitleSwap('Madonna', 'Like a Prayer');
    expect(result.artist).toBe('Madonna');
    expect(result.title).toBe('Like a Prayer');
  });

  test('swaps when artist field is much longer than title', () => {
    const result = fixArtistTitleSwap(
      'Like A Bridge Over Troubled Water On A Rainy Day',
      'Paul'
    );
    expect(result.artist).toBe('Paul');
    expect(result.title).toBe('Like A Bridge Over Troubled Water On A Rainy Day');
  });
});

describe('cleanFilename', () => {
  test('full pipeline on a messy filename', () => {
    const input = 'SC-123 artist_name - song_title [KARAOKE].mp3';
    const result = cleanFilename(input);
    // Should have cleaned underscores, removed [KARAOKE], applied Title Case, kept .mp3
    expect(result).toMatch(/\.mp3$/);
    expect(result).not.toContain('_');
    expect(result).not.toMatch(/karaoke/i);
  });

  test('works without extension', () => {
    const result = cleanFilename('my_song CDG');
    expect(result).not.toContain('_');
  });
});

describe('cleanFilenames', () => {
  test('processes an array of filenames', () => {
    const inputs = ['song_one CDG', 'song_two [KARAOKE]'];
    const outputs = cleanFilenames(inputs);
    expect(outputs).toHaveLength(2);
    expect(outputs[0]).not.toContain('_');
    expect(outputs[1]).not.toMatch(/karaoke/i);
  });
});

describe('cleanTrackFields', () => {
  test('cleans artist and title', () => {
    const result = cleanTrackFields({
      artist: 'THE_BEATLES',
      title: 'hey jude [KARAOKE]',
    });
    expect(result.artist).toBe('The Beatles');
    expect(result.title).toBe('Hey Jude');
  });
});
