import { describe, it, expect } from 'vitest';
import { parseReference, buildReference, buildDisplayText, stepReference } from '../../src/scripture/reference.js';

describe('parseReference', () => {
  it.each(['John 3:16', 'John 3.16', 'John 3 16'])('reads %s', (input) => {
    expect(parseReference(input)).toEqual({ book: 'John', chapter: 3, verse: 16, endVerse: null });
  });
  it('reads ranges and numbered books', () => {
    expect(parseReference('1 Corinthians 13:4-7')).toEqual({ book: '1 Corinthians', chapter: 13, verse: 4, endVerse: 7 });
  });
  it('treats a bare chapter as verse 1', () => {
    expect(parseReference('Psalm 23')).toEqual({ book: 'Psalm', chapter: 23, verse: 1, endVerse: null });
  });
  it('returns null for nonsense', () => {
    expect(parseReference('nonsense')).toBeNull();
    expect(parseReference('')).toBeNull();
  });
});

describe('buildReference', () => {
  it('builds single verses and ranges', () => {
    expect(buildReference('John', 3, 16)).toBe('John 3:16');
    expect(buildReference('John', 3, 16, 18)).toBe('John 3:16-18');
    expect(buildReference('John', 3, 16, 16)).toBe('John 3:16');
  });
});

describe('buildDisplayText', () => {
  it('strips Strong numbers, tags and extra whitespace', () => {
    expect(buildDisplayText('In <S>1</S>the <i>beginning</i>')).toBe('In the beginning');
  });
  it('tolerates empty input', () => {
    expect(buildDisplayText(null)).toBe('');
  });
});

describe('stepReference', () => {
  const count36 = async () => 36;

  it('steps within a chapter', async () => {
    expect(await stepReference('John 3:16', 1, count36)).toBe('John 3:17');
  });
  it('rolls forward into the next chapter', async () => {
    expect(await stepReference('John 3:36', 1, count36)).toBe('John 4:1');
  });
  it('rolls back into the previous chapter', async () => {
    expect(await stepReference('John 4:1', -1, count36)).toBe('John 3:36');
  });
  it('returns null at both ends of the Bible', async () => {
    expect(await stepReference('Genesis 1:1', -1, count36)).toBeNull();
    expect(await stepReference('Revelation 22:21', 1, async () => 21)).toBeNull();
  });
  it('steps a range from its last verse forward and first verse back', async () => {
    expect(await stepReference('Romans 8:28-30', 1, count36)).toBe('Romans 8:31');
    expect(await stepReference('Romans 8:28-30', -1, count36)).toBe('Romans 8:27');
  });
  it('still steps forward when the verse count is unknown', async () => {
    expect(await stepReference('John 3:16', 1, async () => 0)).toBe('John 3:17');
  });
  it('returns null for unreadable references', async () => {
    expect(await stepReference('???', 1, count36)).toBeNull();
    expect(await stepReference('Hezekiah 1:1', 1, count36)).toBeNull();
  });
});
