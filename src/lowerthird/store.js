import { isValidLowerThird } from '../plan/extras.js';
import { writeFileAtomic } from '../core/record-folder.js';

export const LIBRARY_FILE = 'lowerthirds.json';
export const ITEMS_KEY = 'obs-stage-lowerthirds';
export const DIRTY_KEY = 'obs-stage-lowerthirds-dirty';

const isRecord = (x) => x && typeof x === 'object' && typeof x.id === 'string';

/** The saved lower thirds kept in the browser: the list when no folder is chosen, and a safety copy beside the folder. */
export function createLocalLowerThirdStore(storage, onError = () => {}) {
  function load() {
    try {
      const raw = storage?.getItem(ITEMS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch (err) {
      onError(err);
      return [];
    }
  }

  function save(items) {
    try { storage?.setItem(ITEMS_KEY, JSON.stringify(items)); } catch (err) { onError(err); }
  }

  /** True while the browser copy holds edits the folder file has not seen; they win after a restart. */
  function loadDirty() {
    try { return storage?.getItem(DIRTY_KEY) === '1'; } catch (err) { onError(err); return false; }
  }

  function saveDirty(dirty) {
    try { storage?.setItem(DIRTY_KEY, dirty ? '1' : '0'); } catch (err) { onError(err); }
  }

  return { load, save, loadDirty, saveDirty };
}

async function readLibraryFile(dirHandle) {
  let text;
  try {
    const handle = await dirHandle.getFileHandle(LIBRARY_FILE);
    text = await (await handle.getFile()).text();
  } catch (err) {
    if (err.name === 'NotFoundError') return null;
    throw err;
  }
  const data = JSON.parse(text);
  if (!Array.isArray(data?.items)) throw new Error(LIBRARY_FILE + ' is not a lower third list');
  return data.items.filter(isRecord);
}

/**
 * The saved lower thirds, independent of any plan. Items that are not valid lower thirds are kept
 * in storage untouched (list() hides them). Every change goes to lowerthirds.json in the library
 * folder when it is connected and writable, and always to the browser copy; a failed or skipped
 * folder write marks the copy dirty so it wins over the folder file when the folder is attached again.
 */
export function createLowerThirdStore({ local, onError = () => {}, canWrite = () => true }) {
  let items = local.load();
  let folder = null;
  let blocked = false;   // the folder file exists but could not be read: never overwrite it

  async function persist() {
    let dirty = true;
    if (folder && canWrite() && !blocked) {
      try {
        await writeFileAtomic(folder, LIBRARY_FILE, JSON.stringify({ v: 1, items }, null, 2));
        dirty = false;
      } catch (err) {
        onError(err);
      }
    }
    local.save(items);
    local.saveDirty(dirty);
  }

  const get = (id) => items.find((i) => i.id === id && isValidLowerThird(i)) || null;

  async function save(item) {
    items = items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
    await persist();
  }

  async function remove(id) {
    if (!items.some((i) => i.id === id)) return;
    items = items.filter((i) => i.id !== id);
    await persist();
  }

  /** The folder file is truth, except for edits made while the folder could not be written, and items only kept in the browser. */
  async function attach(dirHandle) {
    let fromFolder = null;
    blocked = false;
    try {
      fromFolder = await readLibraryFile(dirHandle);
    } catch (err) {
      blocked = true;
      onError(err);
    }
    folder = dirHandle;
    if (fromFolder) {
      const edited = local.loadDirty() ? new Map(items.map((i) => [i.id, i])) : new Map();
      const inFolder = new Set(fromFolder.map((i) => i.id));
      items = [...fromFolder.map((i) => edited.get(i.id) || i), ...items.filter((i) => !inFolder.has(i.id))];
    }
    await persist();
  }

  function detach() {
    folder = null;
    blocked = false;
    local.save(items);
  }

  return { list: () => items.filter(isValidLowerThird), get, save, remove, attach, detach };
}
