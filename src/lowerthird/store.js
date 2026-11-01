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

  /** Ids of items edited while the folder could not be written; they win over the folder copy after a restart. */
  function loadDirty() {
    try {
      const parsed = JSON.parse(storage?.getItem(DIRTY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch (err) {
      onError(err);
      return [];
    }
  }

  function saveDirty(ids) {
    try { storage?.setItem(DIRTY_KEY, JSON.stringify(ids)); } catch (err) { onError(err); }
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
 * folder write marks that item dirty so it wins over the folder file when the folder is attached again.
 * onError is for failed writes; onUnreadable is for a folder file that cannot be read (not a lost folder).
 */
export function createLowerThirdStore({ local, onError = () => {}, onUnreadable = onError, canWrite = () => true }) {
  let items = local.load();
  const dirty = new Set(local.loadDirty());
  let folder = null;
  let blocked = false;   // the folder file exists but could not be read: never overwrite it

  async function persist(changedId = null) {
    if (changedId) dirty.add(changedId);
    if (folder && canWrite() && !blocked) {
      try {
        await writeFileAtomic(folder, LIBRARY_FILE, JSON.stringify({ v: 1, items }, null, 2));
        dirty.clear();
      } catch (err) {
        onError(err);
      }
    }
    local.save(items);
    local.saveDirty([...dirty]);
  }

  const get = (id) => items.find((i) => i.id === id && isValidLowerThird(i)) || null;

  async function save(item) {
    items = items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
    await persist(item.id);
  }

  async function remove(id) {
    if (!items.some((i) => i.id === id)) return;
    items = items.filter((i) => i.id !== id);
    dirty.delete(id);
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
      onUnreadable(err);
    }
    folder = dirHandle;
    if (fromFolder) {
      const edited = new Map(items.filter((i) => dirty.has(i.id)).map((i) => [i.id, i]));
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
