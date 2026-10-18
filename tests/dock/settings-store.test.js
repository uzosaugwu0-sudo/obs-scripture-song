import { describe, it, expect, vi } from 'vitest';
import { createSettingsStore } from '../../src/dock/settings-store.js';
import { SETTINGS_KEY } from '../../src/core/settings.js';
import { memoryStorage } from '../helpers/memory-storage.js';

describe('settings store', () => {
  it('starts from defaults and migrates legacy saved values', () => {
    expect(createSettingsStore({ storage: memoryStorage() }).get()).toMatchObject({ theme: 'frosted', animation: 'rise', opacity: 88 });
    const legacy = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'white', animation: 'none', language: 'English' }) });
    expect(createSettingsStore({ storage: legacy }).get()).toMatchObject({ theme: 'frosted-light', animation: 'cut', language: 'English' });
  });

  it('update returns a new object, merges custom colours and notifies', () => {
    const store = createSettingsStore({ storage: memoryStorage() });
    const before = store.get();
    const seen = vi.fn();
    store.subscribe(seen);
    const after = store.update({ theme: 'pure', customColors: { bg: '#111111' } });
    expect(after).not.toBe(before);
    expect(before.theme).toBe('frosted');
    expect(after.theme).toBe('pure');
    expect(after.customColors).toEqual({ bg: '#111111', text: '#ffffff', accent: '#a78bfa' });
    expect(seen).toHaveBeenCalledWith(after);
  });

  it('persists only the persisted keys and survives a reload', () => {
    const storage = memoryStorage();
    const store = createSettingsStore({ storage });
    store.update({ theme: 'sacred-light', translation: 'WEB', autoShow: true, seq: 99, action: 'hide' });
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY));
    expect(saved).toMatchObject({ theme: 'sacred-light', translation: 'WEB', autoShow: true });
    expect('seq' in saved).toBe(false);
    expect('action' in saved).toBe(false);
    expect(createSettingsStore({ storage }).get()).toMatchObject({ theme: 'sacred-light', translation: 'WEB', autoShow: true });
  });

  it('styleState exposes only overlay fields and derives bgMode', () => {
    const store = createSettingsStore({ storage: memoryStorage() });
    const plain = store.styleState();
    expect(plain.bgMode).toBe('color');
    expect(plain.bgImage).toBeNull();
    expect('translation' in plain).toBe(false);
    expect('autoShow' in plain).toBe(false);
    store.update({ bgImage: 'data:image/png;base64,AAAA' });
    expect(store.styleState()).toMatchObject({ bgMode: 'image', bgImage: 'data:image/png;base64,AAAA' });
  });

  it('styleState returns a copy of the custom colours', () => {
    const store = createSettingsStore({ storage: memoryStorage() });
    const style = store.styleState();
    style.customColors.bg = '#000000';
    expect(store.get().customColors.bg).toBe('#0a0a14');
  });

  it('reports corrupt storage and keeps working with defaults', () => {
    const onError = vi.fn();
    const store = createSettingsStore({ storage: memoryStorage({ [SETTINGS_KEY]: '{oops' }), onError });
    expect(store.get().theme).toBe('frosted');
    expect(onError).toHaveBeenCalled();
    expect(() => store.update({ theme: 'pure' })).not.toThrow();
  });

  it('does not throw when saving fails', () => {
    const onError = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const store = createSettingsStore({ storage, onError });
    expect(store.update({ theme: 'pure' }).theme).toBe('pure');
    expect(onError).toHaveBeenCalled();
  });
});
