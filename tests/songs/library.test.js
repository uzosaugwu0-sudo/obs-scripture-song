import { describe, it, expect, vi } from 'vitest';
import { createLibrary } from '../../src/songs/library.js';
import { createLocalSongStore, SONGS_KEY } from '../../src/songs/local-store.js';
import { createSongFolder } from '../../src/songs/folder.js';
import { memoryStorage } from '../helpers/memory-storage.js';
import { createFakeDir } from '../helpers/fake-dir.js';

function setup({ stored = [], dir = createFakeDir() } = {}) {
  const storage = memoryStorage(stored.length ? { [SONGS_KEY]: JSON.stringify(stored) } : {});
  const onModeChange = vi.fn();
  const onError = vi.fn();
  let n = 0;
  const library = createLibrary({
    local: createLocalSongStore(storage), onModeChange, onError, uid: () => `id${++n}`,
  });
  return { library, storage, dir, folder: createSongFolder(dir), onModeChange, onError };
}
const stored = (storage) => JSON.parse(storage.getItem(SONGS_KEY) || '[]');

describe('local mode', () => {
  it('saves, replaces and removes, persisting to localStorage', async () => {
    const { library, storage } = setup();
    const a = await library.save({ title: '  Grace ', slides: ['one'] });
    expect(a).toMatchObject({ id: 'id1', title: 'Grace', altTitle: null, slides: ['one'] });
    await library.save({ ...a, slides: ['one', 'two'] });
    expect(library.list()).toHaveLength(1);
    expect(stored(storage)[0].slides).toEqual(['one', 'two']);
    await library.remove(a.id);
    expect(library.list()).toEqual([]);
    expect(library.mode()).toBe('local');
  });

  it('never mutates the array or songs it handed out', async () => {
    const { library } = setup();
    const a = await library.save({ title: 'A', slides: ['x'] });
    const before = library.list();
    await library.save({ ...a, slides: ['y'] });
    expect(before[0].slides).toEqual(['x']);
    expect(library.list()).not.toBe(before);
  });

  it('upserts imports by title and counts added vs replaced', async () => {
    const { library } = setup();
    await library.save({ title: 'Grace', slides: ['old'] });
    const result = await library.upsertByTitle([
      { title: ' grace ', altTitle: 'alt', slides: ['new'] },
      { title: 'Fresh', slides: ['f'] },
    ]);
    expect(result).toEqual({ added: 1, replaced: 1 });
    expect(library.list().find((s) => s.title === 'Grace')).toMatchObject({ altTitle: 'alt', slides: ['new'] });
  });

  it('clears everything', async () => {
    const { library } = setup({ stored: [{ id: 'a', title: 'A', slides: ['x'] }] });
    await library.clearAll();
    expect(library.list()).toEqual([]);
  });
});

describe('folder mode', () => {
  it('writes carried-over songs and lyrics.txt into an empty folder', async () => {
    const { library, dir, folder } = setup({ stored: [{ id: 'a', title: 'Grace', slides: ['x'] }] });
    const result = await library.attachFolder(folder);
    expect(result).toMatchObject({ loaded: 0, carried: 1 });
    expect(library.mode()).toBe('folder');
    expect(dir.files.has('Grace.json')).toBe(true);
    expect(dir.files.get('lyrics.txt')).toContain('Grace');
  });

  it('treats the folder as truth but keeps browser-only songs (union by title)', async () => {
    const dir = createFakeDir({ 'Grace.json': JSON.stringify({ id: 'f1', title: 'Grace', altTitle: null, slides: ['from folder'] }) });
    const { library, folder } = setup({ dir, stored: [
      { id: 'b1', title: 'grace', slides: ['from browser'] },
      { id: 'b2', title: 'Only Here', slides: ['y'] },
    ] });
    const result = await library.attachFolder(folder);
    expect(result).toMatchObject({ loaded: 1, carried: 1 });
    const titles = library.list().map((s) => s.title).sort();
    expect(titles).toEqual(['Grace', 'Only Here']);
    expect(library.list().find((s) => s.title === 'Grace').slides).toEqual(['from folder']);
    expect(dir.files.has('Only_Here.json')).toBe(true);
  });

  it('writes the song file and refreshes lyrics.txt on save and remove', async () => {
    const { library, dir, folder } = setup();
    await library.attachFolder(folder);
    const a = await library.save({ title: 'New Song', slides: ['la'] });
    expect(dir.files.has('New_Song.json')).toBe(true);
    expect(dir.files.get('lyrics.txt')).toContain('New Song');
    await library.remove(a.id);
    expect(dir.files.has('New_Song.json')).toBe(false);
    expect(dir.files.get('lyrics.txt')).not.toContain('New Song');
  });

  it('writes an empty but valid lyrics.txt for an empty library', async () => {
    const { library, dir, folder } = setup();
    await library.attachFolder(folder);
    expect(dir.files.get('lyrics.txt')).toBe('#OBS-LYRICS-V1\n\n\n');
  });

  it('keeps the song and switches to folder-lost when permission is revoked mid-save, then recovers', async () => {
    const { library, dir, folder, storage, onModeChange, onError } = setup();
    await library.attachFolder(folder);
    dir.denied = true;

    const saved = await library.save({ title: 'Mid Service', slides: ['x'] });
    expect(saved.title).toBe('Mid Service');
    expect(library.list()).toHaveLength(1);
    expect(library.mode()).toBe('folder-lost');
    expect(onModeChange).toHaveBeenLastCalledWith('folder-lost');
    expect(onError).toHaveBeenCalled();
    expect(stored(storage).map((s) => s.title)).toEqual(['Mid Service']);

    dir.denied = false;
    const result = await library.attachFolder(createSongFolder(dir));
    expect(library.mode()).toBe('folder');
    expect(result.carried).toBe(1);
    expect(dir.files.has('Mid_Service.json')).toBe(true);
  });

  it('detach returns to local mode and keeps a copy in localStorage', async () => {
    const { library, folder, storage } = setup();
    await library.attachFolder(folder);
    await library.save({ title: 'Kept', slides: ['x'] });
    library.detach();
    expect(library.mode()).toBe('local');
    expect(stored(storage).map((s) => s.title)).toEqual(['Kept']);
  });

  it('markLost flags a stored folder whose permission lapsed', () => {
    const { library, onModeChange } = setup();
    library.markLost();
    expect(library.mode()).toBe('folder-lost');
    expect(onModeChange).toHaveBeenCalledWith('folder-lost');
  });
});

describe('review fixes', () => {
  it('keeps edits made while the folder was lost when reconnecting', async () => {
    const dir = createFakeDir({ 'Grace.json': JSON.stringify({ id: 'g1', title: 'Grace', altTitle: null, slides: ['v1'] }) });
    const { library, folder } = setup({ dir });
    await library.attachFolder(folder);
    dir.denied = true;
    await library.save({ id: 'g1', title: 'Grace', slides: ['EDITED'] });
    expect(library.mode()).toBe('folder-lost');

    dir.denied = false;
    await library.attachFolder(createSongFolder(dir));
    expect(library.list().find((s) => s.id === 'g1').slides).toEqual(['EDITED']);
    expect(JSON.parse(dir.files.get('Grace.json')).slides).toEqual(['EDITED']);
  });

  it('keeps edits made after Stop using folder when the same folder is chosen again', async () => {
    const dir = createFakeDir({ 'Grace.json': JSON.stringify({ id: 'g1', title: 'Grace', altTitle: null, slides: ['v1'] }) });
    const { library, folder } = setup({ dir });
    await library.attachFolder(folder);
    library.detach();
    await library.save({ id: 'g1', title: 'Grace', slides: ['LOCAL EDIT'] });
    await library.attachFolder(createSongFolder(dir));
    expect(library.list().find((s) => s.id === 'g1').slides).toEqual(['LOCAL EDIT']);
  });

  it('mirrors folder-mode saves to localStorage so a restart without folder access still shows them', async () => {
    const { library, folder, storage } = setup();
    await library.attachFolder(folder);
    await library.save({ title: 'Sunday Song', slides: ['la'] });

    const restarted = createLibrary({ local: createLocalSongStore(storage) });
    restarted.markLost();
    expect(restarted.list().map((s) => s.title)).toEqual(['Sunday Song']);
  });
});
