import { describe, it, expect } from 'vitest';
import { splitLines } from '../../src/overlay/split-lines.js';

describe('splitLines (songs)', () => {
  it('splits on line breaks, trims and drops blanks', () => {
    expect(splitLines('Line one\n\n  Line two \r\nLine three\n', 'song')).toEqual(['Line one', 'Line two', 'Line three']);
  });
  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitLines('', 'song')).toEqual([]);
    expect(splitLines('   \n \n', 'song')).toEqual([]);
    expect(splitLines(undefined, 'song')).toEqual([]);
  });
});

describe('splitLines (verses)', () => {
  it('splits after clause punctuation', () => {
    const verse = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
    expect(splitLines(verse, 'verse')).toEqual([
      'For God so loved the world,',
      'that he gave his only begotten Son,',
      'that whosoever believeth in him should not perish,',
      'but have everlasting life.',
    ]);
  });
  it('joins a short first piece with the next one', () => {
    expect(splitLines('Jesus wept. Then he rose up and walked away.', 'verse'))
      .toEqual(['Jesus wept. Then he rose up and walked away.']);
  });
  it('joins a short last piece with the previous one', () => {
    expect(splitLines('This is a longer clause, ok.', 'verse')).toEqual(['This is a longer clause, ok.']);
  });
  it('keeps text without punctuation as one line', () => {
    expect(splitLines('In the beginning God created the heavens and the earth', 'verse'))
      .toEqual(['In the beginning God created the heavens and the earth']);
  });
  it('survives one very long word', () => {
    const word = 'x'.repeat(500);
    expect(splitLines(word, 'verse')).toEqual([word]);
  });
  it('groups evenly when there are more than 8 pieces', () => {
    const verse = Array.from({ length: 10 }, (_, i) => `clause number ${i},`).join(' ');
    const lines = splitLines(verse, 'verse');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('clause number 0, clause number 1,');
  });
  it('collapses odd whitespace and returns nothing for blank text', () => {
    expect(splitLines('  a   verse   with   gaps  ', 'verse')).toEqual(['a verse with gaps']);
    expect(splitLines('  \n ', 'verse')).toEqual([]);
  });
});