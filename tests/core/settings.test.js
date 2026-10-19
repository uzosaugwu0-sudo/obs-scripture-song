import { describe, it, expect, vi } from 'vitest';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../../src/core/settings.js';
import { memoryStorage } from '../helpers/memory-storage.js';

describe('settings', () => {
  it('round-trips and merges custom colours with defaults', () => {
    const storage = memoryStorage();
    saveSettings({ theme: 'pure', customColors: { bg: '#111111' } }, { storage });
    const loaded = loadSettings({ storage });
    expect(loaded.theme).toBe('pure');
    expect(loaded.customColors).toEqual({ bg: '#111111', text: '#ffffff', accent: '#a78bfa' });
    expect(loaded.opacity).toBe(88);
  });

  it('falls back to defaults and reports corrupt JSON', () => {
    const onError = vi.fn();
    const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
    expect(loadSettings({ storage, onError }).theme).toBe('frosted');
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
    expect(loadSettings({ storage, onError }).theme).toBe('frosted');
    expect(onError).toHaveBeenCalled();
  });

  it.each([
    [{ theme: 'dark', animation: 'fade' }, 'frosted', 'rise'],
    [{ theme: 'gold', animation: 'slide' }, 'frosted', 'rise'],
    [{ theme: 'white', animation: 'none' }, 'frosted-light', 'cut'],
    [{ theme: 'weird', animation: 'spin' }, 'frosted', 'rise'],
    [{}, 'frosted', 'rise'],
  ])('migrates saved settings %j', (saved, theme, animation) => {
    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify(saved) });
    const loaded = loadSettings({ storage });
    expect(loaded.theme).toBe(theme);
    expect(loaded.animation).toBe(animation);
  });
});