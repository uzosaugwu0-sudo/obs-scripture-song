import { describe, it, expect } from 'vitest';
import { BIBLE_BOOKS, bookIndexOf } from '../../src/scripture/books.js';

const nameOf = (input) => {
  const i = bookIndexOf(input);
  return i === -1 ? null : BIBLE_BOOKS[i][0];
};

describe('bookIndexOf', () => {
  it.each([
    ['John', 'John'], ['Psalm', 'Psalms'], ['Ps', 'Psalms'], ['1st John', '1 John'],
    ['II Corinthians', '2 Corinthians'], ['Philipp', 'Philippians'],
    ['song of songs', 'Song of Solomon'], ['Jn', 'John'], ['Rev.', 'Revelation'],
  ])('resolves %s to %s', (typed, expected) => {
    expect(nameOf(typed)).toBe(expected);
  });

  it('rejects ambiguous shorthand instead of guessing', () => {
    expect(bookIndexOf('Jo')).toBe(-1);
  });

  it('returns -1 for empty and unknown input', () => {
    expect(bookIndexOf('')).toBe(-1);
    expect(bookIndexOf(undefined)).toBe(-1);
    expect(bookIndexOf('Hezekiah')).toBe(-1);
  });
});

describe('BIBLE_BOOKS', () => {
  it('has 66 books and the right chapter counts for a few', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    expect(BIBLE_BOOKS[18]).toEqual(['Psalms', 'Psa', 150]);
    expect(BIBLE_BOOKS[65]).toEqual(['Revelation', 'Rev', 22]);
  });
});
import { normalizeBookName } from '../../src/scripture/books.js';

describe('normalizeBookName', () => {
  it.each([
    ['John', 'john'], ['  II  Corinthians.', '2 corinthians'], ['1st John', '1 john'],
    ['Third John', '3 john'], ['I Samuel', '1 samuel'], ['', ''], [undefined, ''],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeBookName(input)).toBe(expected);
  });
});
