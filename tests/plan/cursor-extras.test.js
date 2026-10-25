import { describe, it, expect } from 'vitest';
import { itemStatus, itemTitle, nextLoadable, planSummary } from '../../src/plan/cursor.js';

const library = { get: () => null };
const ann = { id: 'a', type: 'announcement', title: 'Welcome', body: 'Please silence phones\nthanks' };
const annNoTitle = { id: 'b', type: 'announcement', title: '', body: 'Offering\nplease give' };
const annEmpty = { id: 'c', type: 'announcement', title: 'Empty', body: '   ' };
const dur = { id: 'd', type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' };
const durNoTitle = { id: 'e', type: 'timer', mode: 'duration', seconds: 90, title: '' };
const clock = { id: 'f', type: 'timer', mode: 'clock', at: '10:30', title: '' };
const badSeconds = { id: 'g', type: 'timer', mode: 'duration', seconds: -5, title: '' };
const badClock = { id: 'h', type: 'timer', mode: 'clock', at: '25:99', title: '' };

describe('announcement and timer items', () => {
  it('are loadable when valid and unsupported when not', () => {
    expect([ann, annNoTitle, dur, durNoTitle, clock].map((i) => itemStatus(i, library))).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect([annEmpty, badSeconds, badClock].map((i) => itemStatus(i, library))).toEqual(['unsupported', 'unsupported', 'unsupported']);
  });

  it('are titled by their title, else the first line or the time', () => {
    expect(itemTitle(ann, library)).toBe('Welcome');
    expect(itemTitle(annNoTitle, library)).toBe('Offering');
    expect(itemTitle(dur, library)).toBe('Back in');
    expect(itemTitle(durNoTitle, library)).toBe('1:30');
    expect(itemTitle(clock, library)).toBe('at 10:30');
    expect(itemTitle(badSeconds, library)).toBe('Unsupported item');
    expect(itemTitle(annEmpty, library)).toBe('Unsupported item');
  });

  it('Next item skips invalid ones and the summary names the next valid one', () => {
    const plan = { v: 1, id: 'p', name: 'P', items: [badSeconds, annEmpty, dur] };
    expect(nextLoadable(plan, null, library).id).toBe('d');
    expect(planSummary(plan, null, library)).toBe('3 items \u00b7 Next: Back in');
  });
});
