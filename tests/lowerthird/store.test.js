import { describe, it, expect, vi } from 'vitest';
import { createLowerThirdStore, createLocalLowerThirdStore, sameWordsId, LIBRARY_FILE, ITEMS_KEY, DIRTY_KEY } from '../../src/lowerthird/store.js';
import { memoryStorage } from '../helpers/memory-storage.js';
import { createFakeDir } from '../helpers/fake-dir.js';

const lt = (id, name, extra = {}) => ({ id, type: 'lowerthird', name, info: '', align: 'left', logo: null, logoData: null, hideAfter: null, ...extra });

function setup(opts = {}) {
  const storage = memoryStorage();
  const errors = [];
  const store = createLowerThirdStore({ local: createLocalLowerThirdStore(storage), onError: (e) => errors.push(e), ...opts });
  return { store, storage, errors };
}
const fileOf = (dir) => JSON.parse(dir.files.get(LIBRARY_FILE));

describe('the saved list', () => {
  it('saves new items in order, replaces one in place by id, and removes', async () => {
    const { store } = setup();
    await store.save(lt('a', 'Pastor John'));
    await store.save(lt('b', 'Sister Mary'));
    await store.save(lt('a', 'Pastor Johnny'));
    expect(store.list().map((i) => i.name)).toEqual(['Pastor Johnny', 'Sister Mary']);
    expect(store.get('b').name).toBe('Sister Mary');
    expect(store.get('zz')).toBeNull();
    await store.remove('a');
    expect(store.list().map((i) => i.id)).toEqual(['b']);
    await store.remove('nope');
    expect(store.list()).toHaveLength(1);
  });

  it('only lists valid lower thirds, but keeps the others untouched when saving', async () => {
    const storage = memoryStorage({ [ITEMS_KEY]: JSON.stringify([lt('ok', 'Fine'), { id: 'bad', type: 'lowerthird', name: '', info: '' }, { id: 'odd', type: 'timer' }]) });
    const store = createLowerThirdStore({ local: createLocalLowerThirdStore(storage) });
    expect(store.list().map((i) => i.id)).toEqual(['ok']);
    await store.save(lt('new', 'Added'));
    const stored = JSON.parse(storage.map.get(ITEMS_KEY));
    expect(stored.map((i) => i.id)).toEqual(['ok', 'bad', 'odd', 'new']);
  });

  it('mirrors every change to the browser and a new store reads it back', async () => {
    const { store, storage } = setup();
    await store.save(lt('a', 'Pastor John'));
    const again = createLowerThirdStore({ local: createLocalLowerThirdStore(storage) });
    expect(again.list().map((i) => i.name)).toEqual(['Pastor John']);
  });
});

describe('saving one that is already saved', () => {
  it('finds the saved item with the same name and info, ignoring case and spacing', () => {
    const list = [lt('a', 'Pastor John', { info: 'Guest speaker' }), lt('b', 'Mary')];
    expect(sameWordsId(list, lt('x', ' pastor john ', { info: 'guest  speaker' }))).toBe('a');
    expect(sameWordsId(list, lt('x', 'Mary'))).toBe('b');
    expect(sameWordsId(list, lt('x', 'Pastor John'))).toBeNull();
  });
});

describe('the local mirror', () => {
  it('survives corrupt data and storage that throws', () => {
    const errors = [];
    expect(createLocalLowerThirdStore(memoryStorage({ [ITEMS_KEY]: '{{' }), (e) => errors.push(e)).load()).toEqual([]);
    expect(createLocalLowerThirdStore(memoryStorage({ [ITEMS_KEY]: '{"a":1}' })).load()).toEqual([]);
    expect(errors).toHaveLength(1);
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    const local = createLocalLowerThirdStore(broken, (e) => errors.push(e));
    expect(local.load()).toEqual([]);
    expect(() => local.save([lt('a', 'x')])).not.toThrow();
    expect(local.loadDirty()).toEqual([]);
    expect(() => local.saveDirty(['a'])).not.toThrow();
  });

  it('remembers which items the folder has not seen', () => {
    const storage = memoryStorage();
    const local = createLocalLowerThirdStore(storage);
    expect(local.loadDirty()).toEqual([]);
    local.saveDirty(['a']);
    expect(createLocalLowerThirdStore(storage).loadDirty()).toEqual(['a']);
    local.saveDirty([]);
    expect(storage.map.get(DIRTY_KEY)).toBe('[]');
  });
});

describe('with a library folder', () => {
  it('writes lowerthirds.json on every change', async () => {
    const { store } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    await store.save(lt('a', 'Pastor John'));
    expect(fileOf(dir)).toEqual({ v: 1, items: [lt('a', 'Pastor John')] });
    await store.remove('a');
    expect(fileOf(dir).items).toEqual([]);
  });

  it('reads the folder file on attach when there are no unsaved local edits', async () => {
    const { store } = setup();
    const dir = createFakeDir({ [LIBRARY_FILE]: JSON.stringify({ v: 1, items: [lt('f', 'From folder')] }) });
    await store.attach(dir);
    expect(store.list().map((i) => i.name)).toEqual(['From folder']);
  });

  it('carries local-only items into the folder file', async () => {
    const { store } = setup();
    await store.save(lt('local', 'Made before the folder'));
    const dir = createFakeDir({ [LIBRARY_FILE]: JSON.stringify({ v: 1, items: [lt('f', 'From folder')] }) });
    await store.attach(dir);
    expect(store.list().map((i) => i.id)).toEqual(['f', 'local']);
    expect(fileOf(dir).items.map((i) => i.id)).toEqual(['f', 'local']);
  });

  it('writes the local list when the folder has no file yet', async () => {
    const { store } = setup();
    await store.save(lt('a', 'Pastor John'));
    const dir = createFakeDir();
    await store.attach(dir);
    expect(fileOf(dir).items.map((i) => i.id)).toEqual(['a']);
  });

  it('edits made while the folder was not writable win over the folder copy after a restart', async () => {
    const storage = memoryStorage();
    const open = (canWrite) => createLowerThirdStore({ local: createLocalLowerThirdStore(storage), canWrite });
    const dir = createFakeDir();
    const first = open(() => true);
    await first.attach(dir);
    await first.save(lt('a', 'Original'));
    const offline = open(() => false);
    await offline.attach(dir);
    await offline.save(lt('a', 'Edited offline'));
    expect(fileOf(dir).items[0].name).toBe('Original');
    const restarted = open(() => true);
    await restarted.attach(dir);
    expect(restarted.list()[0].name).toBe('Edited offline');
    expect(fileOf(dir).items[0].name).toBe('Edited offline');
    expect(createLocalLowerThirdStore(storage).loadDirty()).toEqual([]);
  });

  it('only the items edited while the folder was unavailable beat the folder copy', async () => {
    const { store } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    await store.save(lt('a', 'A'));
    await store.save(lt('b', 'B'));
    store.detach();
    await store.save(lt('a', 'A edited here'));
    dir.files.set(LIBRARY_FILE, JSON.stringify({ v: 1, items: [lt('a', 'A'), lt('b', 'B edited elsewhere')] }));
    await store.attach(dir);
    expect(store.list().map((i) => i.name)).toEqual(['A edited here', 'B edited elsewhere']);
  });

  it('keeps the item and reports the error when the write fails, then writes it after reconnecting', async () => {
    const { store, errors } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    dir.denied = true;
    await expect(store.save(lt('a', 'Pastor John'))).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(store.list()).toHaveLength(1);
    dir.denied = false;
    await store.attach(dir);
    expect(fileOf(dir).items.map((i) => i.id)).toEqual(['a']);
  });

  it('never overwrites a folder file it cannot read', async () => {
    const unreadable = [];
    const { store, errors } = setup({ onUnreadable: (e) => unreadable.push(e) });
    const dir = createFakeDir({ [LIBRARY_FILE]: 'not json at all' });
    await store.attach(dir);
    await store.save(lt('a', 'Pastor John'));
    expect(dir.files.get(LIBRARY_FILE)).toBe('not json at all');
    expect(unreadable).toHaveLength(1);
    expect(errors).toEqual([]);   // a bad file is reported, but is not a write failure
    expect(store.list()).toHaveLength(1);
  });

  it('stops writing to the folder after detach but keeps the items', async () => {
    const { store } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    store.detach();
    await store.save(lt('a', 'Later'));
    expect(fileOf(dir).items).toEqual([]);
    expect(store.list()).toHaveLength(1);
  });
});