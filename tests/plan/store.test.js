import { describe, it, expect } from 'vitest';
import { createPlanStore } from '../../src/plan/store.js';
import { createLocalPlanStore, PLANS_KEY } from '../../src/plan/local-store.js';
import { PLANS_DIR } from '../../src/plan/folder.js';
import { createFakeDir } from '../helpers/fake-dir.js';
import { memoryStorage } from '../helpers/memory-storage.js';

const counter = () => { let n = 0; return () => 'u' + (n += 1); };
const plan = (id, name, items = []) => ({ v: 1, id, name, items });
const item = { id: 'i_1', type: 'song', songId: 's1' };

function setup(opts = {}) {
  const storage = memoryStorage();
  const errors = [];
  const store = createPlanStore({
    local: createLocalPlanStore(storage), onError: (e) => errors.push(e), uid: counter(), ...opts,
  });
  return { store, storage, errors };
}
const plansDir = (dir) => dir.subdirs.get(PLANS_DIR);

describe('plan store without a folder', () => {
  it('saves, lists and gets plans and mirrors them to local storage', async () => {
    const { store, storage } = setup();
    await store.save(plan('p1', 'Sunday', [item]));
    expect(store.get('p1').name).toBe('Sunday');
    expect(store.get('nope')).toBeNull();
    expect(storage.map.get(PLANS_KEY)).toContain('Sunday');
    const again = createPlanStore({ local: createLocalPlanStore(storage) });
    expect(again.list().map((p) => p.id)).toEqual(['p1']);
  });

  it('numbers a second plan with the same name but keeps a plan\'s own name on re-save', async () => {
    const { store } = setup();
    await store.save(plan('p1', 'Sunday'));
    const second = await store.save(plan('p2', 'Sunday'));
    expect(second.name).toBe('Sunday (2)');
    expect((await store.save(plan('p1', 'Sunday', [item]))).name).toBe('Sunday');
  });

  it('removes a plan', async () => {
    const { store } = setup();
    await store.save(plan('p1', 'A'));
    await store.remove('p1');
    expect(store.list()).toEqual([]);
  });

  it('duplicates a plan with fresh ids and a copy name, or returns null for an unknown id', async () => {
    const { store } = setup();
    await store.save(plan('p1', 'Sunday', [item]));
    const copy = await store.duplicate('p1');
    expect(copy.name).toBe('Sunday (copy)');
    expect(copy.id).not.toBe('p1');
    expect(copy.items[0].id).not.toBe('i_1');
    expect(copy.items[0].songId).toBe('s1');
    expect(store.list()).toHaveLength(2);
    expect(await store.duplicate('nope')).toBeNull();
  });

  it('remembers the last used plan id', () => {
    const { store } = setup();
    expect(store.lastId()).toBeNull();
    store.setLastId('p1');
    expect(store.lastId()).toBe('p1');
  });
});

describe('plan store with a folder', () => {
  it('writes plans to plans/ with a safe file name and keeps the real name inside', async () => {
    const { store } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    await store.save(plan('p1', 'Sun 10/26: AM', [item]));
    expect([...plansDir(dir).files.keys()]).toEqual(['Sun_10_26_AM.json']);
    expect(JSON.parse(plansDir(dir).files.get('Sun_10_26_AM.json')).name).toBe('Sun 10/26: AM');
    await store.remove('p1');
    expect(plansDir(dir).files.size).toBe(0);
  });

  it('on attach loads folder plans, carries local-only plans in, and lists unreadable files untouched', async () => {
    const { store } = setup();
    await store.save(plan('p1', 'Sunday', [item]));
    const dir = createFakeDir();
    const sub = await dir.getDirectoryHandle(PLANS_DIR, { create: true });
    sub.files.set('Easter.json', JSON.stringify(plan('p2', 'Easter')));
    sub.files.set('bad.json', 'not json');
    const result = await store.attach(dir);
    expect(store.list().map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(result).toMatchObject({ loaded: 1, carried: 1 });
    expect(store.unreadable().map((e) => e.file)).toEqual(['bad.json']);
    expect(sub.files.has('Sunday.json')).toBe(true);
    expect(sub.files.get('bad.json')).toBe('not json');
  });

  it('keeps edits made while the folder was not writable, and they win on reconnect', async () => {
    let connected = true;
    const { store } = setup({ canWrite: () => connected });
    const dir = createFakeDir();
    await store.attach(dir);
    await store.save(plan('p1', 'Sunday', [item]));
    connected = false;
    await store.save(plan('p1', 'Sunday', [item, { id: 'i_2', type: 'song', songId: 's2' }]));
    expect(JSON.parse(plansDir(dir).files.get('Sunday.json')).items).toHaveLength(1);
    connected = true;
    await store.attach(dir);
    expect(store.get('p1').items).toHaveLength(2);
    expect(JSON.parse(plansDir(dir).files.get('Sunday.json')).items).toHaveLength(2);
  });

  it('does not throw when a write is denied, keeps the plan, and writes it after reconnect', async () => {
    const { store, storage, errors } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    plansDir(dir).denied = true;
    await expect(store.save(plan('p1', 'Sunday', [item]))).resolves.toMatchObject({ id: 'p1' });
    expect(errors).toHaveLength(1);
    expect(store.get('p1')).not.toBeNull();
    expect(storage.map.get(PLANS_KEY)).toContain('Sunday');
    plansDir(dir).denied = false;
    await store.attach(dir);
    expect(plansDir(dir).files.has('Sunday.json')).toBe(true);
  });

  it('remembers edits made while the folder was unavailable, even across a restart', async () => {
    const storage = memoryStorage();
    const open = () => createPlanStore({ local: createLocalPlanStore(storage), uid: counter() });
    const dir = createFakeDir();
    const first = open();
    await first.attach(dir);
    await first.save(plan('p1', 'Sunday', [item]));
    const offline = open();
    await offline.save(plan('p1', 'Sunday', [item, { id: 'i_2', type: 'song', songId: 's2' }]));
    const restarted = open();
    await restarted.attach(dir);
    expect(restarted.get('p1').items).toHaveLength(2);
    expect(JSON.parse(plansDir(dir).files.get('Sunday.json')).items).toHaveLength(2);
  });

  it('detach stops writing to the folder but keeps the plans', async () => {
    const { store } = setup();
    const dir = createFakeDir();
    await store.attach(dir);
    store.detach();
    await store.save(plan('p1', 'Later', [item]));
    expect(plansDir(dir).files.size).toBe(0);
    expect(store.get('p1')).not.toBeNull();
    expect(store.unreadable()).toEqual([]);
  });
});
