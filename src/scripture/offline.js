export const OFFLINE_TRANSLATIONS = Object.freeze(['KJV', 'WEB']);

/** Inject a classic script tag; resolves on load. Works over file:/// where fetch() does not. */
export function loadScriptTag(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(el);
  });
}

function globalRegistry() {
  globalThis.__BIBLE__ = globalThis.__BIBLE__ || {};
  return globalThis.__BIBLE__;
}

/**
 * Serves chapters from the bundled public-domain translations. Each bundle is
 * a script that sets globalThis.__BIBLE__[ID] = { bookId: { chapter: { verse: text } } }.
 */
export function createOfflineProvider({ loadScript = loadScriptTag, registry = globalRegistry } = {}) {
  const loading = new Map();

  async function ensure(trId) {
    const existing = registry()[trId];
    if (existing) return existing;
    if (!loading.has(trId)) {
      const pending = loadScript(`bible/${trId}.js`)
        .then(() => registry()[trId] ?? null)
        .catch((err) => { loading.delete(trId); throw err; });
      loading.set(trId, pending);
    }
    return loading.get(trId);
  }

  return {
    async getChapter(trId, bookId, chapter) {
      if (!OFFLINE_TRANSLATIONS.includes(trId)) return null;
      const data = await ensure(trId);
      return data?.[bookId]?.[chapter] ?? null;
    },
  };
}
