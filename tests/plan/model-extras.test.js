import { describe, it, expect } from 'vitest';
import { announcementItem, timerItem, isPlanRecord } from '../../src/plan/model.js';

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
