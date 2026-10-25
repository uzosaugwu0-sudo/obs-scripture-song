import { describe, it, expect } from 'vitest';
import { remainingMs, formatClock, isStale, isRunning, STALE_AFTER_MS } from '../../src/overlay/timer-clock.js';

describe('remainingMs', () => {
  it('counts down against the clock for a running timer and never goes negative', () => {
    expect(remainingMs({ endAt: 10_000 }, 4_000)).toBe(6_000);
    expect(remainingMs({ endAt: 10_000 }, 10_000)).toBe(0);
    expect(remainingMs({ endAt: 10_000 }, 99_000)).toBe(0);
  });
  it('returns the frozen value for a paused timer', () => {
    expect(remainingMs({ remainingMs: 7_500 }, 123_456)).toBe(7_500);
    expect(remainingMs({ remainingMs: -5 }, 0)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(599_000)).toBe('9:59');
    expect(formatClock(3_599_000)).toBe('59:59');
  });
  it('switches to hours from one hour up', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
    expect(formatClock(359_999_000)).toBe('99:59:59');
  });
  it('rounds up to whole seconds so 0:00 only appears at real zero', () => {
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(999)).toBe('0:01');
    expect(formatClock(1_001)).toBe('0:02');
  });
  it('treats negative input as zero', () => {
    expect(formatClock(-50)).toBe('0:00');
  });
});

describe('isStale and isRunning', () => {
  it('only a running timer more than an hour past its end is stale', () => {
    const now = 10_000_000;
    expect(isStale({ endAt: now - STALE_AFTER_MS - 1 }, now)).toBe(true);
    expect(isStale({ endAt: now - STALE_AFTER_MS }, now)).toBe(false);
    expect(isStale({ endAt: now - 60_000 }, now)).toBe(false);
    expect(isStale({ endAt: now + 60_000 }, now)).toBe(false);
    expect(isStale({ remainingMs: 0 }, now)).toBe(false);
  });
  it('knows a running timer from a paused one', () => {
    expect(isRunning({ endAt: 5 })).toBe(true);
    expect(isRunning({ remainingMs: 5 })).toBe(false);
  });
});
