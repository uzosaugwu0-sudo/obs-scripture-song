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
  function createStatus({ statusBar }) {
    function setStatus(msg, type) {
      statusBar.textContent = msg;
      statusBar.className = type ? "status-bar is-" + type : "status-bar";
      if (msg) setTimeout(() => {
        if (statusBar.textContent === msg) {
          statusBar.textContent = "";
          statusBar.className = "status-bar";
        }
      }, 3500);
    }
    return { setStatus };
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
  var THEMES = Object.freeze(["frosted", "frosted-light", "pure", "sacred-light", "custom"]);
  var ANIMATIONS = Object.freeze(["rise", "wipe", "lines", "cut"]);
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
    theme: "frosted",
    position: "bottom",
    fontSize: "md",
    animation: "rise",
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
  var LEGACY_THEMES = Object.freeze({ dark: "frosted", gold: "frosted", neon: "frosted", white: "frosted-light" });
  var LEGACY_ANIMATIONS = Object.freeze({ fade: "rise", slide: "rise", none: "cut" });
  function migrateLegacy({ theme, animation } = {}) {
    const t = LEGACY_THEMES[theme] ?? theme;
    const a = LEGACY_ANIMATIONS[animation] ?? animation;
    return {
      theme: THEMES.includes(t) ? t : DEFAULTS.theme,
      animation: ANIMATIONS.includes(a) ? a : DEFAULTS.animation
    };
  }
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
    return { ...merged, ...migrateLegacy(merged) };
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
        const merged = {
          ...DEFAULTS,
          ...parsed,
          customColors: { ...DEFAULTS.customColors, ...parsed.customColors || {} }
        };
        return { ...merged, ...migrateLegacy(merged) };
      }
    } catch (err) {
      onError(err);
    }
    return { ...DEFAULTS, customColors: { ...DEFAULTS.customColors } };
  }

  // src/dock/settings-store.js
  var STYLE_KEYS = [
    "theme",
    "position",
    "fontSize",
    "animation",
    "font",
    "italic",
    "opacity",
    "scale",
    "showCard",
    "showTitle",
    "showReference"
  ];
  var PERSISTED_KEYS = [...STYLE_KEYS, "customColors", "bgImage", "language", "translation", "autoShow"];
  function pick(source, keys) {
    const out = {};
    for (const key of keys) if (key in source) out[key] = source[key];
    return out;
  }
  function createSettingsStore({ storage, onError = () => {
  } } = {}) {
    let current = loadSettings({ storage, onError });
    const listeners = /* @__PURE__ */ new Set();
    return {
      get: () => current,
      update(patch) {
        current = {
          ...current,
          ...patch,
          customColors: { ...current.customColors, ...patch.customColors || {} }
        };
        saveSettings(pick(current, PERSISTED_KEYS), { storage, onError });
        listeners.forEach((fn) => fn(current));
        return current;
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** What the overlay needs, in the shape the transport sends. */
      styleState() {
        return {
          ...pick(current, STYLE_KEYS),
          customColors: { ...current.customColors },
          bgMode: current.bgImage ? "image" : "color",
          bgImage: current.bgImage || null
        };
      }
    };
  }

  // src/dock/live-bar.js
  var PHASE_LABEL = { off: "OFF", live: "LIVE", hidden: "HIDDEN" };
  var EMPTY_PREVIEW = { has: false, text: "Nothing loaded", sub: "Look up a verse or pick a slide", canNav: false };
  function initLiveBar({ session, tabs, setStatus }) {
    const bar = $("live-bar"), pill = $("status-pill"), what = $("status-what"), previewText = $("preview-text"), previewSub = $("preview-sub"), btnPrev = $("btn-prev"), btnShow = $("btn-show"), btnHide = $("btn-hide"), btnNext = $("btn-next"), btnClear = $("btn-clear");
    const activeTab = () => tabs[session.activeTab] || null;
    function liveLabel() {
      if (session.phase !== "live") return "";
      if (session.liveTab === "scripture") return "Verse";
      const title = tabs.songs ? tabs.songs.getContent().title : "";
      return title ? "Song \xB7 " + title : "Song";
    }
    function refresh() {
      const tab = activeTab();
      const p = tab ? tab.preview() : EMPTY_PREVIEW;
      bar.dataset.phase = session.phase;
      pill.textContent = PHASE_LABEL[session.phase];
      what.textContent = liveLabel();
      previewText.textContent = p.text;
      previewSub.textContent = p.sub;
      btnShow.disabled = !p.has;
      btnHide.disabled = !session.isLive;
      btnPrev.disabled = !p.canNav;
      btnNext.disabled = !p.canNav;
    }
    function step(dir) {
      const tab = activeTab();
      if (tab) tab.step(dir);
    }
    btnShow.addEventListener("click", () => {
      const tab = activeTab();
      if (!tab || !tab.preview().has) {
        setStatus(session.activeTab === "scripture" ? "Look up a verse first." : "No slide text to display.", "error");
        return;
      }
      if (tab.markShown) tab.markShown();
      session.show();
      setStatus(session.activeTab === "scripture" ? "Verse is live." : "Slide is live.", "success");
    });
    btnHide.addEventListener("click", () => session.hide());
    btnClear.addEventListener("click", () => {
      session.clear();
      if (tabs.songs && tabs.songs.resetPosition) tabs.songs.resetPosition();
    });
    btnPrev.addEventListener("click", () => step(-1));
    btnNext.addEventListener("click", () => step(1));
    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement ? document.activeElement.tagName : "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key === "Escape") btnHide.click();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === " ") {
        e.preventDefault();
        if (session.isLive) btnHide.click();
        else btnShow.click();
      }
    });
    return { refresh };
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
    const n = normalizeBookName(name);
    if (!n) return -1;
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
  function normalizeBookName(name) {
    const n = (name || "").toLowerCase().trim().replace(/\.$/, "");
    return n.replace(/^(1st|first|i)\s+/, "1 ").replace(/^(2nd|second|ii)\s+/, "2 ").replace(/^(3rd|third|iii)\s+/, "3 ").replace(/\s+/g, " ");
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

  // src/scripture/smart-input.js
  var MIN_SEARCH_LETTERS = 3;
  function suggestBooks(text, limit = 5) {
    const q = normalizeBookName(text);
    if (!q) return [];
    const matched = /* @__PURE__ */ new Set();
    BIBLE_BOOKS.forEach(([name, abbr]) => {
      if (name.toLowerCase().startsWith(q) || abbr.toLowerCase().startsWith(q)) matched.add(name);
    });
    Object.entries(BOOK_ALIASES).forEach(([alias, name]) => {
      if (alias.startsWith(q)) matched.add(name);
    });
    return BIBLE_BOOKS.map((b) => b[0]).filter((name) => matched.has(name)).slice(0, limit);
  }
  function referenceBookResolves(text) {
    const parsed = parseReference(text);
    return parsed !== null && bookIndexOf(parsed.book) !== -1;
  }
  function classifyInput(text) {
    const t = (text || "").trim();
    if (!t) return { kind: "empty" };
    if (referenceBookResolves(t)) return { kind: "reference", reference: t };
    const bookIndex = bookIndexOf(t);
    if (bookIndex !== -1) return { kind: "book", bookIndex };
    return { kind: "search", query: t };
  }
  function dropdownRows(text) {
    const t = (text || "").trim();
    if (!t) return [];
    const rows = suggestBooks(t).map((name) => ({ type: "book", name }));
    const letters = (t.match(/[a-z]/gi) || []).length;
    if (letters >= MIN_SEARCH_LETTERS && !referenceBookResolves(t) && bookIndexOf(t) === -1) {
      rows.push({ type: "search", query: t });
    }
    return rows;
  }

  // src/dock/smart-box.js
  var QUICK_BOOKS = ["John", "Romans", "Psalms", "Matthew", "Genesis", "Proverbs", "Isaiah", "Hebrews", "Acts", "Revelation"];
  var BLUR_CLOSE_MS = 120;
  function initSmartBox({ onReference, onSearch, setStatus }) {
    const input = $("smart-input"), list = $("smart-list"), chips = $("quick-books");
    let rows = [];
    let highlight = -1;
    function close() {
      list.classList.add("hidden");
      list.replaceChildren();
      rows = [];
      highlight = -1;
    }
    function paintHighlight() {
      [...list.children].forEach((li, i) => li.classList.toggle("hi", i === highlight));
    }
    function setBook(name) {
      input.value = name + " ";
      input.focus();
      render();
      const book = BIBLE_BOOKS.find((b) => b[0] === name);
      if (book) setStatus(book[0] + " has " + book[2] + " chapters. Type a chapter and verse.", "");
    }
    function pick2(row) {
      if (row.type === "book") {
        setBook(row.name);
        return;
      }
      close();
      onSearch(row.query);
    }
    function render() {
      rows = dropdownRows(input.value);
      highlight = -1;
      if (!rows.length) {
        close();
        return;
      }
      list.replaceChildren(...rows.map((row) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        if (row.type === "book") {
          li.textContent = row.name;
          const book = BIBLE_BOOKS.find((b) => b[0] === row.name);
          const small = document.createElement("small");
          small.textContent = (book ? book[2] : "") + " chapters";
          li.appendChild(small);
        } else {
          li.textContent = 'Search verses for "' + row.query + '"';
        }
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick2(row);
        });
        return li;
      }));
      list.classList.remove("hidden");
    }
    function submit() {
      const result = classifyInput(input.value);
      if (result.kind === "empty") {
        setStatus("Enter a reference or some words first.", "error");
        return;
      }
      if (result.kind === "reference") {
        close();
        onReference(result.reference);
        return;
      }
      if (result.kind === "book") {
        setBook(BIBLE_BOOKS[result.bookIndex][0]);
        return;
      }
      close();
      onSearch(result.query);
    }
    function move(dir) {
      if (!rows.length) return;
      highlight = highlight === -1 ? dir > 0 ? 0 : rows.length - 1 : (highlight + dir + rows.length) % rows.length;
      paintHighlight();
    }
    input.addEventListener("input", render);
    input.addEventListener("blur", () => setTimeout(close, BLUR_CLOSE_MS));
    input.addEventListener("keydown", (e) => {
      const open = !list.classList.contains("hidden");
      if (e.key === "ArrowDown" && open) {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp" && open) {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Escape") close();
      else if (e.key === "Enter") {
        e.preventDefault();
        if (open && highlight >= 0) pick2(rows[highlight]);
        else submit();
      }
    });
    QUICK_BOOKS.forEach((name) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = name;
      chip.addEventListener("click", () => setBook(name));
      chips.appendChild(chip);
    });
    return {
      setValue(text) {
        input.value = text;
        close();
      },
      focus() {
        input.focus();
      }
    };
  }

  // src/dock/scripture-tab.js
  function initScriptureTab({ session, scripture, store, setStatus, refresh }) {
    const verseText = $("verse-text"), languageSel = $("language-sel"), translationSel = $("translation-sel"), autoShowCb = $("auto-show-cb"), randomScope = $("random-scope"), btnRandom = $("btn-random"), results = $("search-results");
    let plainRef = "";
    let refLabel = "";
    let busy = false;
    const translation = () => translationSel.value || "KJV";
    function fillLanguages() {
      LANGUAGES.forEach((lang) => {
        const option = document.createElement("option");
        option.value = lang;
        option.textContent = lang;
        languageSel.appendChild(option);
      });
    }
    function fillTranslations(keepKey) {
      translationSel.replaceChildren(...TRANSLATIONS.filter((t) => t.lang === languageSel.value).map((t) => {
        const option = document.createElement("option");
        option.value = t.key;
        option.textContent = t.key + " - " + t.label;
        return option;
      }));
      if (keepKey && [...translationSel.options].some((o) => o.value === keepKey)) translationSel.value = keepKey;
    }
    function hideResults() {
      results.classList.add("hidden");
      results.replaceChildren();
    }
    function apply(result) {
      verseText.value = result.text;
      plainRef = result.rawRef;
      refLabel = result.reference;
      smart.setValue(result.rawRef);
      hideResults();
      refresh();
      setStatus(result.reference, "success");
    }
    async function lookup(reference) {
      if (busy) return;
      busy = true;
      setStatus("Looking up " + reference + "...", "loading");
      const result = await scripture.fetchVerse(reference, translation());
      busy = false;
      if (result.error) {
        setStatus(result.error, "error");
        return;
      }
      apply(result);
      if (autoShowCb.checked) session.show();
    }
    async function step(dir) {
      if (!plainRef || busy) return;
      busy = true;
      setStatus(dir > 0 ? "Next verse..." : "Previous verse...", "loading");
      const next = await stepReference(
        plainRef,
        dir,
        (bookId, chapter) => scripture.fetchVerseCount(translation(), bookId, chapter)
      );
      if (!next) {
        busy = false;
        setStatus("That is the end of the Bible.", "");
        return;
      }
      const result = await scripture.fetchVerse(next, translation());
      busy = false;
      if (result.error) {
        setStatus(result.error, "error");
        return;
      }
      apply(result);
      if (session.isLive || autoShowCb.checked) session.show();
    }
    async function runSearch(query) {
      setStatus("Searching " + translation() + "...", "loading");
      const found = await scripture.searchScripture(translation(), query);
      if (found.error) {
        hideResults();
        setStatus(found.error, "error");
        return;
      }
      if (!found.length) {
        hideResults();
        setStatus('No results for "' + query + '".', "");
        return;
      }
      results.replaceChildren(...found.map((r) => {
        const ref = buildReference(r.book, r.chapter, r.verse);
        const li = document.createElement("li");
        const refEl = document.createElement("span");
        refEl.className = "ref";
        refEl.textContent = ref;
        const textEl = document.createElement("span");
        textEl.innerHTML = highlightMatch(r.text, query);
        li.append(refEl, textEl);
        li.addEventListener("click", () => {
          lookup(ref);
        });
        return li;
      }));
      results.classList.remove("hidden");
      setStatus(found.length + " result" + (found.length === 1 ? "" : "s") + ".", "success");
    }
    const smart = initSmartBox({ onReference: lookup, onSearch: runSearch, setStatus });
    const saved = store.get();
    fillLanguages();
    languageSel.value = LANGUAGES.includes(saved.language) ? saved.language : "English";
    fillTranslations(saved.translation || "KJV");
    autoShowCb.checked = !!saved.autoShow;
    languageSel.addEventListener("change", () => {
      fillTranslations();
      store.update({ language: languageSel.value, translation: translation() });
    });
    translationSel.addEventListener("change", () => {
      store.update({ translation: translation() });
      if (plainRef) lookup(plainRef);
    });
    autoShowCb.addEventListener("change", () => store.update({ autoShow: autoShowCb.checked }));
    verseText.addEventListener("input", refresh);
    btnRandom.addEventListener("click", async () => {
      setStatus("Picking a verse...", "loading");
      const picked = await scripture.randomReference(translation(), randomScope.value);
      if (picked.error) {
        setStatus(picked.error, "error");
        return;
      }
      await lookup(picked.reference);
    });
    return {
      getContent: () => ({ body: verseText.value.trim(), reference: refLabel }),
      preview() {
        const body = verseText.value.trim();
        return {
          has: body.length > 0,
          text: body || "Nothing loaded",
          sub: body ? refLabel || "Edited text" : "Look up a verse to preview",
          canNav: !!plainRef
        };
      },
      step,
      focus: () => smart.focus()
    };
  }

  // src/dock/main.js
  var diagnostics = createDiagnostics();
  var report = (context) => (err) => diagnostics.log(context, err);
  var EMPTY_SCRIPTURE = { body: "", reference: "" };
  var EMPTY_SONG = { title: "", body: "" };
  var VIEWS = ["scripture", "songs", "style"];
  (async () => {
    try {
      let showView = function(name) {
        VIEWS.forEach((view) => {
          const on = view === name;
          $("panel-" + view).classList.toggle("hidden", !on);
          const tab = $("tab-" + view);
          tab.classList.toggle("on", on);
          tab.setAttribute("aria-selected", String(on));
        });
        if (name !== "style") session.setTab(name);
        if (liveBar) liveBar.refresh();
      };
      const status = createStatus({ statusBar: $("status-bar") });
      const transport = createBrowserTransport("dock", report("transport"));
      const store = createSettingsStore({ storage: window.localStorage, onError: report("settings") });
      const tabs = {};
      let liveBar = null;
      const session = createSession({
        transport,
        readSettings: () => store.styleState(),
        providers: {
          scripture: () => tabs.scripture ? tabs.scripture.getContent() : EMPTY_SCRIPTURE,
          songs: () => tabs.songs ? tabs.songs.getContent() : EMPTY_SONG
        },
        onChange: () => {
          if (liveBar) liveBar.refresh();
        }
      });
      liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });
      const scripture = createScriptureApi({
        cache: idbCache(openKv("obs-stage-cache"), report("cache")),
        offline: createOfflineProvider()
      });
      tabs.scripture = initScriptureTab({
        session,
        scripture,
        store,
        setStatus: status.setStatus,
        refresh: () => liveBar.refresh()
      });
      document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.tab)));
      transport.start();
      showView("scripture");
    } catch (err) {
      diagnostics.log("dock init", err);
      console.error("[dock] init failed:", err);
    }
  })();
})();
