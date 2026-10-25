import { describe, it, expect, vi } from 'vitest';
import { createLogoStore } from '../../../src/dock/plan/logo-store.js';
import { createFakeDir } from '../../helpers/fake-dir.js';

const bytes = (...n) => new Uint8Array(n);
const file = (name) => ({ name, type: 'image/png', size: 10 });
const dataUrl = (...n) => 'data:image/png;base64,' + btoa(String.fromCharCode(...n));

async function setup(opts = {}) {
  const dir = createFakeDir();
  const sub = await dir.getDirectoryHandle('logos', { create: true });
  const errors = [];
  const store = createLogoStore({ onError: (e) => errors.push(e), encode: async () => bytes(1, 2, 3), ...opts });
  return { dir, sub, errors, store };
}

describe('attach, list and has', () => {
  it('creates logos/ when missing and lists only plain .png files', async () => {
    const dir = createFakeDir();
    const store = createLogoStore();
    expect(store.available()).toBe(false);
    await store.attach(dir);
    expect(store.available()).toBe(true);
    expect(dir.subdirs.has('logos')).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('lists existing pictures in order and ignores other files', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('b.png', bytes(1));
    sub.files.set('a.png', bytes(1));
    sub.files.set('notes.txt', 'x');
    sub.files.set('photo.jpg', bytes(1));
    await store.attach(dir);
    expect(store.list()).toEqual(['a.png', 'b.png']);
    expect(store.has('a.png')).toBe(true);
    expect(store.has('c.png')).toBe(false);
  });

  it('detach forgets the folder', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('a.png', bytes(1));
    await store.attach(dir);
    store.detach();
    expect(store.available()).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.has('a.png')).toBe(false);
    expect(await store.read('a.png')).toBeNull();
  });
});

describe('add', () => {
  it('saves the encoded bytes under a safe .png name and returns it', async () => {
    const { dir, sub, store } = await setup();
    await store.attach(dir);
    const name = await store.add(file('Church Logo.jpg'));
    expect(name).toBe('Church_Logo.png');
    expect(sub.files.get('Church_Logo.png')).toEqual(bytes(1, 2, 3));
    expect(store.list()).toEqual(['Church_Logo.png']);
    expect(store.has(name)).toBe(true);
  });

  it('never overwrites an existing picture', async () => {
    const { dir, store } = await setup();
    await store.attach(dir);
    expect(await store.add(file('logo.png'))).toBe('logo.png');
    expect(await store.add(file('logo.png'))).toBe('logo (2).png');
    expect(store.list()).toEqual(['logo (2).png', 'logo.png']);
  });

  it('refuses without a folder, and passes on an encoder error unchanged', async () => {
    const none = createLogoStore();
    await expect(none.add(file('a.png'))).rejects.toThrow('library folder');
    const { dir, sub, store } = await setup({ encode: async () => { throw new Error('That file is not a picture.'); } });
    await store.attach(dir);
    await expect(store.add(file('a.txt'))).rejects.toThrow('That file is not a picture.');
    expect(sub.files.size).toBe(0);
    expect(store.list()).toEqual([]);
  });
});

describe('read', () => {
  it('returns the picture as a PNG data URL', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('a.png', bytes(137, 80, 78, 71));
    await store.attach(dir);
    expect(await store.read('a.png')).toBe(dataUrl(137, 80, 78, 71));
  });

  it('returns null for a missing file without reporting an error', async () => {
    const { dir, errors, store } = await setup();
    await store.attach(dir);
    expect(await store.read('gone.png')).toBeNull();
    expect(errors).toEqual([]);
  });

  it('returns null for a bad name without touching the folder', async () => {
    const { dir, sub, store } = await setup();
    await store.attach(dir);
    sub.getFileHandle = vi.fn();
    for (const bad of ['../a.png', 'a/b.png', 'a.jpg', '', null]) expect(await store.read(bad)).toBeNull();
    expect(sub.getFileHandle).not.toHaveBeenCalled();
  });

  it('returns null and reports an unexpected error such as a lost folder', async () => {
    const { dir, sub, errors, store } = await setup();
    sub.files.set('a.png', bytes(1));
    await store.attach(dir);
    sub.denied = true;
    expect(await store.read('a.png')).toBeNull();
    expect(errors).toHaveLength(1);
  });
});
