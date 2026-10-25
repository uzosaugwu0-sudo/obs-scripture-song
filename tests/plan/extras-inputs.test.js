import { describe, it, expect } from 'vitest';
import { announcementFromInputs, timerFromInputs } from '../../src/plan/extras.js';

describe('announcementFromInputs', () => {
  it('needs text and trims both fields', () => {
    expect(announcementFromInputs({ title: ' Welcome ', body: ' Hello ' })).toEqual({ ok: true, draft: { type: 'announcement', title: 'Welcome', body: 'Hello' } });
    expect(announcementFromInputs({ title: 'x', body: '   ' })).toEqual({ ok: false, hint: 'Write the text to show.' });
    expect(announcementFromInputs({}).ok).toBe(false);
  });
});

describe('timerFromInputs: duration', () => {
  const base = { mode: 'duration', title: ' Back in ' };
  it('turns minutes and seconds into whole seconds', () => {
    expect(timerFromInputs({ ...base, minutes: '5', seconds: '0' })).toEqual({ ok: true, draft: { type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' } });
    expect(timerFromInputs({ ...base, minutes: '', seconds: '45' }).draft.seconds).toBe(45);
    expect(timerFromInputs({ ...base, minutes: '90', seconds: '' }).draft.seconds).toBe(5400);
    expect(timerFromInputs({ ...base, minutes: '5999', seconds: '59' }).draft.seconds).toBe(359999);
  });
  it('explains what is wrong', () => {
    expect(timerFromInputs({ ...base, minutes: '', seconds: '' })).toEqual({ ok: false, hint: 'Enter a time of at least 1 second.' });
    expect(timerFromInputs({ ...base, minutes: '0', seconds: '0' }).ok).toBe(false);
    expect(timerFromInputs({ ...base, minutes: '1.5', seconds: '0' }).hint).toBe('Use whole numbers for minutes and seconds.');
    expect(timerFromInputs({ ...base, minutes: '-1', seconds: '0' }).hint).toBe('Use whole numbers for minutes and seconds.');
    expect(timerFromInputs({ ...base, minutes: 'ten', seconds: '0' }).ok).toBe(false);
    expect(timerFromInputs({ ...base, minutes: '1', seconds: '75' }).hint).toBe('Seconds go up to 59.');
    expect(timerFromInputs({ ...base, minutes: '6000', seconds: '0' }).hint).toBe('The longest timer is 99:59:59.');
  });
});

describe('timerFromInputs: clock time', () => {
  it('accepts friendly times and rejects bad ones', () => {
    expect(timerFromInputs({ mode: 'clock', title: '', clock: '9:05' })).toEqual({ ok: true, draft: { type: 'timer', mode: 'clock', at: '09:05', title: '' } });
    expect(timerFromInputs({ mode: 'clock', title: '', clock: '25:99' })).toEqual({ ok: false, hint: 'Enter a 24-hour time such as 10:30.' });
    expect(timerFromInputs({ mode: 'clock', title: '', clock: '' }).ok).toBe(false);
  });
});
