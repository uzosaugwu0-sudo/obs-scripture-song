import { describe, it, expect } from 'vitest';
import { announcementItem, timerItem, updateItem, isPlanRecord } from '../../src/plan/model.js';

const counter = () => { let n = 0; return () => 'u' + (n += 1); };
const plan = { v: 1, id: 'p', name: 'P', items: [{ id: 'a', type: 'song', songId: 's' }, { id: 'b', type: 'announcement', title: 'Hi', body: 'x' }] };

describe('announcementItem and timerItem', () => {
  it('builds an announcement with a trimmed title and body', () => {
    expect(announcementItem({ title: '  Welcome ', body: ' Hello there ' }, counter())).toEqual({ id: 'i_u1', type: 'announcement', title: 'Welcome', body: 'Hello there' });
  });
  it('builds a duration timer and a clock timer', () => {
    expect(timerItem({ mode: 'duration', seconds: 300, title: ' Back in ' }, counter())).toEqual({ id: 'i_u1', type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' });
    expect(timerItem({ mode: 'clock', at: '10:30', title: '' }, counter())).toEqual({ id: 'i_u1', type: 'timer', mode: 'clock', at: '10:30', title: '' });
  });
  it('produces items a plan record accepts', () => {
    const next = { ...plan, items: [...plan.items, announcementItem({ title: '', body: 'x' }), timerItem({ mode: 'duration', seconds: 5, title: '' })] };
    expect(isPlanRecord(next)).toBe(true);
  });
});

describe('updateItem', () => {
  it('replaces fields of one item without touching the others and keeps its id and type', () => {
    const next = updateItem(plan, 'b', { title: 'New', body: 'y', id: 'hacked', type: 'song' });
    expect(next.items[1]).toEqual({ id: 'b', type: 'announcement', title: 'New', body: 'y' });
    expect(next.items[0]).toBe(plan.items[0]);
    expect(plan.items[1].title).toBe('Hi');
  });
  it('returns the same plan for an unknown id', () => {
    expect(updateItem(plan, 'zzz', { title: 'x' })).toBe(plan);
  });
});
