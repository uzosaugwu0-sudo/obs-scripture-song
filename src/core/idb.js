const STORE = 'kv';

/** A tiny promise-based key-value store over IndexedDB. */
export function openKv(dbName, idb = globalThis.indexedDB) {
  let dbPromise = null;

  const open = () => {
    dbPromise ??= new Promise((resolve, reject) => {
      const request = idb.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  };

  const run = async (mode, op) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };

  return {
    get: (key) => run('readonly', (store) => store.get(key)),
    set: (key, value) => run('readwrite', (store) => store.put(value, key)),
    del: (key) => run('readwrite', (store) => store.delete(key)),
  };
}

/** Cache adapter whose methods never reject; failures are reported, not thrown. */
export function idbCache(kv, onError = () => {}) {
  return {
    async get(key) {
      try { return await kv.get(key); } catch (err) { onError(err); return undefined; }
    },
    async set(key, value) {
      try { await kv.set(key, value); } catch (err) { onError(err); }
    },
  };
}
