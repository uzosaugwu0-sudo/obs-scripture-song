import { describe, it, expect, vi } from 'vitest';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../../src/core/settings.js';
import { memoryStorage } from '../helpers/memory-storage.js';

describe('settings', () => {
  it('round-trips and merges custom colours with defaults', () => {
    const storage = memoryStorage();
    saveSettings({ theme: 'gold', customColors: { bg: '#111111' } }, { storage });
    const loaded = loadSettings({ storage });
    expect(loaded.theme).toBe('gold');
    expect(loaded.customColors).toEqual({ bg: '#111111', text: '#ffffff', accent: '#a78bfa' });
    expect(loaded.opacity).toBe(88);
  });

  it('falls back to defaults and reports corrupt JSON', () => {
    const onError = vi.fn();
    const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
    expect(loadSettings({ storage, onError }).theme).toBe('dark');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports a failing save (quota) instead of throwing', () => {
    const onError = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveSettings({ theme: 'x' }, { storage, onError })).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('treats a stored null as corrupt, not as settings', () => {
    const onError = vi.fn();
    const storage = memoryStorage({ [SETTINGS_KEY]: 'null' });
    expect(loadSettings({ storage, onError }).theme).toBe('dark');
    expect(onError).toHaveBeenCalled();
  });
});
