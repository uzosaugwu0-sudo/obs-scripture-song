import { describe, it, expect } from 'vitest';
import {
  itemStatus, itemTitle, indexOfItem, nextLoadable, prevLoadable, currentAfterRemove, planSummary,
} from '../../src/plan/cursor.js';

const songs = { s1: { title: 'One' }, s2: { title: 'Two' }, s3: { title: '' } };
const library = { get: (id) => songs[id] || null };
const plan = {
  v: 1, id: 'p', name: 'P',
  items: [
    { id: 'a', type: 'song', songId: 's1' },
    { id: 'b', type: 'song', songId: 'gone' },
    { id: 'c', type: 'reading', ref: 'John 3:16', translation: 'KJV' },
    { id: 'd', type: 'timer', seconds: 60 },
    { id: 'e', type: 'song', songId: 's2' },
  ],
};
const idOf = (item) => (item ? item.id : null);

describe('itemStatus and itemTitle', () => {
  it('classifies songs, readings and unknown types', () => {
    expect(plan.items.map((i) => itemStatus(i, library))).toEqual(['ok', 'missing', 'ok', 'unsupported', 'ok']);
    expect(itemStatus({ id: 'x', type: 'reading', ref: '  ' }, library)).toBe('unsupported');
  });

  it('titles each kind, with plain words for the broken ones', () => {
    expect(plan.items.map((i) => itemTitle(i, library))).toEqual(['One', 'Song missing', 'John 3:16', 'Unsupported item', 'Two']);
    expect(itemTitle({ id: 'x', type: 'song', songId: 's3' }, library)).toBe('Untitled');
  });
});

describe('moving between items', () => {
  it('finds the next loadable item, skipping missing and unsupported ones', () => {
    expect(idOf(nextLoadable(plan, null, library))).toBe('a');
    expect(idOf(nextLoadable(plan, 'a', library))).toBe('c');
    expect(idOf(nextLoadable(plan, 'c', library))).toBe('e');
    expect(nextLoadable(plan, 'e', library)).toBeNull();
    expect(idOf(nextLoadable(plan, 'zz', library))).toBe('a');
  });

  it('finds the previous loadable item', () => {
    expect(idOf(prevLoadable(plan, 'e', library))).toBe('c');
    expect(idOf(prevLoadable(plan, 'c', library))).toBe('a');
    expect(prevLoadable(plan, 'a', library)).toBeNull();
    expect(prevLoadable(plan, null, library)).toBeNull();
  });

  it('indexOfItem is -1 for a null or unknown id', () => {
    expect(indexOfItem(plan, 'c')).toBe(2);
    expect(indexOfItem(plan, null)).toBe(-1);
    expect(indexOfItem(plan, 'zz')).toBe(-1);
  });
});

describe('currentAfterRemove', () => {
  it('moves current to the item before a removed current item, or to none', () => {
    expect(currentAfterRemove(plan, 'c', 'c')).toBe('b');
    expect(currentAfterRemove(plan, 'a', 'a')).toBeNull();
  });
  it('leaves current alone when another item is removed', () => {
    expect(currentAfterRemove(plan, 'c', 'e')).toBe('c');
    expect(currentAfterRemove(plan, null, 'e')).toBeNull();
  });
});

describe('planSummary', () => {
  it('is null for an empty plan', () => {
    expect(planSummary({ ...plan, items: [] }, null, library)).toBeNull();
  });
  it('describes progress and what is next', () => {
    expect(planSummary(plan, null, library)).toBe('5 items \u00b7 Next: One');
    expect(planSummary(plan, 'c', library)).toBe('3 of 5 \u00b7 Next: Two');
    expect(planSummary(plan, 'e', library)).toBe('5 of 5 \u00b7 End of plan');
    expect(planSummary({ ...plan, items: [plan.items[0]] }, null, library)).toBe('1 item \u00b7 Next: One');
  });
});