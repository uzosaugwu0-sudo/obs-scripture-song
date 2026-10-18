import { describe, it, expect, vi } from 'vitest';
import { createScriptureApi, memoryCache, MAX_RANGE_VERSES } from '../../src/scripture/api.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function setup({ fetchImpl, offline = null } = {}) {
  const fetchSpy = vi.fn(fetchImpl || (async () => json({ text: 'In the <S>1</S>beginning' })));
  const api = createScriptureApi({ fetchImpl: fetchSpy, cache: memoryCache(), offline });
  return { api, fetchSpy };
}

describe('fetchVerse', () => {
  it('returns display text and a labelled reference from the network', async () => {
    const { api, fetchSpy } = setup();
    const r = await api.fetchVerse('Gen 1:1', 'KJV');
    expect(r).toMatchObject({ text: 'In the beginning', reference: 'Genesis 1:1 — KJV', rawRef: 'Genesis 1:1', bookId: 1, chapter: 1, verse: 1 });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://bolls.life/get-verse/KJV/1/1/1/');
  });

  it('joins a range and refuses ranges over the cap', async () => {
    const { api } = setup();
    const r = await api.fetchVerse('John 3:16-17', 'KJV');
    expect(r.text).toBe('In the beginning In the beginning');
    expect(r.endVerse).toBe(17);
    const tooBig = await api.fetchVerse(`John 3:1-${MAX_RANGE_VERSES + 1}`, 'KJV');
    expect(tooBig.error).toMatch(/Show at most 20/);
  });

  it('reports bad input with the old messages', async () => {
    const { api } = setup();
    expect((await api.fetchVerse('', 'KJV')).error).toBe('Enter a verse reference first.');
    expect((await api.fetchVerse('???', 'KJV')).error).toBe('Could not read that reference. Try "John 3:16".');
    expect((await api.fetchVerse('Hezekiah 1:1', 'KJV')).error).toBe('No book called "Hezekiah".');
    expect((await api.fetchVerse('John 99:1', 'KJV')).error).toBe('John has 21 chapters.');
  });

  it('maps 404, other statuses, timeouts and network failures', async () => {
    expect((await setup({ fetchImpl: async () => json({}, 404) }).api.fetchVerse('John 3:99', 'KJV')).error).toMatch(/not found in KJV/);
    expect((await setup({ fetchImpl: async () => json({}, 500) }).api.fetchVerse('John 3:16', 'KJV')).error).toBe('Lookup failed (500). Try again.');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect((await setup({ fetchImpl: async () => { throw abort; } }).api.fetchVerse('John 3:16', 'KJV')).error).toMatch(/Timed out after 10s/);
    expect((await setup({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).api.fetchVerse('John 3:16', 'KJV')).error).toMatch(/No connection/);
  });

  it('serves bundled translations without touching the network', async () => {
    const offline = { getChapter: async (id, book, chapter) => (id === 'KJV' && book === 43 && chapter === 3 ? { 16: 'For God so loved the world' } : null) };
    const { api, fetchSpy } = setup({ offline });
    const r = await api.fetchVerse('John 3:16', 'KJV');
    expect(r.text).toBe('For God so loved the world');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports not-found for a verse missing from a bundled chapter instead of going online', async () => {
    const offline = { getChapter: async () => ({ 1: 'only verse' }) };
    const { api, fetchSpy } = setup({ offline });
    expect((await api.fetchVerse('John 3:5', 'KJV')).error).toMatch(/not found in KJV/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caches network verses so they work offline afterwards', async () => {
    let online = true;
    const { api } = setup({ fetchImpl: async () => { if (!online) throw new TypeError('offline'); return json({ text: 'cached text' }); } });
    expect((await api.fetchVerse('John 3:16', 'NIV')).text).toBe('cached text');
    online = false;
    expect((await api.fetchVerse('John 3:16', 'NIV')).text).toBe('cached text');
    expect((await api.fetchVerse('John 3:17', 'NIV')).error).toMatch(/No connection/);
  });
});

describe('fetchVerseCount', () => {
  it('counts from the network, caches, and returns 0 on failure', async () => {
    const { api, fetchSpy } = setup({ fetchImpl: async () => json([{}, {}, {}]) });
    expect(await api.fetchVerseCount('NIV', 43, 3)).toBe(3);
    expect(await api.fetchVerseCount('NIV', 43, 3)).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await setup({ fetchImpl: async () => { throw new Error('x'); } }).api.fetchVerseCount('NIV', 1, 1)).toBe(0);
  });

  it('reads the highest verse number from a bundled chapter', async () => {
    const offline = { getChapter: async () => ({ 1: 'a', 2: 'b', 5: 'e' }) };
    expect(await setup({ offline }).api.fetchVerseCount('KJV', 1, 1)).toBe(5);
  });
});

describe('searchScripture', () => {
  it('asks for a query, maps results and caches', async () => {
    const results = [{ book: 43, chapter: 3, verse: 16, text: 'For God so loved' }];
    const { api, fetchSpy } = setup({ fetchImpl: async () => json(results) });
    expect((await api.searchScripture('KJV', '  ')).error).toBe('Enter something to search for.');
    const first = await api.searchScripture('KJV', 'loved');
    expect(first[0]).toMatchObject({ bookId: 43, book: 'John', chapter: 3, verse: 16, text: 'For God so loved' });
    await api.searchScripture('KJV', 'LOVED');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable search', async () => {
    const { api } = setup({ fetchImpl: async () => json({}, 500) });
    expect((await api.searchScripture('KJV', 'x')).error).toBe('Search is unavailable right now.');
  });
});

describe('randomReference', () => {
  it('picks a reference inside the requested scope, offline included', async () => {
    const offline = { getChapter: async () => ({ 1: 'a', 2: 'b', 3: 'c' }) };
    const { api } = setup({ offline });
    for (let i = 0; i < 20; i += 1) {
      const r = await api.randomReference('KJV', 'wisdom');
      expect(r.reference).toMatch(/^(Psalms|Proverbs) \d+:[123]$/);
    }
  });
  it('gives up with a message when counts cannot be read', async () => {
    const { api } = setup({ fetchImpl: async () => { throw new TypeError('offline'); } });
    expect((await api.randomReference('NIV', 'all')).error).toBe('Could not pick a random verse. Check the connection.');
  });
});
