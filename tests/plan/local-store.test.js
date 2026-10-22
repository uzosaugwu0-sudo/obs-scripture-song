import { describe, it, expect } from 'vitest';
import { createLocalPlanStore, PLANS_KEY, LAST_PLAN_KEY } from '../../src/plan/local-store.js';
import { memoryStorage } from '../helpers/memory-storage.js';


const plan = (id, name) => ({ v: 1, id, name, items: [{ id: 'i1', type: 'song', songId: 's' }] });

describe('createLocalPlanStore', () => {
  it('round-trips plans', () => {
    const storage = memoryStorage();
    const local = createLocalPlanStore(storage);
    expect(local.load()).toEqual([]);
    local.save([plan('p1', 'Sunday')]);
    expect(createLocalPlanStore(storage).load()).toEqual([plan('p1', 'Sunday')]);
  });

  it('drops entries that are not plans and survives corrupt JSON', () => {
    const errors = [];
    const mixed = memoryStorage({ [PLANS_KEY]: JSON.stringify([plan('p1', 'A'), { foo: 1 }, 'x']) });
    expect(createLocalPlanStore(mixed).load()).toEqual([plan('p1', 'A')]);
    const corrupt = memoryStorage({ [PLANS_KEY]: '{{' });
    expect(createLocalPlanStore(corrupt, (e) => errors.push(e)).load()).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('stores the last plan id and clears it with null', () => {
    const storage = memoryStorage();
    const local = createLocalPlanStore(storage);
    expect(local.loadLastId()).toBeNull();
    local.saveLastId('p1');
    expect(storage.map.get(LAST_PLAN_KEY)).toBe('p1');
    expect(local.loadLastId()).toBe('p1');
    local.saveLastId(null);
    expect(local.loadLastId()).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    const errors = [];
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    const local = createLocalPlanStore(broken, (e) => errors.push(e));
    expect(local.load()).toEqual([]);
    expect(() => local.save([plan('p1', 'A')])).not.toThrow();
    expect(local.loadLastId()).toBeNull();
    expect(() => local.saveLastId('p1')).not.toThrow();
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
