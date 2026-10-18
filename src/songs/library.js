import { normalizeTitle, toSongRecord, uid as defaultUid } from './model.js';

/**
 * The song library the dock talks to. Songs live in memory as immutable
 * records; every change is written to the chosen folder (plus lyrics.txt) or,
 * without a folder, to localStorage. If the folder write fails the data is
 * kept and mode becomes folder-lost until the operator reconnects.
 */
export function createLibrary({ local, onModeChange = () => {}, onError = () => {}, uid = defaultUid }) {
  let songs  = local.load();
  let folder = null;
  let mode   = 'local';   // 'local' | 'folder' | 'folder-lost'
  let lyricsChain = Promise.resolve();

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    onModeChange(mode);
  }

  function queueLyrics() {
    const run = lyricsChain.then(() => folder.writeLyrics(songs));
    lyricsChain = run.catch(() => {});   // keep the chain alive; the caller sees the error through run
    return run;
  }

  async function persist({ write = [], remove = [] } = {}) {
    if (mode !== 'folder') { local.save(songs); return; }
    try {
      for (const song of write) await folder.write(song);
      for (const id of remove) await folder.remove(id);
      await queueLyrics();
    } catch (err) {
      onError(err);
      local.save(songs);          // nothing is lost: memory and the browser copy both have it
      setMode('folder-lost');
    }
  }

  const get = (id) => songs.find((s) => s.id === id) || null;

  async function save(input) {
    const id = input.id || uid();
    const song = toSongRecord({
      id,
      title: (input.title || '').trim() || 'Untitled',
      altTitle: input.altTitle ?? null,
      slides: input.slides || [],
    });
    songs = songs.some((s) => s.id === id)
      ? songs.map((s) => (s.id === id ? song : s))
      : [...songs, song];
    await persist({ write: [song] });
    return song;
  }

  async function removeMany(ids) {
    const gone = new Set(ids);
    const existing = songs.filter((s) => gone.has(s.id)).map((s) => s.id);
    if (!existing.length) return;
    songs = songs.filter((s) => !gone.has(s.id));
    await persist({ remove: existing });
  }

  const remove   = (id) => removeMany([id]);
  const clearAll = () => removeMany(songs.map((s) => s.id));

  async function upsertByTitle(incoming) {
    let added = 0;
    let replaced = 0;
    const written = [];
    let next = songs;
    for (const item of incoming) {
      const key = normalizeTitle(item.title);
      const idx = next.findIndex((s) => normalizeTitle(s.title) === key);
      if (idx !== -1) {
        const updated = toSongRecord({ ...next[idx], altTitle: item.altTitle ?? null, slides: item.slides });
        next = next.map((s, i) => (i === idx ? updated : s));
        written.push(updated);
        replaced += 1;
      } else {
        const created = toSongRecord({ id: uid(), title: item.title, altTitle: item.altTitle || null, slides: item.slides });
        next = [...next, created];
        written.push(created);
        added += 1;
      }
    }
    songs = next;
    await persist({ write: written });
    return { added, replaced };
  }

  /** Folder is truth; songs only in memory are carried into it. Used for first attach and Reconnect. */
  async function attachFolder(newFolder) {
    const { songs: found, errors } = await newFolder.list();
    const titles = new Set(found.map((s) => normalizeTitle(s.title)));
    const ids    = new Set(found.map((s) => s.id));
    const carried = songs.filter((s) => !titles.has(normalizeTitle(s.title)) && !ids.has(s.id));
    folder = newFolder;
    songs  = [...found, ...carried];
    setMode('folder');
    await persist({ write: carried });
    return { loaded: found.length, carried: carried.length, errors };
  }

  function markLost() { setMode('folder-lost'); }

  function detach() {
    folder = null;
    local.save(songs);
    setMode('local');
  }

  async function rewriteLyrics() {
    if (mode !== 'folder') return;
    await persist();
  }

  return {
    list: () => songs, get, mode: () => mode,
    save, remove, removeMany, clearAll, upsertByTitle,
    attachFolder, markLost, detach, rewriteLyrics,
  };
}
