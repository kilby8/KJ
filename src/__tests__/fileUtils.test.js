import { describe, it, expect } from 'vitest';
import {
  shiftFieldsLeft,
  shiftFieldsRight,
  swapArtistTitle,
  formatSize,
} from '../utils/fileUtils';

// ── Fixture ──────────────────────────────────────────────────────────────────
const base = {
  filePath: '/test/file.mp3',
  fileName: 'file.mp3',
  ext: 'MP3',
  artist: 'Cam Allen',
  title: 'Whiskey Under The Bridge',
  album: 'KTYD486',
};

// ── shiftFieldsLeft ───────────────────────────────────────────────────────────
describe('shiftFieldsLeft', () => {
  it('rotates artist → album, title → artist, album → title', () => {
    const result = shiftFieldsLeft(base);
    expect(result.artist).toBe(base.title);   // title moves to artist
    expect(result.title).toBe(base.album);    // album moves to title
    expect(result.album).toBe(base.artist);   // artist moves to album
  });

  it('does not mutate the original file object', () => {
    shiftFieldsLeft(base);
    expect(base.artist).toBe('Cam Allen');
  });

  it('preserves all other fields unchanged', () => {
    const result = shiftFieldsLeft(base);
    expect(result.filePath).toBe(base.filePath);
    expect(result.ext).toBe(base.ext);
  });

  it('handles empty strings without throwing', () => {
    const empty = { ...base, artist: '', title: '', album: '' };
    const result = shiftFieldsLeft(empty);
    expect(result.artist).toBe('');
    expect(result.title).toBe('');
    expect(result.album).toBe('');
  });

  it('one left-shift followed by one right-shift returns original', () => {
    const once = shiftFieldsLeft(base);
    const back = shiftFieldsRight(once);
    expect(back.artist).toBe(base.artist);
    expect(back.title).toBe(base.title);
    expect(back.album).toBe(base.album);
  });
});

// ── shiftFieldsRight ──────────────────────────────────────────────────────────
describe('shiftFieldsRight', () => {
  it('rotates album → artist, artist → title, title → album', () => {
    const result = shiftFieldsRight(base);
    expect(result.artist).toBe(base.album);   // album moves to artist
    expect(result.title).toBe(base.artist);   // artist moves to title
    expect(result.album).toBe(base.title);    // title moves to album
  });

  it('does not mutate the original file object', () => {
    shiftFieldsRight(base);
    expect(base.artist).toBe('Cam Allen');
  });

  it('three right-shifts returns to original', () => {
    const r1 = shiftFieldsRight(base);
    const r2 = shiftFieldsRight(r1);
    const r3 = shiftFieldsRight(r2);
    expect(r3.artist).toBe(base.artist);
    expect(r3.title).toBe(base.title);
    expect(r3.album).toBe(base.album);
  });
});

// ── swapArtistTitle ───────────────────────────────────────────────────────────
describe('swapArtistTitle', () => {
  it('swaps artist and title', () => {
    const result = swapArtistTitle(base);
    expect(result.artist).toBe(base.title);
    expect(result.title).toBe(base.artist);
  });

  it('leaves album unchanged', () => {
    const result = swapArtistTitle(base);
    expect(result.album).toBe(base.album);
  });

  it('applying twice returns original', () => {
    const result = swapArtistTitle(swapArtistTitle(base));
    expect(result.artist).toBe(base.artist);
    expect(result.title).toBe(base.title);
  });

  it('does not mutate the original', () => {
    swapArtistTitle(base);
    expect(base.artist).toBe('Cam Allen');
  });
});

// ── formatSize ────────────────────────────────────────────────────────────────
describe('formatSize', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(7 * 1024 * 1024)).toBe('7.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });
});

