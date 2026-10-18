import { isSongRecord, toSongRecord } from './model.js';
import { buildLyricsFile, LYRICS_FILENAME } from './lyrics-file.js';

const HANDLE_KEY = 'library-dir';
const BACKSLASH  = String.fromCharCode(92);

export function safeFilename(title) {
  return (title || 'untitled')
    .replace(/[<>:"/|?*\x00-\x1f]/g, '_').split(BACKSLASH).join('_').replace(/\s+/g, '_')
    .replace(/_+/g, '_').slice(0, 80).replace(/^_+|_+$/g, '') || 'song';
}

/**
 * One JSON file per song in a user-chosen directory. createWritable() writes
 * to a swap file and only replaces the original on close(), so a crash
 * mid-write leaves the previous version intact; we abort() on failure.
 */
export function createSongFolder(dirHandle) {
  const fileOf   = new Map();   // song id to file name
  const occupied = new Set();   // lower-cased names of files that are not ours

  async function writeText(name, text) {
    const handle   = await dirHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (err) {
      try { await writable.abort(); } catch { /* stream already closed; surface the original error */ }
      throw err;
    }
  }

  async function removeFile(name) {
    try {
      await dirHandle.removeEntry(name);
    } catch (err) {
      if (err.name !== 'NotFoundError') throw err;
    }
  }

  function unusedName(base, id) {
    const taken = new Set(occupied);
    for (const [otherId, name] of fileOf) if (otherId !== id) taken.add(name.toLowerCase());
    let name = `${base}.json`;
    let n = 2;
    while (taken.has(name.toLowerCase())) { name = `${base} (${n}).json`; n += 1; }
    return name;
  }

  async function list() {
    const songs  = [];
    const errors = [];
    fileOf.clear();
    occupied.clear();
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
      try {
        const file = await entry.getFile();
        const data = JSON.parse(await file.text());
        if (!isSongRecord(data)) throw new Error('Not a song file');
        songs.push(toSongRecord(data));
        fileOf.set(data.id, entry.name);
      } catch (err) {
        occupied.add(entry.name.toLowerCase());
        errors.push({ file: entry.name, message: err.message });
      }
    }
    return { songs, errors };
  }

  async function write(song) {
    const record = toSongRecord(song);
    const previous = fileOf.get(record.id);
    const name = unusedName(safeFilename(record.title), record.id);
    await writeText(name, JSON.stringify(record, null, 2));
    fileOf.set(record.id, name);
    if (previous && previous !== name) await removeFile(previous);
  }

  async function remove(id) {
    const name = fileOf.get(id);
    if (!name) return;
    await removeFile(name);
    fileOf.delete(id);
  }

  async function writeLyrics(songs) {
    await writeText(LYRICS_FILENAME, buildLyricsFile(songs));
  }

  return { name: dirHandle.name, list, write, remove, writeLyrics };
}

export async function ensurePermission(handle, { request = false } = {}) {
  if (typeof handle.queryPermission !== 'function') return true;
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  if (!request || typeof handle.requestPermission !== 'function') return false;
  return (await handle.requestPermission(options)) === 'granted';
}

export const saveHandle = (kv, handle) => kv.set(HANDLE_KEY, handle);
export const loadHandle = (kv) => kv.get(HANDLE_KEY);
