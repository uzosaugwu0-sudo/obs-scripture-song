import { describe, it, expect } from 'vitest';
import { parseTxt, parseCsv, parseJsonSongs, parseSongFile } from '../../src/songs/parse.js';
import { normalizeTitle, isSongRecord, toSongRecord, looksLikeSong } from '../../src/songs/model.js';

describe('model helpers', () => {
  it('normalises titles', () => { expect(normalizeTitle('  Amazing GRACE ')).toBe('amazing grace'); });
  it('recognises stored songs and importable songs', () => {
    expect(isSongRecord({ id: 'a', title: 'T', slides: ['x'] })).toBe(true);
    expect(isSongRecord({ title: 'T', slides: ['x'] })).toBe(false);
    expect(looksLikeSong({ title: 'T', slides: [] })).toBe(true);
    expect(looksLikeSong({ title: 5, slides: [] })).toBe(false);
  });
  it('copies into a clean record', () => {
    const src = { id: 'a', title: 'T', slides: ['x'], extra: 1 };
    const rec = toSongRecord(src);
    expect(rec).toEqual({ id: 'a', title: 'T', altTitle: null, slides: ['x'] });
    expect(rec.slides).not.toBe(src.slides);
  });
});

describe('parseTxt', () => {
  it('takes the title from the filename and splits slides on blank lines and section labels', () => {
    const text = 'Amazing Grace\n\nAmazing grace how sweet\nthe sound\n\nVerse 2\nThrough many dangers';
    expect(parseTxt(text, 'Amazing_Grace.txt')).toEqual([
      { title: 'Amazing Grace', altTitle: null, slides: ['Amazing grace how sweet\nthe sound', 'Through many dangers'] },
    ]);
  });
  it('keeps a differing embedded title as altTitle', () => {
    const [song] = parseTxt('Title: Different Name\n\nLine one', 'x.txt');
    expect(song).toEqual({ title: 'x', altTitle: 'Different Name', slides: ['Line one'] });
  });
  it('drops everything after a --- separator', () => {
    const [song] = parseTxt('Song\n\nLine\n---\nCCLI notes', 'song.txt');
    expect(song.slides).toEqual(['Line']);
  });
});

describe('parseCsv', () => {
  it('reads title and lyrics columns, splitting on blank lines', () => {
    const csv = 'title,lyrics\nHymn,"Line one\\n\\nLine two"';
    expect(parseCsv(csv)).toEqual([{ title: 'Hymn', slides: ['Line one', 'Line two'] }]);
  });
  it('returns nothing without a title column', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([]);
  });
});

describe('parseJsonSongs', () => {
  it('accepts a bare array or a songs wrapper and drops invalid entries', () => {
    const good = { title: 'A', slides: ['x'] };
    expect(parseJsonSongs(JSON.stringify([good, { nope: 1 }]))).toEqual([good]);
    expect(parseJsonSongs(JSON.stringify({ version: 1, songs: [good] }))).toEqual([good]);
  });
});

describe('parseSongFile', () => {
  it('dispatches by extension', () => {
    expect(parseSongFile('a.json', '[{"title":"A","slides":[]}]')).toHaveLength(1);
    expect(parseSongFile('a.csv', 'title,lyrics\nA,x')).toHaveLength(1);
    expect(parseSongFile('A_B.txt', 'A B\n\nline')[0].title).toBe('A B');
    expect(parseSongFile('a.pdf', 'x')).toEqual([]);
  });
  it('throws on broken JSON so the caller can report the file', () => {
    expect(() => parseSongFile('bad.json', '{oops')).toThrow();
  });
});

describe('malformed songs are rejected, not stored', () => {
  it('requires string slides and a string or null altTitle', () => {
    expect(looksLikeSong({ title: 'T', slides: [{ text: 'line' }] })).toBe(false);
    expect(looksLikeSong({ title: 'T', slides: ['x'], altTitle: 5 })).toBe(false);
    expect(looksLikeSong({ title: 'T', slides: ['x'], altTitle: null })).toBe(true);
  });
  it('drops such songs from JSON imports', () => {
    const good = { title: 'Good', slides: ['x'] };
    const bad = { title: 'Bad', slides: [{ text: 'line' }] };
    expect(parseJsonSongs(JSON.stringify([bad, good]))).toEqual([good]);
  });
});
