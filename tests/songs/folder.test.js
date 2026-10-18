import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createSongFolder, safeFilename, ensurePermission, saveHandle, loadHandle } from '../../src/songs/folder.js';
import { openKv } from '../../src/core/idb.js';
import { createFakeDir } from '../helpers/fake-dir.js';

const song = (id, title, slides = ['x']) => ({ id, title, altTitle: null, slides });

describe('safeFilename', () => {
  it('replaces unsafe characters and collapses whitespace', () => {
    expect(safeFilename('A/B: "x"?')).toBe('A_B_x');
    expect(safeFilename('  Amazing   Grace ')).toBe('Amazing_Grace');
    expect(safeFilename('')).toBe('untitled');
    expect(safeFilename('???')).toBe('song');
  });
});

describe('createSongFolder', () => {
  it('writes one JSON file per song and reads them back', async () => {
    const dir = createFakeDir();
    const folder = createSongFolder(dir);
    await folder.write(song('1', 'Amazing Grace', ['a', 'b']));
    expect([...dir.files.keys()]).toEqual(['Amazing_Grace.json']);
    expect(JSON.parse(dir.files.get('Amazing_Grace.json'))).toEqual(song('1', 'Amazing Grace', ['a', 'b']));

    const fresh = createSongFolder(dir);
    const { songs, errors } = await fresh.list();
    expect(songs).toEqual([song('1', 'Amazing Grace', ['a', 'b'])]);
    expect(errors).toEqual([]);
  });

  it('renames the file when the title changes, without leaving the old one behind', async () => {
    const dir = createFakeDir();
    const folder = createSongFolder(dir);
    await folder.write(song('1', 'Old Title'));
    await folder.write(song('1', 'New Title'));
    expect([...dir.files.keys()]).toEqual(['New_Title.json']);
  });

  it('never lets two songs share a file name (A/B vs A_B, case-insensitive)', async () => {
    const dir = createFakeDir();
    const folder = createSongFolder(dir);
    await folder.write(song('1', 'A/B'));
    await folder.write(song('2', 'A_B'));
    await folder.write(song('3', 'a_b'));
    expect([...dir.files.keys()].map((n) => n.toLowerCase()).sort()).toEqual(['a_b (2).json', 'a_b (3).json', 'a_b.json']);
    expect(JSON.parse(dir.files.get('A_B.json')).id).toBe('1');
  });

  it('reports files that are not songs and never overwrites them', async () => {
    const foreign = '{"version":1,"songs":[]}';
    const dir = createFakeDir({ 'Hymn.json': foreign, 'notes.json': 'not json at all' });
    const folder = createSongFolder(dir);
    const { songs, errors } = await folder.list();
    expect(songs).toEqual([]);
    expect(errors.map((e) => e.file).sort()).toEqual(['Hymn.json', 'notes.json']);

    await folder.write(song('1', 'Hymn'));
    expect(dir.files.get('Hymn.json')).toBe(foreign);
    expect(dir.files.has('Hymn (2).json')).toBe(true);
  });

  it('removes a song file and tolerates one that is already gone', async () => {
    const dir = createFakeDir();
    const folder = createSongFolder(dir);
    await folder.write(song('1', 'Gone'));
    await folder.remove('1');
    expect(dir.files.size).toBe(0);
    await expect(folder.remove('1')).resolves.toBeUndefined();
    await expect(folder.remove('unknown')).resolves.toBeUndefined();
  });

  it('writes lyrics.txt with all songs', async () => {
    const dir = createFakeDir();
    const folder = createSongFolder(dir);
    await folder.writeLyrics([song('1', 'One', ['la']), song('2', 'Two', ['do'])]);
    const text = dir.files.get('lyrics.txt');
    expect(text.startsWith('#OBS-LYRICS-V1')).toBe(true);
    expect(text).toContain('One');
    expect(text).toContain('Two');
  });

  it('does not treat lyrics.txt as a song file on listing', async () => {
    const dir = createFakeDir({ 'lyrics.txt': '#OBS-LYRICS-V1\n' });
    const { songs, errors } = await createSongFolder(dir).list();
    expect(songs).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('surfaces permission errors from writes', async () => {
    const dir = createFakeDir();
    const folder = createSongFolder(dir);
    dir.denied = true;
    await expect(folder.write(song('1', 'X'))).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});

describe('permission and handle persistence', () => {
  it('asks the browser for readwrite permission only when allowed to request', async () => {
    const calls = [];
    const handle = {
      queryPermission: async () => 'prompt',
      requestPermission: async () => { calls.push('request'); return 'granted'; },
    };
    expect(await ensurePermission(handle)).toBe(false);
    expect(calls).toEqual([]);
    expect(await ensurePermission(handle, { request: true })).toBe(true);
    expect(await ensurePermission({})).toBe(true);
  });

  it('stores and loads the directory handle', async () => {
    const kv = openKv('t-folder');
    const handle = { kind: 'directory', name: 'songs' };
    await saveHandle(kv, handle);
    expect(await loadHandle(kv)).toEqual(handle);
  });
});
