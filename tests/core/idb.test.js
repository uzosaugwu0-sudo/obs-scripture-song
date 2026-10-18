import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { openKv, idbCache } from '../../src/core/idb.js';

describe('openKv', () => {
  it('stores, reads and deletes values', async () => {
    const kv = openKv('t-kv');
    await kv.set('a', { n: 1 });
    expect(await kv.get('a')).toEqual({ n: 1 });
    await kv.del('a');
    expect(await kv.get('a')).toBeUndefined();
  });
});

describe('idbCache', () => {
  it('never rejects: failures go to onError and reads give undefined', async () => {
    const onError = vi.fn();
    const broken = { get: async () => { throw new Error('boom'); }, set: async () => { throw new Error('boom'); } };
    const cache = idbCache(broken, onError);
    expect(await cache.get('k')).toBeUndefined();
    await expect(cache.set('k', 1)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
