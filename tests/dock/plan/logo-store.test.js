import { describe, it, expect, vi } from 'vitest';
import { createLogoStore, logoDataUrl } from '../../../src/dock/plan/logo-store.js';
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
    sub.files.set('photo.bmp', bytes(1));
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

describe('logoDataUrl', () => {
  it('turns picture bytes into a PNG data URL', () => {
    expect(logoDataUrl(bytes(137, 80, 78, 71))).toBe(dataUrl(137, 80, 78, 71));
    expect(logoDataUrl(new Uint8Array(70000))).toMatch(/^data:image\/png;base64,A+=*$/);
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
    await expect(none.add(file('a.png'))).rejects.toThrow('picture folder');
    const { dir, sub, store } = await setup({ encode: async () => { throw new Error('That file is not a picture.'); } });
    await store.attach(dir);
    await expect(store.add(file('a.txt'))).rejects.toThrow('That file is not a picture.');
    expect(sub.files.size).toBe(0);
    expect(store.list()).toEqual([]);
  });
});

describe('read', () => {
  it('returns the picture, shrunk by the encoder, as a PNG data URL', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('a.png', bytes(137, 80, 78, 71));
    await store.attach(dir);
    expect(await store.read('a.png')).toBe(dataUrl(1, 2, 3));
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
    for (const bad of ['../a.png', 'a/b.png', 'a.bmp', '', null]) expect(await store.read(bad)).toBeNull();
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

describe('a picture folder chosen anywhere on the PC', () => {
  const pictureDir = (files = {}) => createFakeDir(files);

  it('lists the images in it, ignoring other files and folders, and is available without a library folder', async () => {
    const { store } = await setup();
    const pics = pictureDir({ 'b.jpg': bytes(1), 'a.png': bytes(1), 'c.webp': bytes(1), 'd.gif': bytes(1), 'notes.txt': 'x', 'logo.bmp': bytes(1) });
    await pics.getDirectoryHandle('sub', { create: true });
    expect(store.available()).toBe(false);
    await store.usePictureFolder(pics);
    expect(store.available()).toBe(true);
    expect(store.list()).toEqual(['a.png', 'b.jpg', 'c.webp', 'd.gif']);
    expect(store.has('b.jpg')).toBe(true);
    expect(store.pictureFolderName()).toBe('songs');
  });

  it('is used instead of the library logos folder, and the library folder is the fallback again when it is cleared', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('lib.png', bytes(1));
    await store.attach(dir);
    expect(store.list()).toEqual(['lib.png']);
    await store.usePictureFolder(pictureDir({ 'pic.png': bytes(1) }));
    expect(store.list()).toEqual(['pic.png']);
    await store.usePictureFolder(null);
    expect(store.list()).toEqual(['lib.png']);
    expect(store.pictureFolderName()).toBe('');
  });

  it('reads a picture from it through the encoder, without copying it', async () => {
    const { store } = await setup();
    const pics = pictureDir({ 'big.jpg': bytes(9, 9, 9) });
    const encode = vi.fn(async () => bytes(7, 7));
    const own = createLogoStore({ encode });
    await own.usePictureFolder(pics);
    expect(await own.read('big.jpg')).toBe(dataUrl(7, 7));
    expect(encode).toHaveBeenCalledTimes(1);
    expect([...pics.files.keys()]).toEqual(['big.jpg']);
    expect(store.available()).toBe(false);
  });

  it('adds a new picture into the chosen folder', async () => {
    const { store } = await setup();
    const pics = pictureDir();
    await store.usePictureFolder(pics);
    expect(await store.add(file('Church Logo.jpg'))).toBe('Church_Logo.png');
    expect(pics.files.has('Church_Logo.png')).toBe(true);
    expect(store.list()).toEqual(['Church_Logo.png']);
  });

  it('refresh picks up files added in the folder outside the app', async () => {
    const { store } = await setup();
    const pics = pictureDir({ 'a.png': bytes(1) });
    await store.usePictureFolder(pics);
    pics.files.set('new.png', bytes(1));
    expect(store.list()).toEqual(['a.png']);
    await store.refresh();
    expect(store.list()).toEqual(['a.png', 'new.png']);
  });

  it('a folder that cannot be read lists nothing and reports the error', async () => {
    const { store, errors } = await setup();
    const pics = pictureDir({ 'a.png': bytes(1) });
    pics.denied = true;
    await store.usePictureFolder(pics);
    expect(store.list()).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
