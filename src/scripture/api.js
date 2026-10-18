import { BIBLE_BOOKS, OT_END, GOSPEL_IDS, WISDOM_IDS, bookIndexOf } from './books.js';
import { translationById } from './translations.js';
import { parseReference, buildReference, buildDisplayText } from './reference.js';

export const MAX_RANGE_VERSES = 20;
const FETCH_TIMEOUT_MS = 10000;
const SEARCH_LIMIT = 50;
const RANDOM_ATTEMPTS = 5;

export function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.get(key); },
    async set(key, value) { map.set(key, value); },
  };
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

/**
 * Scripture lookups. Per verse the order is: bundled offline translation,
 * then the persistent cache, then the network (whose answer is cached).
 */
export function createScriptureApi({
  fetchImpl = (...args) => fetch(...args),
  cache = memoryCache(),
  offline = null,
  apiBase = 'https://bolls.life',
  timeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  const searchCache = new Map();

  // Hard timeout so the OBS browser can never hang the dock waiting on a
  // request that will not come back.
  async function fetchWithTimeout(url) {
    const ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      return await fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function offlineChapter(tr, bookId, chapter) {
    if (!offline) return null;
    try { return await offline.getChapter(tr.id, bookId, chapter); } catch { return null; }
  }

  /** Resolves to { text } or { status } */
  async function getVerse(tr, bookId, chapter, verse) {
    const bundled = await offlineChapter(tr, bookId, chapter);
    if (bundled) {
      return typeof bundled[verse] === 'string' ? { text: bundled[verse] } : { status: 404 };
    }
    const key    = `v|${tr.id}|${bookId}|${chapter}|${verse}`;
    const cached = await cache.get(key);
    if (typeof cached === 'string') return { text: cached };

    const res = await fetchWithTimeout(`${apiBase}/get-verse/${tr.id}/${bookId}/${chapter}/${verse}/`);
    if (!res.ok) return { status: res.status };
    const data = await res.json();
    const text = buildDisplayText(data.text);
    await cache.set(key, text);
    return { text };
  }

  async function fetchVerse(reference, translationKey) {
    if (!reference || !reference.trim()) return { error: 'Enter a verse reference first.' };

    const parsed = parseReference(reference);
    if (!parsed) return { error: 'Could not read that reference. Try "John 3:16".' };

    const { book, chapter, verse, endVerse } = parsed;
    const idx = bookIndexOf(book);
    if (idx === -1) return { error: `No book called "${book}".` };

    const bookId = idx + 1;
    const tr     = translationById(translationKey);

    if (chapter < 1 || chapter > BIBLE_BOOKS[idx][2]) {
      return { error: `${BIBLE_BOOKS[idx][0]} has ${BIBLE_BOOKS[idx][2]} chapters.` };
    }

    const last = endVerse && endVerse > verse ? endVerse : verse;

    // Each verse in a range is a separate request. Without a cap, a typo like
    // "3:1-99" fires 99 sequential calls and stalls the dock mid-service.
    if (last - verse + 1 > MAX_RANGE_VERSES) {
      return { error: `That range is ${last - verse + 1} verses. Show at most ${MAX_RANGE_VERSES} at once.` };
    }

    try {
      const texts = [];
      for (let v = verse; v <= last; v += 1) {
        const got = await getVerse(tr, bookId, chapter, v);
        if (got.status === 404) {
          return { error: `"${reference}" not found in ${tr.key}. Check the chapter and verse.` };
        }
        if (got.status) return { error: `Lookup failed (${got.status}). Try again.` };
        texts.push(got.text);
      }

      const stepEnd    = endVerse && endVerse > verse ? endVerse : null;
      const displayRef = buildReference(BIBLE_BOOKS[idx][0], chapter, verse, stepEnd);

      return {
        text:      texts.join(' '),
        reference: `${displayRef} — ${tr.key}`,
        rawRef:    displayRef,
        bookId, chapter, verse,
        endVerse:  stepEnd,
      };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { error: 'Timed out after 10s. Check the connection, then try again.' };
      }
      if (err instanceof TypeError) {
        return { error: 'No connection. Check the internet, then try again.' };
      }
      return { error: 'Lookup failed: ' + (err && err.message ? err.message : err) };
    }
  }

  /** How many verses are in a chapter. Used for Next and Random. 0 means unknown. */
  async function fetchVerseCount(translationKey, bookId, chapter) {
    const tr      = translationById(translationKey);
    const bundled = await offlineChapter(tr, bookId, chapter);
    if (bundled) {
      const numbers = Object.keys(bundled).map(Number);
      return numbers.length ? Math.max(...numbers) : 0;
    }
    const key    = `c|${tr.id}|${bookId}|${chapter}`;
    const cached = await cache.get(key);
    if (typeof cached === 'number' && cached > 0) return cached;
    try {
      const res = await fetchWithTimeout(`${apiBase}/get-chapter/${tr.id}/${bookId}/${chapter}/`);
      if (!res.ok) return 0;
      const data  = await res.json();
      const count = Array.isArray(data) ? data.length : 0;
      if (count) await cache.set(key, count);
      return count;
    } catch {
      return 0;
    }
  }

  async function searchScripture(translationKey, query) {
    const q = (query || '').trim();
    if (!q) return { error: 'Enter something to search for.' };
    const tr  = translationById(translationKey);
    const key = `${tr.id}|${q.toLowerCase()}`;
    if (searchCache.has(key)) return searchCache.get(key);

    try {
      const res = await fetchWithTimeout(`${apiBase}/search/${tr.id}/${encodeURIComponent(q)}/`);
      if (!res.ok) return { error: 'Search is unavailable right now.' };
      const data = await res.json();
      if (!Array.isArray(data)) return { error: 'Search returned something unexpected.' };

      const results = data.slice(0, SEARCH_LIMIT).map((v) => ({
        bookId:  v.book,
        chapter: v.chapter,
        verse:   v.verse,
        book:    (BIBLE_BOOKS[v.book - 1] || ["?"])[0],
        text:    buildDisplayText(v.text).replace(/([a-zA-Z])\d+/g, "$1"),
      }));
      searchCache.set(key, results);
      return results;
    } catch {
      return { error: 'Search is unavailable right now.' };
    }
  }

  /** A random reference within a scope. Returns { reference } or { error }. */
  async function randomReference(translationKey, scope) {
    let pool;
    switch (scope) {
      case 'ot':      pool = range(1, OT_END); break;
      case 'nt':      pool = range(OT_END + 1, BIBLE_BOOKS.length); break;
      case 'gospels': pool = GOSPEL_IDS.slice(); break;
      case 'wisdom':  pool = WISDOM_IDS.slice(); break;
      default:        pool = range(1, BIBLE_BOOKS.length);
    }

    for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
      const bookId  = pool[Math.floor(Math.random() * pool.length)];
      const book    = BIBLE_BOOKS[bookId - 1];
      const chapter = 1 + Math.floor(Math.random() * book[2]);
      const count   = await fetchVerseCount(translationKey, bookId, chapter);
      if (!count) continue;
      const verse = 1 + Math.floor(Math.random() * count);
      return { reference: buildReference(book[0], chapter, verse) };
    }
    return { error: 'Could not pick a random verse. Check the connection.' };
  }

  return { fetchVerse, fetchVerseCount, searchScripture, randomReference };
}
