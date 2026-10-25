import { describe, it, expect } from 'vitest';
import { KINDS, DEFAULTS, normalizeState } from '../../src/core/state.js';

describe('announcement and timer kinds', () => {
  it('lists the new kinds and defaults the timer field to null', () => {
    expect(KINDS).toEqual(['verse', 'song', 'announcement', 'timer', 'lowerthird']);
    expect(DEFAULTS.timer).toBeNull();
  });

  it('accepts an announcement with a title and body', () => {
    const state = normalizeState({ action: 'show', kind: 'announcement', title: 'Welcome', body: 'Please silence phones' });
    expect(state).toMatchObject({ kind: 'announcement', title: 'Welcome', body: 'Please silence phones' });
  });

  it('accepts a running timer and a paused timer', () => {
    expect(normalizeState({ action: 'show', kind: 'timer', timer: { endAt: 1761389400000 } }).timer).toEqual({ endAt: 1761389400000 });
    expect(normalizeState({ action: 'show', kind: 'timer', timer: { remainingMs: 0 } }).timer).toEqual({ remainingMs: 0 });
  });

  it('rejects a timer state with a missing or unusable timer field', () => {
    const base = { action: 'show', kind: 'timer' };
    expect(normalizeState(base)).toBeNull();
    expect(normalizeState({ ...base, timer: null })).toBeNull();
    expect(normalizeState({ ...base, timer: {} })).toBeNull();
    expect(normalizeState({ ...base, timer: { endAt: 'soon' } })).toBeNull();
    expect(normalizeState({ ...base, timer: { endAt: Infinity } })).toBeNull();
    expect(normalizeState({ ...base, timer: { endAt: NaN } })).toBeNull();
    expect(normalizeState({ ...base, timer: { remainingMs: -1 } })).toBeNull();
    expect(normalizeState({ ...base, timer: 'ten' })).toBeNull();
  });

  it('does not care about the timer field for other kinds', () => {
    expect(normalizeState({ action: 'show', kind: 'verse', timer: 'junk' })).not.toBeNull();
  });

  it('still lets hide and clear through for a timer without a timer field only when the kind is valid', () => {
    expect(normalizeState({ action: 'clear' })).not.toBeNull();
    expect(normalizeState({ action: 'hide', kind: 'timer', timer: { remainingMs: 5000 } })).not.toBeNull();
  });
});
