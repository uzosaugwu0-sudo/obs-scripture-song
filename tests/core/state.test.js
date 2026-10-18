import { describe, it, expect } from 'vitest';
import { DEFAULTS, STATE_VERSION, nextSeq, normalizeState } from '../../src/core/state.js';

describe('DEFAULTS', () => {
  it('is frozen and carries version and seq but no timestamp', () => {
    expect(Object.isFrozen(DEFAULTS)).toBe(true);
    expect(DEFAULTS.version).toBe(STATE_VERSION);
    expect(DEFAULTS.seq).toBe(0);
    expect('timestamp' in DEFAULTS).toBe(false);
  });
});

describe('nextSeq', () => {
  it('uses the clock when it is ahead', () => {
    expect(nextSeq(10, 1000)).toBe(1000);
  });
  it('still increases when the clock stalls or goes backwards', () => {
    expect(nextSeq(1000, 1000)).toBe(1001);
    expect(nextSeq(5000, 1000)).toBe(5001);
  });
});

describe('normalizeState', () => {
  it('fills defaults and merges custom colours', () => {
    const state = normalizeState({ action: 'show', kind: 'song', seq: 3, customColors: { bg: '#000000' } });
    expect(state.fontSize).toBe('md');
    expect(state.customColors).toEqual({ bg: '#000000', text: '#ffffff', accent: '#a78bfa' });
  });
  it.each([
    ['null', null],
    ['a string', 'show'],
    ['an unknown action', { action: 'explode', kind: 'verse', seq: 1 }],
    ['an unknown kind', { action: 'show', kind: 'banner', seq: 1 }],
    ['a newer version', { action: 'show', kind: 'verse', seq: 1, version: 99 }],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeState(raw)).toBeNull();
  });
  it('accepts clear without a kind', () => {
    expect(normalizeState({ action: 'clear', visible: false, seq: 2 }).action).toBe('clear');
  });
});
