import { describe, it, expect } from 'vitest';
import {
  MAX_TIMER_SECONDS, isValidClockTime, isValidTimerSpec, clockEndAt, describeTimerSpec, parseClockInput,
} from '../../src/plan/extras.js';

describe('isValidClockTime', () => {
  it('accepts real 24-hour times only', () => {
    ['00:00', '09:05', '10:30', '23:59'].forEach((t) => expect(isValidClockTime(t)).toBe(true));
    ['24:00', '25:99', '10:60', '9:30', '10:3', '', '10-30', 'ten', null, undefined, 1030].forEach((t) => expect(isValidClockTime(t)).toBe(false));
  });
});

describe('isValidTimerSpec', () => {
  it('validates durations from 1 second to 99:59:59', () => {
    expect(isValidTimerSpec({ mode: 'duration', seconds: 1 })).toBe(true);
    expect(isValidTimerSpec({ mode: 'duration', seconds: MAX_TIMER_SECONDS })).toBe(true);
    expect(isValidTimerSpec({ mode: 'duration', seconds: 0 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: -5 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: 1.5 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: MAX_TIMER_SECONDS + 1 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: '300' })).toBe(false);
  });
  it('validates clock times and rejects unknown modes', () => {
    expect(isValidTimerSpec({ mode: 'clock', at: '10:30' })).toBe(true);
    expect(isValidTimerSpec({ mode: 'clock', at: '25:99' })).toBe(false);
    expect(isValidTimerSpec({ mode: 'stopwatch', seconds: 5 })).toBe(false);
    expect(isValidTimerSpec(null)).toBe(false);
  });
});

describe('clockEndAt', () => {
  it('is today at that local time, even if it has already passed', () => {
    const now = new Date(2026, 9, 25, 9, 0, 0).getTime();
    expect(clockEndAt('10:30', now)).toBe(new Date(2026, 9, 25, 10, 30, 0, 0).getTime());
    const late = new Date(2026, 9, 25, 11, 0, 0).getTime();
    expect(clockEndAt('10:30', late)).toBe(new Date(2026, 9, 25, 10, 30, 0, 0).getTime());
  });
});

describe('describeTimerSpec', () => {
  it('describes durations as M:SS and clock times as "at HH:MM"', () => {
    expect(describeTimerSpec({ mode: 'duration', seconds: 300 })).toBe('5:00');
    expect(describeTimerSpec({ mode: 'duration', seconds: 3725 })).toBe('1:02:05');
    expect(describeTimerSpec({ mode: 'clock', at: '10:30' })).toBe('at 10:30');
  });
});

describe('parseClockInput', () => {
  it('normalises friendly times to HH:MM', () => {
    expect(parseClockInput('10:30')).toBe('10:30');
    expect(parseClockInput('9:05')).toBe('09:05');
    expect(parseClockInput(' 0930 ')).toBe('09:30');
    expect(parseClockInput('930')).toBe('09:30');
  });
  it('returns null for anything that is not a real time', () => {
    ['', '25:00', '10:75', 'noon', '1', '12345', null].forEach((t) => expect(parseClockInput(t)).toBeNull());
  });
});
