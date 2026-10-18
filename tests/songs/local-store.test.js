import { describe, it, expect, vi } from 'vitest';
import { createLocalSongStore, SONGS_KEY, LEGACY_SONGS_KEY } from '../../src/songs/local-store.js';
import { memoryStorage } from '../helpers/memory-storage.js';

const good = { id: 'a', title: 'A', slides: ['x'] };

describe('local song store', () => {
  it('saves and loads', () => {
    const store = createLocalSongStore(memoryStorage());
    store.save([good]);
    expect(store.load()).toEqual([{ ...good, altTitle: null }]);
  });

  it('migrates a non-empty legacy library once and keeps the legacy key', () => {
    const storage = memoryStorage({ [LEGACY_SONGS_KEY]: JSON.stringify([good]) });
    const store = createLocalSongStore(storage);
    expect(store.load()).toEqual([{ ...good, altTitle: null }]);
    expect(storage.getItem(SONGS_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_SONGS_KEY)).not.toBeNull();
  });

  it('ignores an empty legacy library', () => {
    const storage = memoryStorage({ [LEGACY_SONGS_KEY]: '[]' });
    expect(createLocalSongStore(storage).load()).toEqual([]);
    expect(storage.getItem(SONGS_KEY)).toBeNull();
  });

  it('survives corrupt JSON, reports it and returns an empty library', () => {
    const onError = vi.fn();
    const storage = memoryStorage({ [SONGS_KEY]: '{broken', [LEGACY_SONGS_KEY]: '[also broken' });
    expect(createLocalSongStore(storage, onError).load()).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });

  it('drops entries that are not songs and gives id-less songs an id', () => {
    const storage = memoryStorage({ [SONGS_KEY]: JSON.stringify([good, { nope: 1 }, { title: 'No Id', slides: ['y'] }]) });
    const songs = createLocalSongStore(storage).load();
    expect(songs).toHaveLength(2);
    expect(typeof songs[1].id).toBe('string');
    expect(songs[1].title).toBe('No Id');
  });

  it('reports a failing save (quota)', () => {
    const onError = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => createLocalSongStore(storage, onError).save([good])).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});

describe('local song store validation', () => {
  it('drops stored songs whose slides are not strings', () => {
    const storage = memoryStorage({ [SONGS_KEY]: JSON.stringify([good, { id: 'b', title: 'B', slides: [{ text: 'x' }] }]) });
    expect(createLocalSongStore(storage).load().map((s) => s.id)).toEqual(['a']);
  });
});
