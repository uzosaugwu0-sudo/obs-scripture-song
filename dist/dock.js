(() => {
  // src/dock/util.js
  var $ = (id) => document.getElementById(id);
  function escapeHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }
  function highlightMatch(text, q) {
    if (!q) return escapeHtml(text);
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return escapeHtml(text).replace(re, "<mark>$1</mark>");
  }

  // src/dock/status.js
  function createStatus({ statusBar, statusDot, statusLabel, liveKind }) {
    function setStatus(msg, type) {
      statusBar.textContent = msg;
      statusBar.className = type ? "is-" + type : "";
      if (msg) setTimeout(() => {
        if (statusBar.textContent === msg) {
          statusBar.textContent = "";
          statusBar.className = "";
        }
      }, 3500);
    }
    function setDotState(phase, liveTab) {
      statusDot.className = "status-dot" + (phase === "live" ? " live" : phase === "hidden" ? " hidden-state" : "");
      statusLabel.textContent = phase === "live" ? "Live" : phase === "hidden" ? "Hidden" : "Off";
      if (phase === "live" && liveTab) {
        liveKind.className = "live-kind " + (liveTab === "scripture" ? "is-verse" : "is-song");
        liveKind.textContent = liveTab === "scripture" ? "Verse" : "Song";
      } else {
        liveKind.className = "live-kind hidden";
      }
    }
    return { setStatus, setDotState };
  }

  // src/dock/session.js
  var TABS = ["scripture", "songs"];
  function createSession({ transport, readSettings, providers, onChange = () => {
  } }) {
    const s = { activeTab: "scripture", isLive: false, liveTab: null, phase: "off" };
    const snapshot = () => ({ activeTab: s.activeTab, isLive: s.isLive, liveTab: s.liveTab, phase: s.phase });
    const notify = () => onChange(snapshot());
    function content(tab) {
      return tab === "scripture" ? { kind: "verse", title: "", ...providers.scripture() } : { kind: "song", reference: "", ...providers.songs() };
    }
    function buildState(action, { forShow = false } = {}) {
      const tab = action === "show" && s.isLive && s.liveTab && !forShow ? s.liveTab : s.activeTab;
      return { ...readSettings(), action, visible: action === "show", ...content(tab) };
    }
    return {
      get activeTab() {
        return s.activeTab;
      },
      get isLive() {
        return s.isLive;
      },
      get liveTab() {
        return s.liveTab;
      },
      get phase() {
        return s.phase;
      },
      buildState,
      setTab(tab) {
        if (!TABS.includes(tab)) return;
        s.activeTab = tab;
        notify();
      },
      show() {
        transport.send(buildState("show", { forShow: true }));
        s.liveTab = s.activeTab;
        s.isLive = true;
        s.phase = "live";
        notify();
      },
      hide() {
        transport.send(buildState("hide"));
        s.isLive = false;
        s.phase = "hidden";
        notify();
      },
      clear() {
        transport.send({ action: "clear", visible: false });
        s.isLive = false;
        s.liveTab = null;
        s.phase = "off";
        notify();
      },
      resendIfLive() {
        if (s.isLive) transport.send(buildState("show"));
      }
    };
  }

  // src/dock/diagnostics.js
  function createDiagnostics({ max = 100 } = {}) {
    let list = [];
    const listeners = /* @__PURE__ */ new Set();
    const emit = () => listeners.forEach((fn) => fn(list));
    return {
      log(context, err) {
        const message = err instanceof Error ? err.message : String(err);
        list = [...list, { at: (/* @__PURE__ */ new Date()).toISOString(), context, message }].slice(-max);
        emit();
      },
      entries: () => list,
      clear() {
        list = [];
        emit();
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      }
    };
  }

  // src/core/state.js
  var STATE_VERSION = 1;
  var ACTIONS = Object.freeze(["show", "hide", "clear"]);
  var KINDS = Object.freeze(["verse", "song"]);
  var DEFAULTS = Object.freeze({
    action: "show",
    kind: "verse",
    // one of KINDS; later phases add more
    title: "",
    // song title
    body: "",
    // verse text or slide lines
    reference: "",
    // scripture reference
    theme: "dark",
    position: "bottom",
    fontSize: "md",
    animation: "fade",
    visible: false,
    version: STATE_VERSION,
    seq: 0,
    // monotonic; replaces the old timestamp
    opacity: 88,
    scale: 100,
    font: "Open Sans",
    italic: false,
    showCard: true,
    showTitle: true,
    showReference: true,
    bgMode: "color",
    // 'color' | 'image'
    bgImage: null,
    customColors: { bg: "#0a0a14", text: "#ffffff", accent: "#a78bfa" }
  });
  function nextSeq(lastSeq, nowMs) {
    return Math.max(lastSeq + 1, nowMs);
  }
  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.version === "number" && raw.version > STATE_VERSION) return null;
    const merged = {
      ...DEFAULTS,
      ...raw,
      customColors: { ...DEFAULTS.customColors, ...raw.customColors || {} }
    };
    if (!ACTIONS.includes(merged.action)) return null;
    if (!KINDS.includes(merged.kind)) return null;
    return merged;
  }

  // src/transport/broadcast.js
  var CHANNEL_NAME = "obs-stage-display";
  var STATE_KEY = "obs-stage-display-state";
  var POLL_INTERVAL = 80;
  function createBroadcastTransport({
    role,
    channel = null,
    storage = null,
    pollMs = POLL_INTERVAL,
    onError = () => {
    },
    now = Date.now
  }) {
    const listeners = /* @__PURE__ */ new Set();
    let lastSeq = 0;
    let timer = null;
    let storageListener = null;
    const readStored = () => {
      if (!storage) return null;
      try {
        const raw = storage.getItem(STATE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        onError(err);
        return null;
      }
    };
    if (role === "dock") {
      const stored = readStored();
      if (stored && typeof stored.seq === "number") lastSeq = stored.seq;
    }
    function dispatch(raw) {
      const state = normalizeState(raw);
      if (!state || state.seq <= lastSeq) return;
      lastSeq = state.seq;
      for (const fn of listeners) {
        try {
          fn(state);
        } catch (err) {
          onError(err);
        }
      }
    }
    function send(partial) {
      const seq = nextSeq(lastSeq, now());
      const payload = {
        ...DEFAULTS,
        ...partial,
        version: STATE_VERSION,
        seq,
        customColors: { ...DEFAULTS.customColors, ...partial.customColors || {} }
      };
      lastSeq = seq;
      if (channel) {
        try {
          channel.postMessage(payload);
        } catch (err) {
          onError(err);
        }
      }
      if (storage) {
        try {
          storage.setItem(STATE_KEY, JSON.stringify(payload));
        } catch (err) {
          onError(err);
        }
      }
      return payload;
    }
    function start() {
      if (channel) channel.onmessage = (e) => dispatch(e.data);
      if (typeof globalThis.addEventListener === "function") {
        storageListener = (e) => {
          if (e.key !== STATE_KEY || !e.newValue) return;
          try {
            dispatch(JSON.parse(e.newValue));
          } catch (err) {
            onError(err);
          }
        };
        globalThis.addEventListener("storage", storageListener);
      }
      if (role === "overlay") {
        const stored = readStored();
        if (stored && stored.visible) dispatch(stored);
      }
      timer = setInterval(() => {
        const stored = readStored();
        if (stored) dispatch(stored);
      }, pollMs);
    }
    function dispose() {
      if (timer) clearInterval(timer);
      timer = null;
      if (channel) channel.onmessage = null;
      if (storageListener && typeof globalThis.removeEventListener === "function") {
        globalThis.removeEventListener("storage", storageListener);
      }
      listeners.clear();
    }
    return {
      send,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      start,
      status: () => ({ kind: "broadcast", hasChannel: !!channel, lastSeq }),
      dispose
    };
  }

  // src/transport/index.js
  function createBrowserTransport(role, onError = () => {
  }) {
    let channel = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch (err) {
      onError(err);
    }
    let storage = null;
    try {
      storage = window.localStorage;
    } catch (err) {
      onError(err);
    }
    return createBroadcastTransport({ role, channel, storage, onError });
  }

  // src/scripture/books.js
  var BIBLE_BOOKS = [
    ["Genesis", "Gen", 50],
    ["Exodus", "Exo", 40],
    ["Leviticus", "Lev", 27],
    ["Numbers", "Num", 36],
    ["Deuteronomy", "Deu", 34],
    ["Joshua", "Jos", 24],
    ["Judges", "Jdg", 21],
    ["Ruth", "Rut", 4],
    ["1 Samuel", "1Sa", 31],
    ["2 Samuel", "2Sa", 24],
    ["1 Kings", "1Ki", 22],
    ["2 Kings", "2Ki", 25],
    ["1 Chronicles", "1Ch", 29],
    ["2 Chronicles", "2Ch", 36],
    ["Ezra", "Ezr", 10],
    ["Nehemiah", "Neh", 13],
    ["Esther", "Est", 10],
    ["Job", "Job", 42],
    ["Psalms", "Psa", 150],
    ["Proverbs", "Pro", 31],
    ["Ecclesiastes", "Ecc", 12],
    ["Song of Solomon", "Son", 8],
    ["Isaiah", "Isa", 66],
    ["Jeremiah", "Jer", 52],
    ["Lamentations", "Lam", 5],
    ["Ezekiel", "Eze", 48],
    ["Daniel", "Dan", 12],
    ["Hosea", "Hos", 14],
    ["Joel", "Joe", 3],
    ["Amos", "Amo", 9],
    ["Obadiah", "Oba", 1],
    ["Jonah", "Jon", 4],
    ["Micah", "Mic", 7],
    ["Nahum", "Nah", 3],
    ["Habakkuk", "Hab", 3],
    ["Zephaniah", "Zep", 3],
    ["Haggai", "Hag", 2],
    ["Zechariah", "Zec", 14],
    ["Malachi", "Mal", 4],
    ["Matthew", "Mat", 28],
    ["Mark", "Mar", 16],
    ["Luke", "Luk", 24],
    ["John", "Joh", 21],
    ["Acts", "Act", 28],
    ["Romans", "Rom", 16],
    ["1 Corinthians", "1Co", 16],
    ["2 Corinthians", "2Co", 13],
    ["Galatians", "Gal", 6],
    ["Ephesians", "Eph", 6],
    ["Philippians", "Phi", 4],
    ["Colossians", "Col", 4],
    ["1 Thessalonians", "1Th", 5],
    ["2 Thessalonians", "2Th", 3],
    ["1 Timothy", "1Ti", 6],
    ["2 Timothy", "2Ti", 4],
    ["Titus", "Tit", 3],
    ["Philemon", "Phm", 1],
    ["Hebrews", "Heb", 13],
    ["James", "Jam", 5],
    ["1 Peter", "1Pe", 5],
    ["2 Peter", "2Pe", 3],
    ["1 John", "1Jo", 5],
    ["2 John", "2Jo", 1],
    ["3 John", "3Jo", 1],
    ["Jude", "Jud", 1],
    ["Revelation", "Rev", 22]
  ];
  var OT_END = 39;
  var GOSPEL_IDS = [40, 41, 42, 43];
  var WISDOM_IDS = [19, 20];
  var BOOK_ALIASES = {
    "psalm": "Psalms",
    "ps": "Psalms",
    "psa": "Psalms",
    "pslm": "Psalms",
    "song of songs": "Song of Solomon",
    "songs": "Song of Solomon",
    "canticles": "Song of Solomon",
    "sos": "Song of Solomon",
    "matt": "Matthew",
    "mt": "Matthew",
    "mk": "Mark",
    "lk": "Luke",
    "jn": "John",
    "jhn": "John",
    "rom": "Romans",
    "phil": "Philippians",
    "philem": "Philemon",
    "philm": "Philemon",
    "rev": "Revelation",
    "eccl": "Ecclesiastes",
    "deut": "Deuteronomy",
    "josh": "Joshua",
    "judg": "Judges",
    "neh": "Nehemiah",
    "prov": "Proverbs",
    "isa": "Isaiah",
    "jer": "Jeremiah",
    "ezek": "Ezekiel",
    "dan": "Daniel",
    "zech": "Zechariah",
    "mal": "Malachi",
    "heb": "Hebrews",
    "gen": "Genesis",
    "ex": "Exodus",
    "lev": "Leviticus",
    "num": "Numbers",
    "acts": "Acts",
    "gal": "Galatians",
    "eph": "Ephesians",
    "col": "Colossians"
  };
  function bookIndexOf(name) {
    let n = (name || "").toLowerCase().trim().replace(/\.$/, "");
    if (!n) return -1;
    n = n.replace(/^(1st|first|i)\s+/, "1 ").replace(/^(2nd|second|ii)\s+/, "2 ").replace(/^(3rd|third|iii)\s+/, "3 ").replace(/\s+/g, " ");
    let i = BIBLE_BOOKS.findIndex((b) => b[0].toLowerCase() === n || b[1] && b[1].toLowerCase() === n);
    if (i !== -1) return i;
    const alias = BOOK_ALIASES[n];
    if (alias) {
      i = BIBLE_BOOKS.findIndex((b) => b[0] === alias);
      if (i !== -1) return i;
    }
    const hits = [];
    BIBLE_BOOKS.forEach((b, idx) => {
      if (b[0].toLowerCase().startsWith(n)) hits.push(idx);
    });
    return hits.length === 1 ? hits[0] : -1;
  }
  function searchBooks(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return [];
    return BIBLE_BOOKS.filter(([name, abbr]) => name.toLowerCase().startsWith(q) || abbr.toLowerCase().startsWith(q) || name.toLowerCase().includes(q)).map(([name]) => name).slice(0, 8);
  }

  // src/scripture/translations.js
  var TRANSLATIONS = [
    { key: "KJV", id: "KJV", lang: "English", label: "King James Version" },
    { key: "NKJV", id: "NKJV", lang: "English", label: "New King James Version" },
    { key: "NIV", id: "NIV", lang: "English", label: "New International Version" },
    { key: "NIV2011", id: "NIV2011", lang: "English", label: "New International Version 2011" },
    { key: "ESV", id: "ESV", lang: "English", label: "English Standard Version" },
    { key: "NLT", id: "NLT", lang: "English", label: "New Living Translation" },
    { key: "NASB", id: "NASB", lang: "English", label: "New American Standard Bible" },
    { key: "AMP", id: "AMP", lang: "English", label: "Amplified Bible" },
    { key: "MSG", id: "MSG", lang: "English", label: "The Message" },
    { key: "CSB", id: "CSB17", lang: "English", label: "Christian Standard Bible" },
    { key: "NET", id: "NET", lang: "English", label: "New English Translation" },
    { key: "RSV", id: "RSV", lang: "English", label: "Revised Standard Version" },
    { key: "ASV", id: "ASV", lang: "English", label: "American Standard Version" },
    { key: "WEB", id: "WEB", lang: "English", label: "World English Bible" },
    { key: "WEBBE", id: "WEBBE", lang: "English", label: "World English Bible (British)" },
    { key: "BSB", id: "BSB", lang: "English", label: "Berean Study Bible" },
    { key: "MEV", id: "MEV", lang: "English", label: "Modern English Version" },
    { key: "CEV", id: "CEVD", lang: "English", label: "Contemporary English Version" },
    { key: "ISV", id: "ISV", lang: "English", label: "International Standard Version" },
    { key: "ERV", id: "ERV", lang: "English", label: "Easy-to-Read Version" },
    { key: "NLV", id: "NLV", lang: "English", label: "New Life Version" },
    { key: "GNT", id: "GNT", lang: "English", label: "Good News Translation" },
    { key: "GNV", id: "GNV", lang: "English", label: "Geneva Bible" },
    { key: "LSV", id: "LSV", lang: "English", label: "Literal Standard Version" },
    { key: "BBE", id: "BBE", lang: "English", label: "Bible in Basic English" },
    { key: "DARBY", id: "DARBY", lang: "English", label: "Darby Translation" },
    { key: "YLT", id: "YLT", lang: "English", label: "Young's Literal Translation" },
    { key: "DRB", id: "DRB", lang: "English", label: "Douay-Rheims Bible" },
    { key: "ALM21", id: "ALM21", lang: "Portugu\xEAs", label: "Almeida S\xE9culo 21" },
    { key: "SYNOD", id: "SYNOD", lang: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", label: "\u0421\u0438\u043D\u043E\u0434\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0432\u043E\u0434" },
    { key: "CUV", id: "CUV", lang: "\u4E2D\u6587", label: "\u548C\u5408\u672C" }
  ];
  var LANGUAGES = TRANSLATIONS.reduce((acc, t) => {
    if (!acc.includes(t.lang)) acc.push(t.lang);
    return acc;
  }, []);
  function translationById(key) {
    return TRANSLATIONS.find((t) => t.key === key || t.id === key) || TRANSLATIONS[0];
  }

  // src/scripture/reference.js
  function parseReference(str) {
    const s = (str || "").trim();
    let m = s.match(/^(.+?)[\s]+(\d+)\s*[:.\s]\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (m) {
      return {
        book: m[1].trim(),
        chapter: parseInt(m[2], 10),
        verse: parseInt(m[3], 10),
        endVerse: m[4] ? parseInt(m[4], 10) : null
      };
    }
    m = s.match(/^(.+?)\s+(\d+)$/);
    if (m) {
      return { book: m[1].trim(), chapter: parseInt(m[2], 10), verse: 1, endVerse: null };
    }
    return null;
  }
  function buildReference(book, chapter, verse, endVerse) {
    const range2 = endVerse && endVerse > verse ? `${verse}-${endVerse}` : `${verse}`;
    return `${book} ${chapter}:${range2}`;
  }
  function buildDisplayText(raw) {
    if (!raw) return "";
    return raw.replace(/<S>\d+<\/S>/g, "").replace(/<[^>]+>/g, "").replace(/\n\d+\s*/g, " ").replace(/\s+/g, " ").trim();
  }
  async function stepReference(reference, dir, countFn) {
    const parsed = parseReference(reference);
    if (!parsed) return null;
    const idx = bookIndexOf(parsed.book);
    if (idx === -1) return null;
    let bookId = idx + 1;
    let chapter = parsed.chapter;
    let verse = dir > 0 && parsed.endVerse ? parsed.endVerse : parsed.verse;
    verse += dir;
    if (verse < 1) {
      chapter -= 1;
      if (chapter < 1) {
        bookId -= 1;
        if (bookId < 1) return null;
        chapter = BIBLE_BOOKS[bookId - 1][2];
      }
      verse = await countFn(bookId, chapter) || 1;
    } else {
      const count = await countFn(bookId, chapter);
      if (count && verse > count) {
        verse = 1;
        chapter += 1;
        if (chapter > BIBLE_BOOKS[bookId - 1][2]) {
          bookId += 1;
          if (bookId > BIBLE_BOOKS.length) return null;
          chapter = 1;
        }
      }
    }
    return buildReference(BIBLE_BOOKS[bookId - 1][0], chapter, verse);
  }

  // src/scripture/api.js
  var MAX_RANGE_VERSES = 20;
  var FETCH_TIMEOUT_MS = 1e4;
  var SEARCH_LIMIT = 50;
  var RANDOM_ATTEMPTS = 5;
  function memoryCache() {
    const map = /* @__PURE__ */ new Map();
    return {
      async get(key) {
        return map.get(key);
      },
      async set(key, value) {
        map.set(key, value);
      }
    };
  }
  function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i += 1) out.push(i);
    return out;
  }
  function createScriptureApi({
    fetchImpl = (...args) => fetch(...args),
    cache = memoryCache(),
    offline = null,
    apiBase = "https://bolls.life",
    timeoutMs = FETCH_TIMEOUT_MS
  } = {}) {
    const searchCache = /* @__PURE__ */ new Map();
    async function fetchWithTimeout(url) {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        return await fetchImpl(url, ctrl ? { signal: ctrl.signal } : void 0);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    async function offlineChapter(tr, bookId, chapter) {
      if (!offline) return null;
      try {
        return await offline.getChapter(tr.id, bookId, chapter);
      } catch {
        return null;
      }
    }
    async function getVerse(tr, bookId, chapter, verse) {
      const bundled = await offlineChapter(tr, bookId, chapter);
      if (bundled) {
        return typeof bundled[verse] === "string" ? { text: bundled[verse] } : { status: 404 };
      }
      const key = `v|${tr.id}|${bookId}|${chapter}|${verse}`;
      const cached = await cache.get(key);
      if (typeof cached === "string") return { text: cached };
      const res = await fetchWithTimeout(`${apiBase}/get-verse/${tr.id}/${bookId}/${chapter}/${verse}/`);
      if (!res.ok) return { status: res.status };
      const data = await res.json();
      const text = buildDisplayText(data.text);
      await cache.set(key, text);
      return { text };
    }
    async function fetchVerse(reference, translationKey) {
      if (!reference || !reference.trim()) return { error: "Enter a verse reference first." };
      const parsed = parseReference(reference);
      if (!parsed) return { error: 'Could not read that reference. Try "John 3:16".' };
      const { book, chapter, verse, endVerse } = parsed;
      const idx = bookIndexOf(book);
      if (idx === -1) return { error: `No book called "${book}".` };
      const bookId = idx + 1;
      const tr = translationById(translationKey);
      if (chapter < 1 || chapter > BIBLE_BOOKS[idx][2]) {
        return { error: `${BIBLE_BOOKS[idx][0]} has ${BIBLE_BOOKS[idx][2]} chapters.` };
      }
      const last = endVerse && endVerse > verse ? endVerse : verse;
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
        const stepEnd = endVerse && endVerse > verse ? endVerse : null;
        const displayRef = buildReference(BIBLE_BOOKS[idx][0], chapter, verse, stepEnd);
        return {
          text: texts.join(" "),
          reference: `${displayRef} \u2014 ${tr.key}`,
          rawRef: displayRef,
          bookId,
          chapter,
          verse,
          endVerse: stepEnd
        };
      } catch (err) {
        if (err && err.name === "AbortError") {
          return { error: "Timed out after 10s. Check the connection, then try again." };
        }
        if (err instanceof TypeError) {
          return { error: "No connection. Check the internet, then try again." };
        }
        return { error: "Lookup failed: " + (err && err.message ? err.message : err) };
      }
    }
    async function fetchVerseCount(translationKey, bookId, chapter) {
      const tr = translationById(translationKey);
      const bundled = await offlineChapter(tr, bookId, chapter);
      if (bundled) {
        const numbers = Object.keys(bundled).map(Number);
        return numbers.length ? Math.max(...numbers) : 0;
      }
      const key = `c|${tr.id}|${bookId}|${chapter}`;
      const cached = await cache.get(key);
      if (typeof cached === "number" && cached > 0) return cached;
      try {
        const res = await fetchWithTimeout(`${apiBase}/get-chapter/${tr.id}/${bookId}/${chapter}/`);
        if (!res.ok) return 0;
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : 0;
        if (count) await cache.set(key, count);
        return count;
      } catch {
        return 0;
      }
    }
    async function searchScripture(translationKey, query) {
      const q = (query || "").trim();
      if (!q) return { error: "Enter something to search for." };
      const tr = translationById(translationKey);
      const key = `${tr.id}|${q.toLowerCase()}`;
      if (searchCache.has(key)) return searchCache.get(key);
      try {
        const res = await fetchWithTimeout(`${apiBase}/search/${tr.id}/${encodeURIComponent(q)}/`);
        if (!res.ok) return { error: "Search is unavailable right now." };
        const data = await res.json();
        if (!Array.isArray(data)) return { error: "Search returned something unexpected." };
        const results = data.slice(0, SEARCH_LIMIT).map((v) => ({
          bookId: v.book,
          chapter: v.chapter,
          verse: v.verse,
          book: (BIBLE_BOOKS[v.book - 1] || ["?"])[0],
          text: buildDisplayText(v.text).replace(/([a-zA-Z])\d+/g, "$1")
        }));
        searchCache.set(key, results);
        return results;
      } catch {
        return { error: "Search is unavailable right now." };
      }
    }
    async function randomReference(translationKey, scope) {
      let pool;
      switch (scope) {
        case "ot":
          pool = range(1, OT_END);
          break;
        case "nt":
          pool = range(OT_END + 1, BIBLE_BOOKS.length);
          break;
        case "gospels":
          pool = GOSPEL_IDS.slice();
          break;
        case "wisdom":
          pool = WISDOM_IDS.slice();
          break;
        default:
          pool = range(1, BIBLE_BOOKS.length);
      }
      for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
        const bookId = pool[Math.floor(Math.random() * pool.length)];
        const book = BIBLE_BOOKS[bookId - 1];
        const chapter = 1 + Math.floor(Math.random() * book[2]);
        const count = await fetchVerseCount(translationKey, bookId, chapter);
        if (!count) continue;
        const verse = 1 + Math.floor(Math.random() * count);
        return { reference: buildReference(book[0], chapter, verse) };
      }
      return { error: "Could not pick a random verse. Check the connection." };
    }
    return { fetchVerse, fetchVerseCount, searchScripture, randomReference };
  }

  // src/scripture/offline.js
  var OFFLINE_TRANSLATIONS = Object.freeze(["KJV", "WEB"]);
  function loadScriptTag(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(el);
    });
  }
  function globalRegistry() {
    globalThis.__BIBLE__ = globalThis.__BIBLE__ || {};
    return globalThis.__BIBLE__;
  }
  function createOfflineProvider({ loadScript = loadScriptTag, registry = globalRegistry } = {}) {
    const loading = /* @__PURE__ */ new Map();
    async function ensure(trId) {
      const existing = registry()[trId];
      if (existing) return existing;
      if (!loading.has(trId)) {
        const pending = loadScript(`bible/${trId}.js`).then(() => registry()[trId] ?? null).catch((err) => {
          loading.delete(trId);
          throw err;
        });
        loading.set(trId, pending);
      }
      return loading.get(trId);
    }
    return {
      async getChapter(trId, bookId, chapter) {
        if (!OFFLINE_TRANSLATIONS.includes(trId)) return null;
        const data = await ensure(trId);
        return data?.[bookId]?.[chapter] ?? null;
      }
    };
  }

  // src/songs/model.js
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function normalizeTitle(title) {
    return (title || "").trim().toLowerCase();
  }
  function looksLikeSong(x) {
    return !!x && typeof x === "object" && typeof x.title === "string" && Array.isArray(x.slides) && x.slides.every((s) => typeof s === "string") && (x.altTitle == null || typeof x.altTitle === "string");
  }
  function isSongRecord(x) {
    return looksLikeSong(x) && typeof x.id === "string";
  }
  function toSongRecord(x) {
    return {
      id: x.id,
      title: x.title,
      altTitle: x.altTitle ?? null,
      slides: [...x.slides]
    };
  }

  // src/songs/library.js
  function createLibrary({ local, onModeChange = () => {
  }, onError = () => {
  }, uid: uid2 = uid }) {
    let songs = local.load();
    let folder = null;
    let mode = "local";
    let lyricsChain = Promise.resolve();
    const dirty = /* @__PURE__ */ new Set();
    function setMode(next) {
      if (next === mode) return;
      mode = next;
      onModeChange(mode);
    }
    function queueLyrics() {
      const run = lyricsChain.then(() => folder.writeLyrics(songs));
      lyricsChain = run.catch(() => {
      });
      return run;
    }
    async function persist({ write = [], remove: remove2 = [] } = {}) {
      if (mode !== "folder") {
        write.forEach((s) => dirty.add(s.id));
        local.save(songs);
        return;
      }
      try {
        for (const song of write) await folder.write(song);
        for (const id of remove2) await folder.remove(id);
        await queueLyrics();
        local.save(songs);
      } catch (err) {
        onError(err);
        write.forEach((s) => dirty.add(s.id));
        local.save(songs);
        setMode("folder-lost");
      }
    }
    const get = (id) => songs.find((s) => s.id === id) || null;
    async function save(input) {
      const id = input.id || uid2();
      const song = toSongRecord({
        id,
        title: (input.title || "").trim() || "Untitled",
        altTitle: input.altTitle ?? null,
        slides: input.slides || []
      });
      songs = songs.some((s) => s.id === id) ? songs.map((s) => s.id === id ? song : s) : [...songs, song];
      await persist({ write: [song] });
      return song;
    }
    async function removeMany(ids) {
      const gone = new Set(ids);
      const existing = songs.filter((s) => gone.has(s.id)).map((s) => s.id);
      if (!existing.length) return;
      songs = songs.filter((s) => !gone.has(s.id));
      await persist({ remove: existing });
    }
    const remove = (id) => removeMany([id]);
    const clearAll = () => removeMany(songs.map((s) => s.id));
    async function upsertByTitle(incoming) {
      let added = 0;
      let replaced = 0;
      const written = [];
      let next = songs;
      for (const item of incoming) {
        const key = normalizeTitle(item.title);
        const idx = next.findIndex((s) => normalizeTitle(s.title) === key);
        if (idx !== -1) {
          const updated = toSongRecord({ ...next[idx], altTitle: item.altTitle ?? null, slides: item.slides });
          next = next.map((s, i) => i === idx ? updated : s);
          written.push(updated);
          replaced += 1;
        } else {
          const created = toSongRecord({ id: uid2(), title: item.title, altTitle: item.altTitle || null, slides: item.slides });
          next = [...next, created];
          written.push(created);
          added += 1;
        }
      }
      songs = next;
      await persist({ write: written });
      return { added, replaced };
    }
    async function attachFolder(newFolder) {
      const { songs: found, errors } = await newFolder.list();
      const titles = new Set(found.map((s) => normalizeTitle(s.title)));
      const ids = new Set(found.map((s) => s.id));
      const edited = new Set(dirty);
      dirty.clear();
      const carried = songs.filter((s) => edited.has(s.id) || !titles.has(normalizeTitle(s.title)) && !ids.has(s.id));
      folder = newFolder;
      songs = [...found.filter((s) => !edited.has(s.id)), ...carried];
      setMode("folder");
      await persist({ write: carried });
      return { loaded: found.length, carried: carried.length, errors };
    }
    function markLost() {
      setMode("folder-lost");
    }
    function detach() {
      folder = null;
      local.save(songs);
      setMode("local");
    }
    async function rewriteLyrics() {
      if (mode !== "folder") return;
      await persist();
    }
    return {
      list: () => songs,
      get,
      mode: () => mode,
      save,
      remove,
      removeMany,
      clearAll,
      upsertByTitle,
      attachFolder,
      markLost,
      detach,
      rewriteLyrics
    };
  }

  // src/songs/local-store.js
  var SONGS_KEY = "obs-stage-songs";
  var LEGACY_SONGS_KEY = "obs-lyric-songs";
  function createLocalSongStore(storage, onError = () => {
  }) {
    function read(key) {
      try {
        const raw = storage?.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.filter(looksLikeSong).map((s) => toSongRecord({ ...s, id: typeof s.id === "string" ? s.id : uid() }));
      } catch (err) {
        onError(err);
        return null;
      }
    }
    function save(songs) {
      try {
        storage?.setItem(SONGS_KEY, JSON.stringify(songs));
      } catch (err) {
        onError(err);
      }
    }
    function load() {
      const own = read(SONGS_KEY);
      if (own) return own;
      const legacy = read(LEGACY_SONGS_KEY);
      if (legacy && legacy.length) {
        save(legacy);
        return legacy;
      }
      return [];
    }
    return { load, save };
  }

  // src/core/idb.js
  var STORE = "kv";
  function openKv(dbName, idb = globalThis.indexedDB) {
    let dbPromise = null;
    const open = () => {
      dbPromise ?? (dbPromise = new Promise((resolve, reject) => {
        const request = idb.open(dbName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }));
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
      get: (key) => run("readonly", (store) => store.get(key)),
      set: (key, value) => run("readwrite", (store) => store.put(value, key)),
      del: (key) => run("readwrite", (store) => store.delete(key))
    };
  }
  function idbCache(kv, onError = () => {
  }) {
    return {
      async get(key) {
        try {
          return await kv.get(key);
        } catch (err) {
          onError(err);
          return void 0;
        }
      },
      async set(key, value) {
        try {
          await kv.set(key, value);
        } catch (err) {
          onError(err);
        }
      }
    };
  }

  // src/core/settings.js
  var SETTINGS_KEY = "obs-stage-display-settings";
  function defaultStorage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
  function saveSettings(settings, { storage = defaultStorage(), onError = () => {
  } } = {}) {
    try {
      storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      onError(err);
    }
  }
  function loadSettings({ storage = defaultStorage(), onError = () => {
  } } = {}) {
    try {
      const raw = storage?.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULTS,
          ...parsed,
          customColors: { ...DEFAULTS.customColors, ...parsed.customColors || {} }
        };
      }
    } catch (err) {
      onError(err);
    }
    return { ...DEFAULTS, customColors: { ...DEFAULTS.customColors } };
  }

  // src/core/fonts.js
  var FONTS = [
    { label: "Open Sans (Default)", value: "Open Sans" },
    { label: "Atkinson Hyperlegible", value: "Atkinson Hyperlegible" },
    { label: "Lato", value: "Lato" },
    { label: "Montserrat", value: "Montserrat" },
    { label: "Raleway", value: "Raleway" },
    { label: "Lora", value: "Lora" },
    { label: "EB Garamond", value: "EB Garamond" },
    { label: "Cormorant Garamond", value: "Cormorant Garamond" },
    { label: "Crimson Text", value: "Crimson Text" },
    { label: "Playfair Display", value: "Playfair Display" },
    { label: "Cinzel", value: "Cinzel" },
    { label: "Georgia", value: "Georgia" }
  ];

  // src/dock/display-settings.js
  function initDisplaySettings({ session, setStatus, applyScriptureSettings, onError }) {
    const persist = (settings) => saveSettings(settings, { onError });
    const languageSel = $("language-sel"), translationSel = $("translation-sel"), autoShowCb = $("auto-show-cb");
    const themeSel = $("theme-sel"), positionSel = $("position-sel"), fontsizeSel = $("fontsize-sel"), animationSel = $("animation-sel"), fontSel = $("font-sel"), btnItalic = $("btn-italic"), opacitySlider = $("opacity-slider"), opacityValue = $("opacity-value"), scaleSlider = $("scale-slider"), scaleValue = $("scale-value"), showCardCb = $("show-card-cb"), showTitleCb = $("show-title-cb"), showRefCb = $("show-ref-cb"), customColorsSection = $("custom-colors-section"), colorBg = $("color-bg"), colorText = $("color-text"), colorAccent = $("color-accent"), btnBgImage = $("btn-bg-image"), btnBgClear = $("btn-bg-clear"), bgImageName = $("bg-image-name"), bgImageInput = $("bg-image-input");
    let isItalic = false;
    let bgImageData = null;
    FONTS.forEach((f) => {
      const o = document.createElement("option");
      o.value = f.value;
      o.textContent = f.label;
      fontSel.appendChild(o);
    });
    function saveCurrentSettings() {
      persist({
        theme: themeSel.value,
        position: positionSel.value,
        fontSize: fontsizeSel.value,
        animation: animationSel.value,
        font: fontSel.value,
        italic: isItalic,
        opacity: parseInt(opacitySlider.value, 10),
        scale: parseInt(scaleSlider.value, 10),
        showCard: showCardCb.checked,
        showTitle: showTitleCb.checked,
        showReference: showRefCb.checked,
        bgImage: bgImageData,
        bgMode: bgImageData ? "image" : "color",
        language: languageSel.value,
        translation: translationSel.value,
        autoShow: autoShowCb.checked,
        customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value }
      });
    }
    function applySettings(s) {
      themeSel.value = s.theme || "dark";
      positionSel.value = s.position || "bottom";
      fontsizeSel.value = s.fontSize || "md";
      animationSel.value = s.animation || "fade";
      fontSel.value = s.font || "Open Sans";
      isItalic = !!s.italic;
      btnItalic.classList.toggle("active", isItalic);
      opacitySlider.value = s.opacity !== void 0 ? s.opacity : 88;
      opacityValue.textContent = opacitySlider.value + "%";
      scaleSlider.value = s.scale !== void 0 ? s.scale : 100;
      scaleValue.textContent = scaleSlider.value + "%";
      showCardCb.checked = s.showCard !== false;
      showTitleCb.checked = s.showTitle !== false;
      showRefCb.checked = s.showReference !== false;
      const c = s.customColors || DEFAULTS.customColors;
      colorBg.value = c.bg || "#0a0a14";
      colorText.value = c.text || "#ffffff";
      colorAccent.value = c.accent || "#a78bfa";
      applyScriptureSettings(s);
      bgImageData = s.bgImage || null;
      updateBgUI();
      updateThemeUI();
    }
    function updateThemeUI() {
      customColorsSection.style.display = themeSel.value === "custom" ? "" : "none";
    }
    function updateBgUI() {
      if (bgImageData) {
        bgImageName.textContent = "Custom image in use";
        btnBgClear.style.display = "";
      } else {
        bgImageName.textContent = "None \u2014 using theme colour";
        btnBgClear.style.display = "none";
      }
    }
    function loadBgImage(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1920;
          const ratio = Math.min(1, maxW / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            bgImageData = canvas.toDataURL("image/jpeg", 0.85);
          } catch (_) {
            bgImageData = e.target.result;
          }
          updateBgUI();
          saveCurrentSettings();
          session.resendIfLive();
          setStatus("Background image set.", "success");
        };
        img.onerror = () => setStatus("That image could not be read.", "error");
        img.src = e.target.result;
      };
      reader.onerror = () => setStatus("That image could not be read.", "error");
      reader.readAsDataURL(file);
    }
    function readSettings() {
      return {
        theme: themeSel.value,
        position: positionSel.value,
        fontSize: fontsizeSel.value,
        animation: animationSel.value,
        font: fontSel.value,
        italic: isItalic,
        opacity: parseInt(opacitySlider.value, 10),
        scale: parseInt(scaleSlider.value, 10),
        showCard: showCardCb.checked,
        showTitle: showTitleCb.checked,
        showReference: showRefCb.checked,
        bgMode: bgImageData ? "image" : "color",
        bgImage: bgImageData,
        customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value }
      };
    }
    [themeSel, positionSel, fontsizeSel, animationSel, fontSel].forEach((el) => el.addEventListener("change", () => {
      if (el === themeSel) updateThemeUI();
      saveCurrentSettings();
      session.resendIfLive();
    }));
    btnItalic.addEventListener("click", () => {
      isItalic = !isItalic;
      btnItalic.classList.toggle("active", isItalic);
      saveCurrentSettings();
      session.resendIfLive();
    });
    opacitySlider.addEventListener("input", () => {
      opacityValue.textContent = opacitySlider.value + "%";
      saveCurrentSettings();
      session.resendIfLive();
    });
    scaleSlider.addEventListener("input", () => {
      scaleValue.textContent = scaleSlider.value + "%";
      saveCurrentSettings();
      session.resendIfLive();
    });
    [showCardCb, showTitleCb, showRefCb].forEach((cb) => cb.addEventListener("change", () => {
      saveCurrentSettings();
      session.resendIfLive();
    }));
    [colorBg, colorText, colorAccent].forEach((el) => el.addEventListener("input", () => {
      saveCurrentSettings();
      session.resendIfLive();
    }));
    btnBgImage.addEventListener("click", () => bgImageInput.click());
    bgImageInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadBgImage(file);
      bgImageInput.value = "";
    });
    btnBgClear.addEventListener("click", () => {
      bgImageData = null;
      updateBgUI();
      saveCurrentSettings();
      session.resendIfLive();
      setStatus("Background image removed.", "");
    });
    return { readSettings, saveCurrentSettings, applySettings };
  }

  // src/dock/scripture-tab.js
  function initScriptureTab({ session, scripture, setStatus, saveCurrentSettings, refresh }) {
    const refInput = $("ref-input"), btnLookup = $("btn-lookup"), bookSuggest = $("book-suggest"), languageSel = $("language-sel"), translationSel = $("translation-sel"), bookSel = $("book-sel"), chapterSel = $("chapter-sel"), verseSel = $("verse-sel"), btnGoto = $("btn-goto"), quickBooks = $("quick-books"), autoShowCb = $("auto-show-cb"), verseText = $("verse-text"), scriptureSearch = $("scripture-search"), btnScriptureSearch = $("btn-scripture-search"), searchResults = $("search-results"), randomScope = $("random-scope"), btnRandom = $("btn-random");
    const qrBook = $("qr-book"), qrChapter = $("qr-chapter"), qrVerse = $("qr-verse"), qrGo = $("qr-go"), qrSuggest = $("qr-book-suggest"), qrHint = $("qr-hint");
    let currentPlainRef = "";
    let currentRefLabel = "";
    let suggestIdx = -1;
    let looking = false;
    const QUICK_BOOKS = [
      "John",
      "Romans",
      "Psalms",
      "Matthew",
      "Genesis",
      "Proverbs",
      "Isaiah",
      "Hebrews",
      "Acts",
      "Revelation"
    ];
    function currentTranslation() {
      return translationSel.value || "KJV";
    }
    function buildLanguageSelect() {
      LANGUAGES.forEach((lang) => {
        const o = document.createElement("option");
        o.value = lang;
        o.textContent = lang;
        languageSel.appendChild(o);
      });
      languageSel.value = "English";
    }
    function buildTranslationSelect(keepKey) {
      const lang = languageSel.value;
      translationSel.innerHTML = "";
      TRANSLATIONS.filter((t) => t.lang === lang).forEach((t) => {
        const o = document.createElement("option");
        o.value = t.key;
        o.textContent = t.key + " \u2014 " + t.label;
        translationSel.appendChild(o);
      });
      if (keepKey && [...translationSel.options].some((o) => o.value === keepKey)) {
        translationSel.value = keepKey;
      }
    }
    function buildBookSelect() {
      BIBLE_BOOKS.forEach(([name], i) => {
        const o = document.createElement("option");
        o.value = String(i + 1);
        o.textContent = name;
        bookSel.appendChild(o);
      });
    }
    function buildQuickBooks() {
      QUICK_BOOKS.forEach((name) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "quick-book";
        b.textContent = name;
        b.addEventListener("click", () => {
          const idx = BIBLE_BOOKS.findIndex((x) => x[0] === name);
          if (idx === -1) return;
          bookSel.value = String(idx + 1);
          onBookChange();
          document.querySelectorAll(".quick-book").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
        });
        quickBooks.appendChild(b);
      });
    }
    function onBookChange() {
      const id = parseInt(bookSel.value, 10);
      chapterSel.innerHTML = "";
      verseSel.innerHTML = "";
      if (!id) {
        chapterSel.disabled = verseSel.disabled = btnGoto.disabled = true;
        return;
      }
      const chapters = BIBLE_BOOKS[id - 1][2];
      for (let c = 1; c <= chapters; c++) {
        const o = document.createElement("option");
        o.value = String(c);
        o.textContent = String(c);
        chapterSel.appendChild(o);
      }
      chapterSel.disabled = false;
      onChapterChange();
    }
    async function onChapterChange() {
      const bookId = parseInt(bookSel.value, 10);
      const chapter = parseInt(chapterSel.value, 10);
      if (!bookId || !chapter) return;
      verseSel.innerHTML = '<option value="1">1</option>';
      verseSel.disabled = true;
      btnGoto.disabled = true;
      const count = await scripture.fetchVerseCount(currentTranslation(), bookId, chapter) || 50;
      verseSel.innerHTML = "";
      for (let v = 1; v <= count; v++) {
        const o = document.createElement("option");
        o.value = String(v);
        o.textContent = String(v);
        verseSel.appendChild(o);
      }
      verseSel.disabled = false;
      btnGoto.disabled = false;
    }
    function gotoFromPickers() {
      const bookId = parseInt(bookSel.value, 10);
      if (!bookId) return;
      const ref = buildReference(
        BIBLE_BOOKS[bookId - 1][0],
        chapterSel.value,
        verseSel.value
      );
      refInput.value = ref;
      lookup();
    }
    async function lookup(refOverride) {
      if (looking) return;
      const ref = (refOverride !== void 0 ? refOverride : refInput.value).trim();
      if (!ref) {
        setStatus("Enter a reference first.", "error");
        return;
      }
      looking = true;
      btnLookup.disabled = true;
      setStatus("Looking up " + ref + "\u2026", "loading");
      const result = await scripture.fetchVerse(ref, currentTranslation());
      looking = false;
      btnLookup.disabled = false;
      if (result.error) {
        setStatus(result.error, "error");
        return;
      }
      refInput.value = result.rawRef;
      verseText.value = result.text;
      currentPlainRef = result.rawRef;
      currentRefLabel = result.reference;
      hideSuggest();
      syncPickersTo(result);
      refresh();
      setStatus(result.reference, "success");
      if (autoShowCb.checked) session.show();
    }
    async function stepVerse(dir) {
      if (!currentPlainRef) return;
      setStatus(dir > 0 ? "Next verse\u2026" : "Previous verse\u2026", "loading");
      const next = await stepReference(currentPlainRef, dir, (bookId, chapter) => scripture.fetchVerseCount(currentTranslation(), bookId, chapter));
      if (!next) {
        setStatus("That is the end of the Bible.", "");
        return;
      }
      const result = await scripture.fetchVerse(next, currentTranslation());
      if (result.error) {
        setStatus(result.error, "error");
        return;
      }
      refInput.value = result.rawRef;
      verseText.value = result.text;
      currentPlainRef = result.rawRef;
      currentRefLabel = result.reference;
      syncPickersTo(result);
      refresh();
      setStatus(result.reference, "success");
      if (session.isLive || autoShowCb.checked) session.show();
    }
    function syncPickersTo(result) {
      if (!result.bookId) return;
      const book = BIBLE_BOOKS[result.bookId - 1][0];
      qrBook.value = book;
      qrChapter.value = result.chapter;
      qrVerse.value = result.endVerse ? `${result.verse}-${result.endVerse}` : result.verse;
      qrBookIdx = result.bookId - 1;
      bookSel.value = String(result.bookId);
      const chapters = BIBLE_BOOKS[result.bookId - 1][2];
      if (chapterSel.options.length !== chapters) {
        chapterSel.innerHTML = "";
        for (let c = 1; c <= chapters; c++) {
          const o = document.createElement("option");
          o.value = String(c);
          o.textContent = String(c);
          chapterSel.appendChild(o);
        }
        chapterSel.disabled = false;
      }
      chapterSel.value = String(result.chapter);
    }
    function showSuggest(names) {
      bookSuggest.innerHTML = "";
      suggestIdx = -1;
      if (!names.length) {
        hideSuggest();
        return;
      }
      names.forEach((name) => {
        const li = document.createElement("li");
        li.textContent = name;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          refInput.value = name + " ";
          hideSuggest();
          refInput.focus();
        });
        bookSuggest.appendChild(li);
      });
      bookSuggest.classList.remove("hidden");
    }
    function hideSuggest() {
      bookSuggest.classList.add("hidden");
      bookSuggest.innerHTML = "";
      suggestIdx = -1;
    }
    function moveSuggest(dir) {
      const items = [...bookSuggest.querySelectorAll("li")];
      if (!items.length) return;
      items.forEach((i) => i.classList.remove("highlight"));
      suggestIdx = (suggestIdx + dir + items.length) % items.length;
      items[suggestIdx].classList.add("highlight");
      items[suggestIdx].scrollIntoView({ block: "nearest" });
    }
    async function runScriptureSearch() {
      const q = scriptureSearch.value.trim();
      if (!q) {
        setStatus("Type something to search for.", "error");
        return;
      }
      setStatus("Searching " + currentTranslation() + "\u2026", "loading");
      const results = await scripture.searchScripture(currentTranslation(), q);
      if (results.error) {
        setStatus(results.error, "error");
        return;
      }
      if (!results.length) {
        searchResults.classList.add("hidden");
        setStatus('No results for "' + q + '".', "");
        return;
      }
      searchResults.innerHTML = "";
      results.forEach((r) => {
        const ref = buildReference(r.book, r.chapter, r.verse);
        const li = document.createElement("li");
        li.className = "search-result";
        const refSpan = document.createElement("span");
        refSpan.className = "search-result-ref";
        refSpan.textContent = ref;
        const txtSpan = document.createElement("span");
        txtSpan.className = "search-result-text";
        txtSpan.innerHTML = highlightMatch(r.text, q);
        li.appendChild(refSpan);
        li.appendChild(txtSpan);
        li.addEventListener("click", () => {
          refInput.value = ref;
          lookup(ref);
        });
        searchResults.appendChild(li);
      });
      searchResults.classList.remove("hidden");
      setStatus(results.length + " result" + (results.length !== 1 ? "s" : "") + ".", "success");
    }
    async function pickRandom() {
      setStatus("Picking a verse\u2026", "loading");
      const r = await scripture.randomReference(currentTranslation(), randomScope.value);
      if (r.error) {
        setStatus(r.error, "error");
        return;
      }
      refInput.value = r.reference;
      await lookup(r.reference);
    }
    btnLookup.addEventListener("click", () => lookup());
    refInput.addEventListener("input", () => {
      const val = refInput.value;
      if (/\d/.test(val)) {
        hideSuggest();
        return;
      }
      showSuggest(searchBooks(val));
    });
    refInput.addEventListener("keydown", (e) => {
      const open = !bookSuggest.classList.contains("hidden");
      if (e.key === "ArrowDown" && open) {
        e.preventDefault();
        moveSuggest(1);
      } else if (e.key === "ArrowUp" && open) {
        e.preventDefault();
        moveSuggest(-1);
      } else if (e.key === "Escape") {
        hideSuggest();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = bookSuggest.querySelector("li.highlight");
        if (open && hit) {
          refInput.value = hit.textContent + " ";
          hideSuggest();
        } else lookup();
      }
    });
    refInput.addEventListener("blur", () => setTimeout(hideSuggest, 120));
    let qrBookIdx = -1;
    function qrSetHint(msg, isError) {
      qrHint.textContent = msg;
      qrHint.classList.toggle("is-error", !!isError);
    }
    function qrResetHint() {
      qrSetHint("Type the book, chapter and verse \u2014 it jumps between boxes for you.", false);
    }
    function qrHideSuggest() {
      qrSuggest.classList.add("hidden");
      qrSuggest.innerHTML = "";
    }
    function qrShowSuggest(names) {
      qrSuggest.innerHTML = "";
      if (!names.length) {
        qrHideSuggest();
        return;
      }
      names.forEach((name, i) => {
        const li = document.createElement("li");
        li.textContent = name;
        if (i === 0) li.classList.add("highlight");
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          qrPickBook(name);
        });
        qrSuggest.appendChild(li);
      });
      qrSuggest.classList.remove("hidden");
    }
    function qrMoveSuggest(dir) {
      const items = [...qrSuggest.querySelectorAll("li")];
      if (!items.length) return;
      let i = items.findIndex((el) => el.classList.contains("highlight"));
      items.forEach((el) => el.classList.remove("highlight"));
      i = Math.max(0, Math.min(items.length - 1, i === -1 ? 0 : i + dir));
      items[i].classList.add("highlight");
    }
    function qrPickBook(name) {
      qrBook.value = name;
      qrBookIdx = bookIndexOf(name);
      qrHideSuggest();
      qrSetHint(qrBookIdx !== -1 ? `${BIBLE_BOOKS[qrBookIdx][0]} \u2014 ${BIBLE_BOOKS[qrBookIdx][2]} chapters` : `No book called "${name}".`, qrBookIdx === -1);
      if (qrBookIdx !== -1) qrChapter.focus();
    }
    function qrResolveBook() {
      qrBookIdx = bookIndexOf(qrBook.value);
      return qrBookIdx;
    }
    function qrLookup() {
      if (qrResolveBook() === -1) {
        qrSetHint(qrBook.value.trim() ? `No book called "${qrBook.value.trim()}".` : "Type a book name first.", true);
        qrBook.focus();
        return;
      }
      const [name, , chapters] = BIBLE_BOOKS[qrBookIdx];
      const ch = parseInt(qrChapter.value, 10);
      if (!ch || ch < 1 || ch > chapters) {
        qrSetHint(`${name} has ${chapters} chapter${chapters !== 1 ? "s" : ""}.`, true);
        qrChapter.focus();
        qrChapter.select();
        return;
      }
      const raw = qrVerse.value.trim();
      const m = raw.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) {
        qrSetHint("Enter a verse number, or a range like 28-30.", true);
        qrVerse.focus();
        qrVerse.select();
        return;
      }
      qrResetHint();
      const ref = buildReference(
        name,
        ch,
        parseInt(m[1], 10),
        m[2] ? parseInt(m[2], 10) : null
      );
      refInput.value = ref;
      lookup(ref);
    }
    qrBook.addEventListener("input", () => {
      qrBookIdx = -1;
      qrShowSuggest(searchBooks(qrBook.value.trim()));
    });
    qrBook.addEventListener("keydown", (e) => {
      const open = !qrSuggest.classList.contains("hidden");
      if (e.key === "ArrowDown" && open) {
        e.preventDefault();
        qrMoveSuggest(1);
      } else if (e.key === "ArrowUp" && open) {
        e.preventDefault();
        qrMoveSuggest(-1);
      } else if (e.key === "Escape") {
        qrHideSuggest();
      } else if (e.key === "Enter" || e.key === "Tab") {
        const hit = open ? qrSuggest.querySelector("li.highlight") : null;
        if (hit) {
          e.preventDefault();
          qrPickBook(hit.textContent);
        } else if (e.key === "Enter") {
          e.preventDefault();
          qrPickBook(qrBook.value.trim());
        }
      }
    });
    qrBook.addEventListener("blur", () => setTimeout(() => {
      qrHideSuggest();
      if (qrBook.value.trim() && qrResolveBook() === -1) {
        qrSetHint(`No book called "${qrBook.value.trim()}".`, true);
      }
    }, 120));
    qrChapter.addEventListener("input", () => {
      qrChapter.value = qrChapter.value.replace(/\D/g, "");
      if (qrResolveBook() === -1) return;
      const chapters = BIBLE_BOOKS[qrBookIdx][2];
      const n = parseInt(qrChapter.value, 10);
      if (!n) return;
      if (n > chapters) {
        qrSetHint(`${BIBLE_BOOKS[qrBookIdx][0]} has ${chapters} chapters.`, true);
        return;
      }
      qrResetHint();
      if (n * 10 > chapters) qrVerse.focus();
    });
    qrChapter.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        qrVerse.focus();
      } else if (e.key === "Backspace" && !qrChapter.value) {
        qrBook.focus();
      }
    });
    qrVerse.addEventListener("input", () => {
      qrVerse.value = qrVerse.value.replace(/[^\d-]/g, "");
    });
    qrVerse.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        qrLookup();
      } else if (e.key === "Backspace" && !qrVerse.value) {
        qrChapter.focus();
      }
    });
    qrGo.addEventListener("click", qrLookup);
    qrResetHint();
    languageSel.addEventListener("change", () => {
      buildTranslationSelect();
      saveCurrentSettings();
    });
    translationSel.addEventListener("change", () => {
      saveCurrentSettings();
      if (chapterSel.value) onChapterChange();
      if (currentPlainRef) lookup(currentPlainRef);
    });
    bookSel.addEventListener("change", onBookChange);
    chapterSel.addEventListener("change", onChapterChange);
    btnGoto.addEventListener("click", gotoFromPickers);
    verseText.addEventListener("input", refresh);
    autoShowCb.addEventListener("change", saveCurrentSettings);
    btnScriptureSearch.addEventListener("click", runScriptureSearch);
    scriptureSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runScriptureSearch();
      }
    });
    btnRandom.addEventListener("click", pickRandom);
    buildLanguageSelect();
    buildTranslationSelect("KJV");
    buildBookSelect();
    buildQuickBooks();
    return {
      getContent: () => ({ body: verseText.value.trim(), reference: currentRefLabel }),
      hasText: () => verseText.value.trim().length > 0,
      plainRef: () => currentPlainRef,
      step: stepVerse,
      buildTranslationSelect,
      setLanguage(lang) {
        if (LANGUAGES.includes(lang)) languageSel.value = lang;
      },
      setAutoShow(on) {
        autoShowCb.checked = !!on;
      },
      autoShow: () => autoShowCb.checked
    };
  }

  // src/songs/lyrics-file.js
  var LYRICS_FILENAME = "lyrics.txt";
  var LYRICS_HEADER = "#OBS-LYRICS-V1";
  var DELIMITER = "=".repeat(10);
  var DELIMITER_RE = /^={3,}\s*$/;
  var BACKSLASH = String.fromCharCode(92);
  var oneLine = (text) => (text || "").replace(/\s+/g, " ").trim();
  var escapeLine = (line) => line === "" || line.startsWith(BACKSLASH) || DELIMITER_RE.test(line) ? BACKSLASH + line : line;
  var unescapeLine = (line) => line.startsWith(BACKSLASH) ? line.slice(1) : line;
  function buildLyricsFile(songs) {
    const blocks = songs.map((song) => {
      const lines = [escapeLine(oneLine(song.title) || "Untitled")];
      for (const slide of song.slides) {
        lines.push("");
        for (const line of slide.replace(/\r\n?/g, "\n").split("\n")) lines.push(escapeLine(line));
      }
      return lines.join("\n");
    });
    return `${LYRICS_HEADER}

${blocks.join(`

${DELIMITER}

`)}
`;
  }
  function isLyricsFile(text) {
    const first = text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim() !== "");
    return first !== void 0 && first.trim() === LYRICS_HEADER;
  }
  function parseBlock(lines) {
    let i = 0;
    while (i < lines.length && lines[i] === "") i += 1;
    if (i >= lines.length) return null;
    const title = unescapeLine(lines[i]);
    const slides = [];
    let current = null;
    for (i += 1; i < lines.length; i += 1) {
      if (lines[i] === "") {
        if (current) {
          slides.push(current.join("\n"));
          current = null;
        }
        continue;
      }
      (current ?? (current = [])).push(unescapeLine(lines[i]));
    }
    if (current) slides.push(current.join("\n"));
    return { title, altTitle: null, slides };
  }
  function parseLyricsFile(text) {
    const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
    const start = lines.findIndex((line) => line.trim() === LYRICS_HEADER) + 1;
    const songs = [];
    let block = [];
    const flush = () => {
      const song = parseBlock(block);
      if (song) songs.push(song);
      block = [];
    };
    for (const line of lines.slice(start)) {
      if (DELIMITER_RE.test(line)) flush();
      else block.push(line);
    }
    flush();
    return songs;
  }

  // src/songs/parse.js
  function parseTxt(text, filename) {
    const filenameFallback = filename.replace(/\.txt$/i, "").replace(/_/g, " ").trim() || "Imported Song";
    const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = norm.split("\n");
    const labelRe = /^(verse|chorus|bridge|pre-?chorus|outro|intro|tag|hook|refrain|repeat|interlude|coda|ending)\s*\d*\s*:?\s*$/i;
    const sepRe = /^[-=]{3,}\s*$/;
    function slidesFromLines(bodyLines2) {
      const slides = [];
      let current = [];
      bodyLines2.forEach((line) => {
        if (labelRe.test(line.trim())) {
          if (current.length) {
            slides.push(current.join("\n"));
            current = [];
          }
        } else if (line.trim() === "") {
          if (current.length) {
            slides.push(current.join("\n"));
            current = [];
          }
        } else current.push(line);
      });
      if (current.length) slides.push(current.join("\n"));
      return slides.length ? slides : [""];
    }
    const headerRe = /^([a-zA-Z ]+)\s*:\s*(.+)$/;
    let headerTitle = null, headerEnd = 0;
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      const m = lines[i].match(headerRe);
      if (m) {
        if (/^title$/i.test(m[1].trim())) headerTitle = m[2].trim();
        headerEnd = i + 1;
      } else if (lines[i].trim() === "") break;
      else {
        headerEnd = 0;
        break;
      }
    }
    const title = filenameFallback;
    let altTitle = null, bodyLines;
    if (headerTitle) {
      altTitle = filenameFallback.toLowerCase() !== headerTitle.toLowerCase() ? headerTitle : null;
      bodyLines = lines.slice(headerEnd);
    } else {
      const firstNonBlank = lines.findIndex((l) => l.trim() !== "");
      const candidate = firstNonBlank !== -1 ? lines[firstNonBlank].trim() : "";
      const nextLine = firstNonBlank !== -1 ? (lines[firstNonBlank + 1] || "").trim() : "";
      if (candidate.length > 0 && candidate.length <= 120 && !labelRe.test(candidate)) {
        altTitle = filenameFallback.toLowerCase() !== candidate.toLowerCase() ? candidate : null;
        bodyLines = lines.slice(nextLine === "" ? firstNonBlank + 2 : firstNonBlank + 1);
      } else {
        bodyLines = lines;
      }
    }
    const sepIdx = bodyLines.findIndex((l) => sepRe.test(l));
    if (sepIdx !== -1) bodyLines = bodyLines.slice(0, sepIdx);
    return [{ title, altTitle, slides: slidesFromLines(bodyLines) }];
  }
  function parseCsv(text) {
    const sep = text.includes("	") ? "	" : ",";
    const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((r) => r.trim());
    if (rows.length < 2) return [];
    function parseRow(line) {
      const fields = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === sep && !inQ) {
          fields.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      fields.push(cur.trim());
      return fields;
    }
    const headers = parseRow(rows[0]).map((h) => h.toLowerCase());
    const titleIdx = headers.findIndex((h) => h === "title" || h === "song" || h === "name");
    if (titleIdx === -1) return [];
    const result = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = parseRow(rows[i]);
      const title = cols[titleIdx] || "";
      if (!title) continue;
      const lyricsIdx = headers.findIndex((h) => h === "lyrics" || h === "text" || h === "words");
      let slides = [];
      if (lyricsIdx !== -1 && cols[lyricsIdx]) {
        slides = cols[lyricsIdx].replace(/\\n/g, "\n").split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
      } else {
        for (let c = 0; c < cols.length; c++) if (c !== titleIdx && cols[c].trim()) slides.push(cols[c].trim());
      }
      if (slides.length === 0) slides.push("");
      result.push({ title, slides });
    }
    return result;
  }
  function parseJsonSongs(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && Array.isArray(data.songs) ? data.songs : [];
    return list.filter(looksLikeSong);
  }
  function parseSongFile(name, text) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".json")) return parseJsonSongs(text);
    if (lower.endsWith(".txt")) return isLyricsFile(text) ? parseLyricsFile(text) : parseTxt(text, name);
    if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return parseCsv(text);
    return [];
  }

  // src/songs/duplicates.js
  function findDuplicateGroups(songs) {
    const groups = /* @__PURE__ */ new Map();
    for (const song of songs) {
      const key = normalizeTitle(song.title);
      if (!key) continue;
      groups.set(key, [...groups.get(key) || [], song]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }
  function pickRemovals(groups) {
    const ids = /* @__PURE__ */ new Set();
    for (const group of groups) {
      const keeper = group.reduce((best, s) => s.slides.length > best.slides.length ? s : best, group[0]);
      for (const s of group) if (s.id !== keeper.id) ids.add(s.id);
    }
    return ids;
  }

  // src/dock/songs-tab.js
  function initSongsTab({ session, library, setStatus, refresh, report: report2 }) {
    const libSearch = $("lib-search"), btnNewSong = $("btn-new-song"), songList = $("song-list"), editorTitle = $("editor-title"), songTitleInput = $("song-title-input"), slideList = $("slide-list"), slideTextarea = $("slide-textarea"), btnAddSlide = $("btn-add-slide"), btnUpdateSlide = $("btn-update-slide"), btnDeleteSlide = $("btn-delete-slide"), btnSaveSong = $("btn-save-song"), btnDeleteSong = $("btn-delete-song"), btnExport = $("btn-export"), btnRemoveDuplicates = $("btn-remove-duplicates"), btnClearAllSongs = $("btn-clear-all-songs"), btnImportFile = $("btn-import-file"), btnImportFolder = $("btn-import-folder"), importFileInput = $("import-file-input"), importFolderInput = $("import-folder-input"), importPanel = $("import-panel"), importPanelTitle = $("import-panel-title"), importPanelHint = $("import-panel-hint"), importSongList = $("import-song-list"), btnImportConfirm = $("btn-import-confirm"), btnImportCancel = $("btn-import-cancel"), btnImportClose = $("btn-import-close");
    let activeSongId = null;
    let activeSlideIdx = null;
    let currentSlideIdx = -1;
    let libFilter = "";
    let libSearchMode = "title";
    let _pendingImport = [];
    const getActiveSong = () => library.get(activeSongId);
    const STOP_WORDS = /* @__PURE__ */ new Set([
      "verse",
      "verse1",
      "verse2",
      "verse3",
      "verse4",
      "chorus",
      "prechorus",
      "pre-chorus",
      "bridge",
      "intro",
      "outro",
      "tag",
      "hook",
      "refrain",
      "repeat",
      "interlude",
      "coda",
      "ending",
      "instrumental"
    ]);
    function stripStopWords(text) {
      return text.toLowerCase().split(/\s+/).filter((w) => !STOP_WORDS.has(w.replace(/[^a-z0-9]/g, ""))).join(" ");
    }
    function lyricExcerpt(song, q) {
      for (const slide of song.slides) {
        const idx = slide.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 30);
        const end = Math.min(slide.length, idx + q.length + 30);
        return highlightMatch(
          (start > 0 ? "\u2026" : "") + slide.slice(start, end) + (end < slide.length ? "\u2026" : ""),
          q
        );
      }
      return null;
    }
    function renderSongList() {
      const q = libFilter.toLowerCase().trim();
      songList.innerHTML = "";
      const dupIds = new Set(findDuplicateGroups(library.list()).flat().map((s) => s.id));
      const filtered = library.list().filter((s) => {
        if (!q) return true;
        if (libSearchMode === "lyrics") {
          return s.slides.some((sl) => sl.toLowerCase().includes(q) || stripStopWords(sl).includes(q));
        }
        if (s.title.toLowerCase().includes(q)) return true;
        if (s.altTitle && s.altTitle.toLowerCase().includes(q)) return true;
        return false;
      });
      if (filtered.length === 0 && q) {
        const empty = document.createElement("li");
        empty.className = "song-list-empty";
        empty.textContent = 'No songs match "' + q + '"';
        songList.appendChild(empty);
        return;
      }
      filtered.forEach((song) => {
        const li = document.createElement("li");
        li.className = "song-item" + (song.id === activeSongId ? " active" : "") + (dupIds.has(song.id) ? " is-duplicate" : "");
        const titleMatch = q && libSearchMode === "title" && song.title.toLowerCase().includes(q);
        const altMatch = q && libSearchMode === "title" && song.altTitle && song.altTitle.toLowerCase().includes(q);
        const lyricMatch = q && libSearchMode === "lyrics" && song.slides.some((sl) => sl.toLowerCase().includes(q) || stripStopWords(sl).includes(q));
        const titleSpan = document.createElement("span");
        titleSpan.className = "song-item-title";
        if (titleMatch) titleSpan.innerHTML = highlightMatch(song.title || "(Untitled)", q);
        else titleSpan.textContent = song.title || "(Untitled)";
        if (dupIds.has(song.id)) {
          const badge = document.createElement("span");
          badge.className = "song-item-dup-badge";
          badge.textContent = "DUPLICATE";
          titleSpan.appendChild(badge);
        }
        const countSpan = document.createElement("span");
        countSpan.className = "song-item-count";
        countSpan.textContent = song.slides.length + " slide" + (song.slides.length !== 1 ? "s" : "");
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "song-item-delete";
        deleteBtn.type = "button";
        deleteBtn.textContent = "\u2715";
        deleteBtn.title = "Delete this song";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm('Delete "' + (song.title || "Untitled") + '"? This cannot be undone.')) {
            deleteSongById(song.id);
          }
        });
        li.appendChild(titleSpan);
        li.appendChild(countSpan);
        li.appendChild(deleteBtn);
        if (song.altTitle) {
          const alias = document.createElement("span");
          alias.className = "song-item-alias";
          if (altMatch) alias.innerHTML = "\u{1F4C4} " + highlightMatch(song.altTitle, q);
          else alias.textContent = "\u{1F4C4} " + song.altTitle;
          li.appendChild(alias);
        }
        if (lyricMatch) {
          const excerpt = lyricExcerpt(song, q);
          if (excerpt) {
            const span = document.createElement("span");
            span.className = "song-item-excerpt";
            span.innerHTML = excerpt;
            li.appendChild(span);
          }
        }
        li.addEventListener("click", () => loadSongIntoEditor(song.id));
        songList.appendChild(li);
      });
    }
    function loadSongIntoEditor(id) {
      activeSongId = id;
      activeSlideIdx = null;
      currentSlideIdx = -1;
      const song = getActiveSong();
      if (!song) return;
      editorTitle.textContent = "Editor \u2014 " + (song.title || "Untitled");
      songTitleInput.value = song.title || "";
      btnDeleteSong.disabled = false;
      slideTextarea.value = "";
      btnUpdateSlide.disabled = true;
      btnDeleteSlide.disabled = true;
      renderSlideChips();
      renderSongList();
      refresh();
    }
    function renderSlideChips() {
      slideList.innerHTML = "";
      const song = getActiveSong();
      if (!song) return;
      song.slides.forEach((text, idx) => {
        const chip = document.createElement("button");
        chip.className = "slide-chip" + (idx === activeSlideIdx ? " active" : "");
        chip.textContent = (text.split("\n")[0] || "Slide " + (idx + 1)).slice(0, 30);
        chip.title = text;
        chip.addEventListener("click", () => selectSlide(idx));
        slideList.appendChild(chip);
      });
    }
    function selectSlide(idx) {
      const song = getActiveSong();
      if (!song) return;
      activeSlideIdx = idx;
      slideTextarea.value = song.slides[idx] || "";
      btnUpdateSlide.disabled = false;
      btnDeleteSlide.disabled = false;
      renderSlideChips();
      refresh();
    }
    function newSong() {
      activeSongId = activeSlideIdx = null;
      currentSlideIdx = -1;
      editorTitle.textContent = "Editor \u2014 New Song";
      songTitleInput.value = "";
      slideList.innerHTML = "";
      slideTextarea.value = "";
      btnDeleteSong.disabled = true;
      btnUpdateSlide.disabled = true;
      btnDeleteSlide.disabled = true;
      renderSongList();
      refresh();
    }
    async function saveSong() {
      const title = songTitleInput.value.trim() || "Untitled";
      const existing = getActiveSong();
      const saved = await library.save({ ...existing || { slides: [] }, id: existing?.id, title });
      activeSongId = saved.id;
      editorTitle.textContent = "Editor \u2014 " + title;
      btnDeleteSong.disabled = false;
      renderSongList();
      renderSlideChips();
      setStatus("Song saved.", "success");
    }
    async function deleteSongById(id) {
      const song = library.get(id);
      if (!song) return;
      await library.remove(id);
      if (id === activeSongId) newSong();
      else renderSongList();
      setStatus('Deleted "' + (song.title || "Untitled") + '".', "");
    }
    async function clearAllSongs() {
      const count = library.list().length;
      if (count === 0) {
        setStatus("Library is already empty.", "");
        return;
      }
      const inFolder = library.mode() === "folder";
      if (!confirm("Delete ALL " + count + " song" + (count !== 1 ? "s" : "") + " from the library?\n\n" + (inFolder ? "Their files in the library folder will be deleted too. " : "") + "This cannot be undone. If you have not backed up, click Cancel, use the \u2193 JSON button first, then come back.")) return;
      if (prompt("To confirm, type DELETE below:") !== "DELETE") {
        setStatus("Clear cancelled \u2014 nothing was deleted.", "");
        return;
      }
      await library.clearAll();
      activeSongId = null;
      newSong();
      setStatus("Library cleared. Import your songs again to bring them back.", "success");
    }
    async function removeDuplicates() {
      const groups = findDuplicateGroups(library.list());
      if (groups.length === 0) {
        setStatus("No duplicate songs found.", "");
        return;
      }
      const totalExtra = groups.reduce((n, g) => n + (g.length - 1), 0);
      if (!confirm("Found " + groups.length + " title" + (groups.length !== 1 ? "s" : "") + " with duplicates (" + totalExtra + " extra cop" + (totalExtra !== 1 ? "ies" : "y") + ").\n\nFor each, the version with the most slides will be kept and the rest deleted. This cannot be undone.")) return;
      const ids = pickRemovals(groups);
      const activeRemoved = activeSongId && ids.has(activeSongId);
      await library.removeMany([...ids]);
      if (activeRemoved) newSong();
      else renderSongList();
      setStatus("Removed " + ids.size + " duplicate song" + (ids.size !== 1 ? "s" : "") + ".", "success");
    }
    async function addSlide() {
      const text = slideTextarea.value;
      if (!text.trim()) {
        setStatus("Enter slide text first.", "error");
        return;
      }
      const existing = getActiveSong();
      const saved = await library.save({
        ...existing || { title: songTitleInput.value.trim() || "Untitled" },
        id: existing?.id,
        slides: [...existing ? existing.slides : [], text]
      });
      activeSongId = saved.id;
      activeSlideIdx = saved.slides.length - 1;
      btnDeleteSong.disabled = false;
      slideTextarea.value = "";
      renderSlideChips();
      renderSongList();
      refresh();
      setStatus("Slide added.", "success");
    }
    async function updateSlide() {
      const song = getActiveSong();
      if (!song || activeSlideIdx === null) return;
      await library.save({ ...song, slides: song.slides.map((s, i) => i === activeSlideIdx ? slideTextarea.value : s) });
      renderSlideChips();
      if (session.isLive && session.liveTab === "songs" && currentSlideIdx === activeSlideIdx) session.resendIfLive();
      setStatus("Slide updated.", "success");
    }
    async function deleteSlide() {
      const song = getActiveSong();
      if (!song || activeSlideIdx === null) return;
      await library.save({ ...song, slides: song.slides.filter((_, i) => i !== activeSlideIdx) });
      activeSlideIdx = null;
      slideTextarea.value = "";
      btnUpdateSlide.disabled = true;
      btnDeleteSlide.disabled = true;
      renderSlideChips();
      renderSongList();
      refresh();
      setStatus("Slide deleted.", "");
    }
    async function confirmImport() {
      const toAdd = _pendingImport.filter((s) => s._selected);
      if (toAdd.length === 0) {
        setStatus("No songs selected.", "error");
        return;
      }
      const { added, replaced } = await library.upsertByTitle(
        toAdd.map(({ title, altTitle, slides }) => ({ title, altTitle, slides }))
      );
      renderSongList();
      closeImportPanel();
      const parts = [];
      if (added) parts.push(added + " added");
      if (replaced) parts.push(replaced + " updated");
      setStatus(parts.join(", ") + ".", "success");
    }
    async function processFiles(files, sourceLabel) {
      const all = [];
      const failed = [];
      for (const file of files) {
        try {
          all.push(...parseSongFile(file.name, await readFileAsText(file)));
        } catch (err) {
          report2(err);
          failed.push(file.name);
        }
      }
      const failedMessage = "Could not read " + failed.join(", ") + ".";
      if (all.length === 0 && failed.length) {
        setStatus(failedMessage, "error");
        return;
      }
      showImportPreview(all, sourceLabel);
      if (failed.length) setStatus(failedMessage, "error");
    }
    function navigateSlide(dir) {
      const song = getActiveSong();
      if (!song || song.slides.length === 0) return;
      let target = currentSlideIdx < 0 ? dir > 0 ? 0 : song.slides.length - 1 : currentSlideIdx + dir;
      target = Math.max(0, Math.min(song.slides.length - 1, target));
      activeSlideIdx = currentSlideIdx = target;
      renderSlideChips();
      refresh();
      session.show();
    }
    function exportSongs() {
      if (library.list().length === 0) {
        setStatus("No songs to export.", "error");
        return;
      }
      const blob = new Blob([JSON.stringify({ version: 1, songs: library.list() }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stage-songs-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("Exported " + library.list().length + " songs.", "success");
    }
    function showImportPreview(incoming, sourceLabel) {
      if (!incoming || incoming.length === 0) {
        setStatus("No songs found in those files.", "error");
        return;
      }
      _pendingImport = incoming.map((s) => ({
        ...s,
        _exists: library.list().some((e) => normalizeTitle(e.title) === normalizeTitle(s.title)),
        _selected: true
      }));
      const newCount = _pendingImport.filter((s) => !s._exists).length;
      const conCount = _pendingImport.filter((s) => s._exists).length;
      importPanelTitle.textContent = "Import Preview \u2014 " + sourceLabel;
      importPanelHint.textContent = _pendingImport.length + " found \xB7 " + newCount + " new \xB7 " + conCount + " already exist";
      importSongList.innerHTML = "";
      _pendingImport.forEach((song, idx) => {
        const li = document.createElement("li");
        li.className = "import-song-item" + (song._exists ? " conflict" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !song._exists;
        cb.id = "isc-" + idx;
        cb.addEventListener("change", () => {
          _pendingImport[idx]._selected = cb.checked;
        });
        _pendingImport[idx]._selected = !song._exists;
        const label = document.createElement("label");
        label.htmlFor = "isc-" + idx;
        const ts = document.createElement("span");
        ts.className = "isc-title";
        ts.textContent = song.title;
        const ms = document.createElement("span");
        ms.className = "isc-meta";
        ms.textContent = song.slides.length + " slides" + (song._exists ? " \xB7 already exists" : "");
        label.appendChild(ts);
        label.appendChild(ms);
        li.appendChild(cb);
        li.appendChild(label);
        importSongList.appendChild(li);
      });
      importPanel.classList.remove("hidden");
    }
    function closeImportPanel() {
      importPanel.classList.add("hidden");
      importSongList.innerHTML = "";
      _pendingImport = [];
      importFileInput.value = "";
      importFolderInput.value = "";
    }
    function readFileAsText(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target.result);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsText(file);
      });
    }
    libSearch.addEventListener("input", () => {
      libFilter = libSearch.value.trim();
      renderSongList();
    });
    document.querySelectorAll(".search-toggle .toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".search-toggle .toggle-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        libSearchMode = btn.dataset.mode;
        renderSongList();
      });
    });
    btnNewSong.addEventListener("click", newSong);
    btnSaveSong.addEventListener("click", saveSong);
    btnDeleteSong.addEventListener("click", () => {
      const s = getActiveSong();
      if (s && confirm('Delete "' + s.title + '"?')) deleteSongById(s.id);
    });
    btnRemoveDuplicates.addEventListener("click", removeDuplicates);
    btnClearAllSongs.addEventListener("click", clearAllSongs);
    btnAddSlide.addEventListener("click", addSlide);
    btnUpdateSlide.addEventListener("click", updateSlide);
    btnDeleteSlide.addEventListener("click", deleteSlide);
    slideTextarea.addEventListener("input", refresh);
    btnExport.addEventListener("click", exportSongs);
    btnImportFile.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", async (e) => {
      const f = Array.from(e.target.files);
      if (f.length) await processFiles(f, f.length === 1 ? f[0].name : f.length + " files");
    });
    btnImportFolder.addEventListener("click", () => importFolderInput.click());
    importFolderInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files).filter((f) => {
        const n = f.name.toLowerCase();
        return n.endsWith(".txt") || n.endsWith(".json") || n.endsWith(".csv") || n.endsWith(".tsv");
      });
      if (files.length === 0) {
        setStatus("No compatible files in that folder.", "error");
        return;
      }
      const folderName = files[0].webkitRelativePath.split("/")[0] || "folder";
      await processFiles(files, folderName + " (" + files.length + " files)");
    });
    btnImportConfirm.addEventListener("click", confirmImport);
    btnImportCancel.addEventListener("click", closeImportPanel);
    btnImportClose.addEventListener("click", closeImportPanel);
    renderSongList();
    return {
      currentSlide() {
        const song = getActiveSong();
        const lines = activeSlideIdx !== null && song ? song.slides[activeSlideIdx] || "" : slideTextarea.value.trim();
        return { lines, canNav: !!(song && song.slides.length) };
      },
      navigate: navigateSlide,
      markShown() {
        currentSlideIdx = activeSlideIdx !== null ? activeSlideIdx : -1;
      },
      resetPosition() {
        currentSlideIdx = -1;
      },
      getContent() {
        const song = getActiveSong();
        const { lines } = this.currentSlide();
        return { title: (song ? song.title : songTitleInput.value.trim()) || "", body: lines };
      },
      refreshList: renderSongList
    };
  }

  // src/songs/folder.js
  var HANDLE_KEY = "library-dir";
  var BACKSLASH2 = String.fromCharCode(92);
  function safeFilename(title) {
    return (title || "untitled").replace(/[<>:"/|?*\x00-\x1f]/g, "_").split(BACKSLASH2).join("_").replace(/\s+/g, "_").replace(/_+/g, "_").slice(0, 80).replace(/^_+|_+$/g, "") || "song";
  }
  function createSongFolder(dirHandle) {
    const fileOf = /* @__PURE__ */ new Map();
    const occupied = /* @__PURE__ */ new Set();
    async function writeText(name, text) {
      const handle = await dirHandle.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(text);
        await writable.close();
      } catch (err) {
        try {
          await writable.abort();
        } catch {
        }
        throw err;
      }
    }
    async function removeFile(name) {
      try {
        await dirHandle.removeEntry(name);
      } catch (err) {
        if (err.name !== "NotFoundError") throw err;
      }
    }
    function unusedName(base, id) {
      const taken = new Set(occupied);
      for (const [otherId, name2] of fileOf) if (otherId !== id) taken.add(name2.toLowerCase());
      let name = `${base}.json`;
      let n = 2;
      while (taken.has(name.toLowerCase())) {
        name = `${base} (${n}).json`;
        n += 1;
      }
      return name;
    }
    async function list() {
      const songs = [];
      const errors = [];
      fileOf.clear();
      occupied.clear();
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".json")) continue;
        try {
          const file = await entry.getFile();
          const data = JSON.parse(await file.text());
          if (!isSongRecord(data)) throw new Error("Not a song file");
          songs.push(toSongRecord(data));
          fileOf.set(data.id, entry.name);
        } catch (err) {
          occupied.add(entry.name.toLowerCase());
          errors.push({ file: entry.name, message: err.message });
        }
      }
      return { songs, errors };
    }
    async function write(song) {
      const record = toSongRecord(song);
      const previous = fileOf.get(record.id);
      const name = unusedName(safeFilename(record.title), record.id);
      await writeText(name, JSON.stringify(record, null, 2));
      fileOf.set(record.id, name);
      if (previous && previous !== name) await removeFile(previous);
    }
    async function remove(id) {
      const name = fileOf.get(id);
      if (!name) return;
      await removeFile(name);
      fileOf.delete(id);
    }
    async function writeLyrics(songs) {
      await writeText(LYRICS_FILENAME, buildLyricsFile(songs));
    }
    return { name: dirHandle.name, list, write, remove, writeLyrics };
  }
  async function ensurePermission(handle, { request = false } = {}) {
    if (typeof handle.queryPermission !== "function") return true;
    const options = { mode: "readwrite" };
    if (await handle.queryPermission(options) === "granted") return true;
    if (!request || typeof handle.requestPermission !== "function") return false;
    return await handle.requestPermission(options) === "granted";
  }
  var saveHandle = (kv, handle) => kv.set(HANDLE_KEY, handle);
  var loadHandle = (kv) => kv.get(HANDLE_KEY);

  // src/dock/library-ui.js
  var PICKER_ID = "obs-songs";
  function initLibraryUI({ library, kv, setStatus, onChange, report: report2 }) {
    const banner = $("library-banner"), label = $("output-folder-label"), btnChoose = $("btn-set-folder"), btnReconnect = $("btn-reconnect-folder"), btnRewrite = $("btn-save-all-txt"), btnStop = $("btn-clear-folder");
    let pendingHandle = null;
    function render() {
      const mode = library.mode();
      banner.classList.toggle("hidden", mode === "folder");
      banner.classList.toggle("is-lost", mode === "folder-lost");
      banner.textContent = mode === "folder-lost" ? "Lost access to the song folder \u2014 songs are safe in this browser. Click Reconnect." : "Songs are saved in this browser only. Choose a folder to keep them as files and a lyrics.txt.";
      label.textContent = mode === "folder" ? "\u{1F4C2} " + (pendingHandle?.name || "Song folder") : mode === "folder-lost" ? "\u26A0 Folder not connected" : "Songs are stored in this browser only";
      btnReconnect.style.display = mode === "folder-lost" ? "" : "none";
      btnStop.style.display = mode === "folder" ? "" : "none";
      btnRewrite.disabled = mode !== "folder";
      btnChoose.textContent = mode === "folder" ? "Change Folder" : "Choose Folder";
      onChange();
    }
    async function attach(handle, successMessage) {
      const result = await library.attachFolder(createSongFolder(handle));
      pendingHandle = handle;
      await saveHandle(kv, handle);
      result.errors.forEach((e) => report2(new Error(e.file + ": " + e.message)));
      const skipped = result.errors.length ? ` ${result.errors.length} file(s) were skipped (see Diagnostics).` : "";
      setStatus(`${successMessage} ${result.loaded} song(s) loaded, ${result.carried} added.${skipped}`, "success");
      render();
    }
    btnChoose.addEventListener("click", async () => {
      if (!window.showDirectoryPicker) {
        setStatus("This browser cannot pick folders.", "error");
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ id: PICKER_ID, mode: "readwrite" });
        await attach(handle, "Song folder: " + handle.name + ".");
      } catch (err) {
        if (err.name !== "AbortError") {
          report2(err);
          setStatus("Could not open that folder.", "error");
        }
      }
    });
    btnReconnect.addEventListener("click", async () => {
      try {
        if (pendingHandle && await ensurePermission(pendingHandle, { request: true })) {
          await attach(pendingHandle, "Reconnected.");
        } else {
          btnChoose.click();
        }
      } catch (err) {
        report2(err);
        setStatus("Could not reconnect to the folder.", "error");
      }
    });
    btnRewrite.addEventListener("click", async () => {
      await library.rewriteLyrics();
      const ok = library.mode() === "folder";
      setStatus(ok ? "lyrics.txt rewritten." : "Folder not connected.", ok ? "success" : "error");
      render();
    });
    btnStop.addEventListener("click", () => {
      library.detach();
      pendingHandle = null;
      setStatus("No longer using the folder. Songs stay in this browser.", "");
      render();
    });
    async function restore() {
      render();
      try {
        const handle = await loadHandle(kv);
        if (!handle) return;
        pendingHandle = handle;
        if (await ensurePermission(handle)) await attach(handle, "Song folder restored.");
        else {
          library.markLost();
          render();
        }
      } catch (err) {
        report2(err);
        library.markLost();
        render();
      }
    }
    return { restore, render };
  }

  // src/dock/stream-controls.js
  function initStreamControls({ session, scriptureTab, songsTab, setStatus }) {
    const previewLines = $("preview-lines"), btnPrev = $("btn-prev"), btnShow = $("btn-show"), btnHide = $("btn-hide"), btnNext = $("btn-next"), btnClear = $("btn-clear");
    function refresh() {
      if (session.activeTab === "scripture") {
        const has = scriptureTab.hasText();
        const content = scriptureTab.getContent();
        btnShow.disabled = !has;
        btnHide.disabled = !session.isLive;
        btnPrev.disabled = !scriptureTab.plainRef();
        btnNext.disabled = !scriptureTab.plainRef();
        previewLines.textContent = has ? content.body + (content.reference ? "\n\u2014 " + content.reference : "") : "Look up a verse to preview\u2026";
      } else if (songsTab) {
        const { lines, canNav } = songsTab.currentSlide();
        btnShow.disabled = !lines;
        btnHide.disabled = !session.isLive;
        btnPrev.disabled = !canNav;
        btnNext.disabled = !canNav;
        previewLines.textContent = lines || "Pick a slide to preview\u2026";
      }
    }
    function navigate(dir) {
      if (session.activeTab === "scripture") scriptureTab.step(dir);
      else if (songsTab) songsTab.navigate(dir);
    }
    btnShow.addEventListener("click", () => {
      if (session.activeTab === "scripture") {
        if (!scriptureTab.hasText()) {
          setStatus("Look up a verse first.", "error");
          return;
        }
      } else {
        if (!songsTab || !songsTab.currentSlide().lines) {
          setStatus("No slide text to display.", "error");
          return;
        }
        songsTab.markShown();
      }
      session.show();
      setStatus(session.activeTab === "scripture" ? "Verse is live." : "Slide is live.", "success");
    });
    btnHide.addEventListener("click", () => session.hide());
    btnClear.addEventListener("click", () => {
      session.clear();
      if (songsTab) songsTab.resetPosition();
    });
    btnPrev.addEventListener("click", () => navigate(-1));
    btnNext.addEventListener("click", () => navigate(1));
    document.addEventListener("keydown", (e) => {
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      if (inInput) return;
      if (e.key === "Escape") btnHide.click();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navigate(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === " ") {
        e.preventDefault();
        if (session.isLive) btnHide.click();
        else btnShow.click();
      }
    });
    return { refresh };
  }

  // src/dock/main.js
  var diagnostics = createDiagnostics();
  var report = (context) => (err) => diagnostics.log(context, err);
  function wireDiagnosticsPanel() {
    const list = $("diag-list"), count = $("diag-count");
    diagnostics.subscribe((entries) => {
      count.textContent = entries.length ? `(${entries.length})` : "";
      list.replaceChildren(...entries.slice().reverse().map((e) => {
        const li = document.createElement("li");
        li.textContent = `${e.at.slice(11, 19)}  ${e.context}: ${e.message}`;
        return li;
      }));
    });
    $("diag-clear").addEventListener("click", () => diagnostics.clear());
  }
  (async () => {
    try {
      wireDiagnosticsPanel();
      const status = createStatus({
        statusBar: $("status-bar"),
        statusDot: $("status-dot"),
        statusLabel: $("status-label"),
        liveKind: $("live-kind")
      });
      const transport = createBrowserTransport("dock", report("transport"));
      const scripture = createScriptureApi({
        cache: idbCache(openKv("obs-stage-cache"), report("cache")),
        offline: createOfflineProvider()
      });
      const library = createLibrary({
        local: createLocalSongStore(window.localStorage, report("songs")),
        onError: report("library")
      });
      let scriptureTab = null;
      let songsTab = null;
      let controls = null;
      let display = null;
      const session = createSession({
        transport,
        readSettings: () => display.readSettings(),
        providers: {
          scripture: () => scriptureTab.getContent(),
          songs: () => songsTab.getContent()
        },
        onChange: (snap) => {
          status.setDotState(snap.phase, snap.liveTab);
          document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === snap.activeTab));
          $("panel-scripture").classList.toggle("hidden", snap.activeTab !== "scripture");
          $("panel-songs").classList.toggle("hidden", snap.activeTab !== "songs");
          controls?.refresh();
        }
      });
      display = initDisplaySettings({
        session,
        setStatus: status.setStatus,
        onError: report("settings"),
        applyScriptureSettings: (s) => {
          scriptureTab.setLanguage(s.language);
          scriptureTab.buildTranslationSelect(s.translation);
          scriptureTab.setAutoShow(s.autoShow);
        }
      });
      scriptureTab = initScriptureTab({
        session,
        scripture,
        setStatus: status.setStatus,
        saveCurrentSettings: () => display.saveCurrentSettings(),
        refresh: () => controls.refresh()
      });
      songsTab = initSongsTab({
        session,
        library,
        setStatus: status.setStatus,
        refresh: () => controls.refresh(),
        report: report("songs")
      });
      controls = initStreamControls({ session, scriptureTab, songsTab, setStatus: status.setStatus });
      display.applySettings(loadSettings({ onError: report("settings") }));
      document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => session.setTab(b.dataset.tab)));
      transport.start();
      session.setTab("scripture");
      const libraryUi = initLibraryUI({
        library,
        kv: openKv("obs-stage-library"),
        setStatus: status.setStatus,
        onChange: () => songsTab.refreshList(),
        report: report("library")
      });
      await libraryUi.restore();
    } catch (err) {
      diagnostics.log("dock init", err);
      console.error("[dock] init failed:", err);
    }
  })();
})();
