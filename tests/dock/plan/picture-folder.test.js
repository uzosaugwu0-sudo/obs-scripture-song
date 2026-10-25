import { describe, it, expect, vi } from 'vitest';
import { createPictureFolder } from '../../../src/dock/plan/picture-folder.js';

const memoryKv = () => {
  const map = new Map();
  return { get: async (k) => map.get(k), set: async (k, v) => { map.set(k, v); } };
};
const handle = (name = 'Church Logos', permission = 'granted') => ({
  name,
  queryPermission: vi.fn(async () => permission),
  requestPermission: vi.fn(async () => 'granted'),
});

function setup(opts = {}) {
  const kv = memoryKv();
  const logoStore = { usePictureFolder: vi.fn(async () => {}) };
  const onChange = vi.fn();
  const errors = [];
  const folder = createPictureFolder({
    logoStore, kv, onChange, report: (e) => errors.push(e), canPick: () => true, showPicker: vi.fn(async () => handle()), ...opts,
  });
  return { folder, kv, logoStore, onChange, errors };
}

describe('choose', () => {
  it('asks for a folder once, remembers it and starts using it', async () => {
    const picked = handle('Church Logos');
    const { folder, kv, logoStore, onChange } = setup({ showPicker: vi.fn(async () => picked) });
    expect(folder.status()).toEqual({ state: 'none', name: '' });
    expect(await folder.choose()).toBe(true);
    expect(logoStore.usePictureFolder).toHaveBeenCalledWith(picked);
    expect(folder.status()).toEqual({ state: 'ready', name: 'Church Logos' });
    expect(await kv.get('library-dir')).toBe(picked);
    expect(onChange).toHaveBeenCalled();
  });

  it('asks for read and write access', async () => {
    const showPicker = vi.fn(async () => handle());
    const { folder } = setup({ showPicker });
    await folder.choose();
    expect(showPicker).toHaveBeenCalledWith({ id: 'obs-pictures', mode: 'readwrite' });
  });

  it('returns false when the person closes the chooser, and changes nothing', async () => {
    const { folder, logoStore } = setup({ showPicker: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }) });
    expect(await folder.choose()).toBe(false);
    expect(logoStore.usePictureFolder).not.toHaveBeenCalled();
    expect(folder.status().state).toBe('none');
  });

  it('reports a real failure and rethrows it', async () => {
    const { folder, errors } = setup({ showPicker: vi.fn(async () => { throw new Error('boom'); }) });
    await expect(folder.choose()).rejects.toThrow('boom');
    expect(errors).toHaveLength(1);
  });

  it('says whether this browser can pick a folder', () => {
    expect(setup().folder.supported()).toBe(true);
    expect(setup({ canPick: () => false }).folder.supported()).toBe(false);
  });
});

describe('restore after a restart', () => {
  it('uses the remembered folder when access is still granted', async () => {
    const { folder, kv, logoStore } = setup();
    const remembered = handle('Church Logos', 'granted');
    await kv.set('library-dir', remembered);
    await folder.restore();
    expect(logoStore.usePictureFolder).toHaveBeenCalledWith(remembered);
    expect(folder.status()).toEqual({ state: 'ready', name: 'Church Logos' });
  });

  it('waits for the person to confirm access when it must be asked for again', async () => {
    const { folder, kv, logoStore } = setup();
    const remembered = handle('Church Logos', 'prompt');
    await kv.set('library-dir', remembered);
    await folder.restore();
    expect(logoStore.usePictureFolder).not.toHaveBeenCalled();
    expect(folder.status()).toEqual({ state: 'needs-permission', name: 'Church Logos' });
    expect(await folder.reconnect()).toBe(true);
    expect(remembered.requestPermission).toHaveBeenCalled();
    expect(logoStore.usePictureFolder).toHaveBeenCalledWith(remembered);
    expect(folder.status().state).toBe('ready');
  });

  it('does nothing when no folder was ever chosen', async () => {
    const { folder, logoStore } = setup();
    await folder.restore();
    expect(logoStore.usePictureFolder).not.toHaveBeenCalled();
    expect(folder.status().state).toBe('none');
  });

  it('survives a storage error and reports it', async () => {
    const { folder, errors } = setup({ kv: { get: async () => { throw new Error('db'); }, set: async () => {} } });
    await folder.restore();
    expect(errors).toHaveLength(1);
    expect(folder.status().state).toBe('none');
  });
});

describe('forget', () => {
  it('stops using the folder and does not bring it back after a restart', async () => {
    const { folder, kv, logoStore } = setup();
    await folder.choose();
    await folder.forget();
    expect(logoStore.usePictureFolder).toHaveBeenLastCalledWith(null);
    expect(folder.status()).toEqual({ state: 'none', name: '' });
    const again = createPictureFolder({ logoStore, kv, canPick: () => true, showPicker: async () => handle() });
    await again.restore();
    expect(again.status().state).toBe('none');
  });
});
