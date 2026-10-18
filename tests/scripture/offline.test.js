import { describe, it, expect, vi } from 'vitest';
import { createOfflineProvider } from '../../src/scripture/offline.js';

const KJV = { 43: { 3: { 16: 'For God so loved the world' } } };

describe('offline provider', () => {
  it('loads a bundle once and serves chapters from it', async () => {
    const registry = {};
    const loadScript = vi.fn(async () => { registry.KJV = KJV; });
    const provider = createOfflineProvider({ loadScript, registry: () => registry });
    expect(await provider.getChapter('KJV', 43, 3)).toEqual({ 16: 'For God so loved the world' });
    expect(await provider.getChapter('KJV', 43, 3)).toEqual({ 16: 'For God so loved the world' });
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith('bible/KJV.js');
  });

  it('returns null for translations that are not bundled and for missing chapters', async () => {
    const registry = { KJV };
    const loadScript = vi.fn();
    const provider = createOfflineProvider({ loadScript, registry: () => registry });
    expect(await provider.getChapter('NIV', 43, 3)).toBeNull();
    expect(await provider.getChapter('KJV', 1, 1)).toBeNull();
    expect(loadScript).not.toHaveBeenCalled();
  });

  it('retries after a failed load', async () => {
    const registry = {};
    let calls = 0;
    const loadScript = async () => { calls += 1; if (calls === 1) throw new Error('nope'); registry.WEB = { 1: { 1: { 1: 'x' } } }; };
    const provider = createOfflineProvider({ loadScript, registry: () => registry });
    await expect(provider.getChapter('WEB', 1, 1)).rejects.toThrow('nope');
    expect(await provider.getChapter('WEB', 1, 1)).toEqual({ 1: 'x' });
  });
});
