import { describe, it, expect } from 'vitest';
import { suggestBooks, classifyInput, dropdownRows } from '../../src/scripture/smart-input.js';
import { BIBLE_BOOKS } from '../../src/scripture/books.js';

const nameAt = (i) => BIBLE_BOOKS[i][0];

describe('suggestBooks', () => {
  it('suggests by prefix, abbreviation and alias, in Bible order', () => {
    expect(suggestBooks('joh')).toEqual(['John']);
    expect(suggestBooks('ps')).toEqual(['Psalms']);
    expect(suggestBooks('1 jo')).toEqual(['1 John']);
    expect(suggestBooks('II cor')).toEqual(['2 Corinthians']);
  });
  it('caps the list and handles ambiguity', () => {
    const jo = suggestBooks('jo');
    expect(jo.length).toBeLessThanOrEqual(5);
    expect(jo).toContain('John');
    expect(suggestBooks('j', 2)).toHaveLength(2);
  });
  it('returns nothing for blank or unknown text', () => {
    expect(suggestBooks('')).toEqual([]);
    expect(suggestBooks('   ')).toEqual([]);
    expect(suggestBooks('zzz')).toEqual([]);
  });
});

describe('classifyInput', () => {
  it('treats blank input as empty', () => {
    expect(classifyInput('')).toEqual({ kind: 'empty' });
    expect(classifyInput('   ')).toEqual({ kind: 'empty' });
    expect(classifyInput(undefined)).toEqual({ kind: 'empty' });
  });
  it.each([
    ['John 3:16', 'John 3:16'],
    ['  Psalm 23 ', 'Psalm 23'],
    ['1 Cor 13:4-7', '1 Cor 13:4-7'],
    ['john  3 :16', 'john  3 :16'],
    ['JOHN 3.16', 'JOHN 3.16'],
  ])('reads %j as a reference', (text, reference) => {
    expect(classifyInput(text)).toEqual({ kind: 'reference', reference });
  });
  it('reads a bare book name, with ordinals, as a book', () => {
    expect(classifyInput('john')).toEqual({ kind: 'book', bookIndex: 42 });
    expect(nameAt(classifyInput('II Corinthians').bookIndex)).toBe('2 Corinthians');
    expect(nameAt(classifyInput('1 John').bookIndex)).toBe('1 John');
  });
  it.each([
    ['loved the world', 'loved the world'],
    ['the', 'the'],
    ['316', '316'],
    ['jo', 'jo'],
    ['Hezekiah 1:1', 'Hezekiah 1:1'],
    ['John 3:16 loved', 'John 3:16 loved'],
  ])('falls back to word search for %j', (text, query) => {
    expect(classifyInput(text)).toEqual({ kind: 'search', query });
  });
  it('never throws on very long or odd input', () => {
    const long = 'love '.repeat(400);
    expect(classifyInput(long).kind).toBe('search');
    expect(classifyInput('???').kind).toBe('search');
    expect(classifyInput('\n\t').kind).toBe('empty');
  });
});

describe('dropdownRows', () => {
  it('shows book rows for a prefix and no search row for a unique book', () => {
    expect(dropdownRows('joh')).toEqual([{ type: 'book', name: 'John' }]);
    expect(dropdownRows('mark')).toEqual([{ type: 'book', name: 'Mark' }]);
  });
  it('offers word search for text that is not a book or reference', () => {
    expect(dropdownRows('loved')).toEqual([{ type: 'search', query: 'loved' }]);
    expect(dropdownRows('the')).toEqual([{ type: 'search', query: 'the' }]);
    expect(dropdownRows('Hezekiah')).toEqual([{ type: 'search', query: 'Hezekiah' }]);
  });
  it('shows nothing for a finished reference, short text or blank input', () => {
    expect(dropdownRows('John 3:16')).toEqual([]);
    expect(dropdownRows('lo')).toEqual([]);
    expect(dropdownRows('')).toEqual([]);
  });
  it('keeps suggestions for short prefixes without a search row', () => {
    expect(dropdownRows('ps')).toEqual([{ type: 'book', name: 'Psalms' }]);
    expect(dropdownRows('1 jo')).toEqual([{ type: 'book', name: '1 John' }]);
  });
});
