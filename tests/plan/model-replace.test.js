import { describe, it, expect } from 'vitest';
import { replaceItem, timerItem } from '../../src/plan/model.js';

const plan = { v: 1, id: 'p', name: 'P', items: [
  { id: 'a', type: 'song', songId: 's' },
  { id: 'b', type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' },
] };

describe('replaceItem', () => {
  it('swaps in a whole new item, keeps the id, and drops fields the new item does not have', () => {
    const next = replaceItem(plan, 'b', timerItem({ mode: 'clock', at: '10:30', title: 'Start' }, () => 'zzz'));
    expect(next.items[1]).toEqual({ id: 'b', type: 'timer', mode: 'clock', at: '10:30', title: 'Start' });
    expect('seconds' in next.items[1]).toBe(false);
    expect(next.items[0]).toBe(plan.items[0]);
    expect(plan.items[1].seconds).toBe(300);
  });
  it('returns the same plan for an unknown id', () => {
    expect(replaceItem(plan, 'nope', plan.items[0])).toBe(plan);
  });
});
