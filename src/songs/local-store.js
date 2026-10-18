import { looksLikeSong, toSongRecord, uid } from './model.js';

export const SONGS_KEY        = 'obs-stage-songs';
export const LEGACY_SONGS_KEY = 'obs-lyric-songs';

/**
 * Songs kept in the browser localStorage: the library when no folder is
 * chosen, and a safety copy if the folder is lost. The previous standalone
 * lyric plugin key is imported once and left in place.
 */
export function createLocalSongStore(storage, onError = () => {}) {
  function read(key) {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed
        .filter(looksLikeSong)
        .map((s) => toSongRecord({ ...s, id: typeof s.id === 'string' ? s.id : uid() }));
    } catch (err) {
      onError(err);
      return null;
    }
  }

  function save(songs) {
    try {
      storage?.setItem(SONGS_KEY, JSON.stringify(songs));
    } catch (err) {
      onError(err);
    }
  }

  function load() {
    const own = read(SONGS_KEY);
    if (own) return own;
    const legacy = read(LEGACY_SONGS_KEY);
    if (legacy && legacy.length) { save(legacy); return legacy; }
    return [];
  }

  return { load, save };
}
