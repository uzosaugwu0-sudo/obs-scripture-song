import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BIBLE_BOOKS } from '../../src/scripture/books.js';

describe.each(['KJV', 'WEB'])('%s data', (id) => {
  const data = JSON.parse(readFileSync(`data/bible/${id}.json`, 'utf8'));

  it('has every chapter of every book', () => {
    BIBLE_BOOKS.forEach(([name, , chapters], i) => {
      for (let c = 1; c <= chapters; c += 1) {
        expect(Object.keys(data[i + 1]?.[c] ?? {}).length, `${name} ${c}`).toBeGreaterThan(0);
      }
    });
  });

  it('has clean text with no markup or Strong numbers', () => {
    const all = Object.values(data).flatMap((b) => Object.values(b)).flatMap((ch) => Object.values(ch));
    expect(all.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
    expect(all.some((t) => /<[^>]+>/.test(t))).toBe(false);
  });

  it('contains the verses the smoke test relies on', () => {
    expect(data[43][3][16]).toMatch(/God so loved the world/);
    expect(data[1][1][1]).toMatch(/In the beginning/);
  });
});
