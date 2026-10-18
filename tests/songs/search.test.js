import { describe, it, expect } from 'vitest';
import { normalizeText, tokenize, songMatches, searchSongs, markTokens } from '../../src/songs/search.js';

const grace = { id: '1', title: 'Amazing Grace', altTitle: 'Newton Hymn', slides: ['Amazing grace how sweet the sound', 'Verse 2 That saved a wretch like me'] };

describe('normalizeText and tokenize', () => {
  it('lower-cases, strips accents and apostrophes, and turns other punctuation into spaces', () => {
    expect(normalizeText("Don't  STOP, Señor!")).toBe('dont stop senor');
    expect(normalizeText('')).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
  it('keeps letters and digits from other scripts', () => {
    expect(normalizeText('Господь, Бог')).toBe('господь бог');
    expect(normalizeText('和合本 1:1')).toBe('和合本 1 1');
  });
  it('tokenizes into words', () => {
    expect(tokenize('  Grace   how-sweet ')).toEqual(['grace', 'how', 'sweet']);
    expect(tokenize('!!!')).toEqual([]);
  });
});

describe('songMatches', () => {
  it('matches everything for an empty or punctuation-only query', () => {
    expect(songMatches(grace, '')).toEqual({ matched: true, via: null, excerpt: null, score: 0 });
    expect(songMatches(grace, '   ').matched).toBe(true);
    expect(songMatches(grace, '!!!').matched).toBe(true);
  });
  it('matches titles and alternative titles, ignoring case', () => {
    expect(songMatches(grace, 'AMAZING')).toMatchObject({ matched: true, via: 'title', excerpt: null });
    expect(songMatches(grace, 'newton')).toMatchObject({ matched: true, via: 'title' });
  });
  it('matches a partial lyric and returns an excerpt with context', () => {
    const result = songMatches(grace, 'sweet the sound');
    expect(result).toMatchObject({ matched: true, via: 'lyrics' });
    expect(result.excerpt).toContain('sweet');
  });
  it('matches words in any order, spread over title and slides', () => {
    expect(songMatches(grace, 'wretch grace')).toMatchObject({ matched: true, via: 'lyrics' });
    expect(songMatches(grace, 'sound amazing')).toMatchObject({ matched: true });
  });
  it('matches partial words', () => {
    expect(songMatches(grace, 'amaz')).toMatchObject({ matched: true, via: 'title' });
    expect(songMatches(grace, 'wret')).toMatchObject({ matched: true, via: 'lyrics' });
  });
  it('ignores punctuation and accents on both sides', () => {
    const know = { id: '2', title: 'Know', slides: ["I don't know why"] };
    expect(songMatches(know, 'dont know').matched).toBe(true);
    expect(songMatches(know, "don't know").matched).toBe(true);
    const senor = { id: '3', title: 'Señor', slides: [] };
    expect(songMatches(senor, 'senor').matched).toBe(true);
    expect(songMatches(senor, 'SEÑOR').matched).toBe(true);
  });
  it('requires every word', () => {
    expect(songMatches(grace, 'amazing zebra').matched).toBe(false);
    expect(songMatches(grace, 'zebra').matched).toBe(false);
  });
  it('adds ellipses when the excerpt is cut', () => {
    const long = { id: '4', title: 'Long', slides: ['a'.repeat(80) + ' needle ' + 'b'.repeat(80)] };
    const { excerpt } = songMatches(long, 'needle');
    expect(excerpt.startsWith('...')).toBe(true);
    expect(excerpt.endsWith('...')).toBe(true);
    expect(excerpt).toContain('needle');
  });
  it('ignores malformed slides and missing slide lists', () => {
    const odd = { id: '5', title: 'Odd', slides: [null, 5, { text: 'x' }, 'real words here'] };
    expect(songMatches(odd, 'real').via).toBe('lyrics');
    expect(songMatches(odd, 'zzz').matched).toBe(false);
    expect(songMatches({ id: '6', title: 'T' }, 'x').matched).toBe(false);
  });
});

describe('searchSongs', () => {
  const lyricOnly = { id: '2', title: 'Other Song', slides: ['grace and mercy'] };
  const titleStart = { id: '3', title: 'Grace Greater Than Our Sin', slides: ['x'] };
  const titleMid = { id: '4', title: 'Amazing Grace', slides: ['y'] };

  it('ranks title-start, then title, then lyric matches, and drops non-matches', () => {
    const found = searchSongs([lyricOnly, titleMid, titleStart, { id: '9', title: 'Nothing', slides: ['z'] }], 'grace');
    expect(found.map((r) => r.song.id)).toEqual(['3', '4', '2']);
    expect(found[2].via).toBe('lyrics');
  });
  it('lists everything alphabetically for an empty query', () => {
    expect(searchSongs([lyricOnly, titleStart, titleMid], '').map((r) => r.song.id)).toEqual(['4', '3', '2']);
  });
});

describe('markTokens', () => {
  it('wraps each token occurrence, case-insensitively', () => {
    expect(markTokens('Amazing grace', ['amaz', 'grace'])).toBe('<mark>Amaz</mark>ing <mark>grace</mark>');
  });
  it('escapes HTML and never marks inside an entity', () => {
    expect(markTokens('a <b> & c', ['b'])).toBe('a &lt;<mark>b</mark>&gt; &amp; c');
    expect(markTokens('Fish & amp', ['amp'])).toBe('Fish &amp; <mark>amp</mark>');
  });
  it('returns escaped text when there is nothing to mark', () => {
    expect(markTokens('x < y', [])).toBe('x &lt; y');
    expect(markTokens('', ['a'])).toBe('');
  });
});
