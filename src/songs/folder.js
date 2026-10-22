import { isSongRecord, toSongRecord } from './model.js';
import { buildLyricsFile, LYRICS_FILENAME } from './lyrics-file.js';
import { createRecordFolder, safeFilename } from '../core/record-folder.js';

const HANDLE_KEY = 'library-dir';

export { safeFilename };

/** One JSON file per song in a user-chosen directory, plus lyrics.txt. */
export function createSongFolder(dirHandle) {
  const base = createRecordFolder(dirHandle, { isRecord: isSongRecord, toRecord: toSongRecord, nameOf: (s) => s.title, label: 'song' });
  return {
    name: base.name,
    async list() {
      const { records, errors } = await base.list();
      return { songs: records, errors };
    },
    write: base.write,
    remove: base.remove,
    writeLyrics: (songs) => base.writeText(LYRICS_FILENAME, buildLyricsFile(songs)),
  };
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
