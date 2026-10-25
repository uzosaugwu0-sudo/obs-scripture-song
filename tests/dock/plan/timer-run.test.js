import { describe, it, expect } from 'vitest';
import { createTimerRun } from '../../../src/dock/plan/timer-run.js';

function setup() {
  const clock = { t: new Date(2026, 9, 25, 9, 0, 0).getTime() };
  const run = createTimerRun(() => clock.t);
  return { run, clock };
}
const duration = (seconds, title = '') => ({ id: 'i', type: 'timer', mode: 'duration', seconds, title });
const clockItem = (at, title = '') => ({ id: 'i', type: 'timer', mode: 'clock', at, title });

describe('loading', () => {
  it('accepts valid timers and refuses invalid ones without losing the loaded one', () => {
    const { run } = setup();
    expect(run.load(duration(300, ' Back in '))).toBe(true);
    expect(run.loaded().title).toBe('Back in');
    expect(run.load(duration(-5))).toBe(false);
    expect(run.load({ id: 'x', type: 'timer', mode: 'clock', at: '25:99' })).toBe(false);
    expect(run.loaded().spec).toEqual({ mode: 'duration', seconds: 300 });
  });
});

describe('a duration timer', () => {
  it('starts at Show with the full time and counts down', () => {
    const { run, clock } = setup();
    run.load(duration(300));
    expect(run.running()).toBeNull();
    const timer = run.start();
    expect(timer).toEqual({ endAt: clock.t + 300_000 });
    clock.t += 60_000;
    expect(run.remainingNow()).toBe(240_000);
  });

  it('pauses with the time left, resumes from it, and resets to the full time', () => {
    const { run, clock } = setup();
    run.load(duration(300));
    run.start();
    clock.t += 100_000;
    expect(run.pause()).toBe(true);
    expect(run.running().timer).toEqual({ remainingMs: 200_000 });
    expect(run.isPaused()).toBe(true);
    clock.t += 50_000;
    expect(run.remainingNow()).toBe(200_000);
    expect(run.resume()).toBe(true);
    expect(run.running().timer).toEqual({ endAt: clock.t + 200_000 });
    clock.t += 10_000;
    expect(run.reset()).toBe(true);
    expect(run.running().timer).toEqual({ endAt: clock.t + 300_000 });
    expect(run.isPaused()).toBe(false);
  });

  it('ignores pause when already paused and resume when running', () => {
    const { run } = setup();
    run.load(duration(60));
    run.start();
    expect(run.resume()).toBe(false);
    run.pause();
    expect(run.pause()).toBe(false);
  });

  it('pausing at zero keeps zero', () => {
    const { run, clock } = setup();
    run.load(duration(10));
    run.start();
    clock.t += 99_000;
    run.pause();
    expect(run.running().timer).toEqual({ remainingMs: 0 });
  });

  it('starting again restarts the full time', () => {
    const { run, clock } = setup();
    run.load(duration(300));
    run.start();
    clock.t += 120_000;
    run.start();
    expect(run.remainingNow()).toBe(300_000);
  });
});

describe('a clock timer', () => {
  it('counts to today at that time and has no pause or reset', () => {
    const { run, clock } = setup();
    run.load(clockItem('10:30'));
    const timer = run.start();
    expect(timer).toEqual({ endAt: new Date(2026, 9, 25, 10, 30, 0, 0).getTime() });
    expect(run.remainingNow()).toBe(90 * 60_000);
    expect(run.canControl()).toBe(false);
    expect(run.pause()).toBe(false);
    expect(run.reset()).toBe(false);
    clock.t = new Date(2026, 9, 25, 10, 31, 0).getTime();
    expect(run.remainingNow()).toBe(0);
  });

  it('a time that passed more than an hour ago is sent as zero, so the overlay does not drop it as stale', () => {
    const { run, clock } = setup();
    clock.t = new Date(2026, 9, 25, 23, 50, 0).getTime();
    run.load(clockItem('00:05'));
    expect(run.start()).toEqual({ remainingMs: 0 });
    expect(run.previewTimer({ mode: 'clock', at: '00:05' })).toEqual({ remainingMs: 0 });
    expect(run.remainingNow()).toBe(0);
  });

  it('a time that already passed today stays in the past and shows zero', () => {
    const { run, clock } = setup();
    clock.t = new Date(2026, 9, 25, 11, 0, 0).getTime();
    run.load(clockItem('10:30'));
    run.start();
    expect(run.remainingNow()).toBe(0);
  });
});

describe('previews and stopping', () => {
  it('previews a duration as the full time and a clock timer against the clock', () => {
    const { run, clock } = setup();
    expect(run.previewTimer({ mode: 'duration', seconds: 90 })).toEqual({ remainingMs: 90_000 });
    expect(run.previewTimer({ mode: 'clock', at: '09:30' })).toEqual({ endAt: new Date(2026, 9, 25, 9, 30, 0, 0).getTime() });
    expect(clock.t).toBeGreaterThan(0);
  });
  it('has no running clock before start', () => {
    const { run } = setup();
    expect(run.canControl()).toBe(false);
    expect(run.remainingNow()).toBeNull();
    expect(run.start()).toBeNull();
  });
});
