import { describe, it, expect } from 'vitest';
import { findDuplicateGroups, pickRemovals } from '../../src/songs/duplicates.js';

const song = (id, title, n) => ({ id, title, slides: Array.from({ length: n }, (_, i) => `s${i}`) });

describe('duplicates', () => {
  it('groups by title ignoring case and spacing, skipping blank titles', () => {
    const groups = findDuplicateGroups([song('1', 'Grace', 2), song('2', ' grace ', 4), song('3', 'Other', 1), song('4', '', 1), song('5', '', 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.id)).toEqual(['1', '2']);
  });
  it('keeps the fullest copy, and the first on a tie', () => {
    const removals = pickRemovals([[song('1', 'G', 2), song('2', 'g', 4), song('3', 'G', 4)]]);
    expect([...removals].sort()).toEqual(['1', '3']);
  });
  it('removes nothing when there are no duplicates', () => {
    expect(pickRemovals(findDuplicateGroups([song('1', 'A', 1), song('2', 'B', 1)])).size).toBe(0);
  });
});
