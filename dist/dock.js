(() => {
  // src/core/html.js
  var escapeHtml = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // src/dock/shared/util.js
  var $ = (id) => document.getElementById(id);
  function highlightMatch(text, q) {
    if (!q) return escapeHtml(text);
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return escapeHtml(text).replace(re, "<mark>$1</mark>");
  }

  // src/dock/shared/status.js
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

  // src/dock/live/session.js
  var KIND_OF = { scripture: "verse", songs: "song", announcement: "announcement", timer: "timer" };
  var TABS = Object.keys(KIND_OF);
  function createSession({ transport, readSettings, providers, onChange = () => {
  } }) {
    const s = { activeTab: "scripture", isLive: false, liveTab: null, phase: "off", liveContent: null };
    const snapshot = () => ({ activeTab: s.activeTab, isLive: s.isLive, liveTab: s.liveTab, phase: s.phase });
    const notify = () => onChange(snapshot());
    function content(tab) {
      const provided = providers[tab] ? providers[tab]() : {};
      return { kind: KIND_OF[tab], title: "", reference: "", body: "", ...provided };
    }
    function buildState(action, { forShow = false, fresh = false } = {}) {
      const live = action === "show" && s.isLive && s.liveTab && !forShow;
      if (live && !fresh && s.liveContent) return { ...readSettings(), action, visible: true, ...s.liveContent };
      const tab = live ? s.liveTab : s.activeTab;
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
      get liveContent() {
        return s.liveContent;
      },
      buildState,
      setTab(tab) {
        if (!TABS.includes(tab)) return;
        s.activeTab = tab;
        notify();
      },
      show() {
        const state = buildState("show", { forShow: true });
        transport.send(state);
        s.liveContent = { kind: state.kind, title: state.title, reference: state.reference, body: state.body, timer: state.timer };
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
        s.liveContent = null;
        s.phase = "off";
        notify();
      },
      /** Re-send what is on air with the current style. fresh: true re-reads the content too (an edit to the live slide). */
      resendIfLive({ fresh = false } = {}) {
        if (s.isLive) transport.send(buildState("show", { fresh }));
      },
      /** Change part of what is on air (a paused or reset timer) and send it. Does nothing unless something is live. */
      updateLive(patch) {
        if (!s.isLive || !s.liveContent) return;
        s.liveContent = { ...s.liveContent, ...patch };
        transport.send({ ...readSettings(), action: "show", visible: true, ...s.liveContent });
        notify();
      }
    };
  }

  // src/dock/shared/diagnostics.js
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
  var KINDS = Object.freeze(["verse", "song", "announcement", "timer", "lowerthird"]);
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
    timer: null,
    // timer kind only: { endAt } while running, { remainingMs } while paused
    lowerthird: null,
    // lowerthird kind only: { align, logo }
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
  function validTimer(timer) {
    if (!timer || typeof timer !== "object") return false;
    if (typeof timer.endAt === "number") return Number.isFinite(timer.endAt);
    return typeof timer.remainingMs === "number" && Number.isFinite(timer.remainingMs) && timer.remainingMs >= 0;
  }
  var LOWER_THIRD_ALIGNS = ["left", "center", "right"];
  var MAX_LOGO_DATA_URL = 3e5;
  var LOGO_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  var isLogoDataUrl = (s) => typeof s === "string" && s.length <= MAX_LOGO_DATA_URL && LOGO_DATA_URL.test(s);
  var textOf = (value) => typeof value === "string" ? value : "";
  function cleanLowerThird(value) {
    const v = value && typeof value === "object" ? value : {};
    return { align: LOWER_THIRD_ALIGNS.includes(v.align) ? v.align : "left", logo: isLogoDataUrl(v.logo) ? v.logo : null };
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
    if (merged.kind === "timer" && merged.action !== "clear" && !validTimer(merged.timer)) return null;
    if (merged.kind === "lowerthird" && merged.action === "show" && !textOf(merged.title).trim() && !textOf(merged.body).trim()) return null;
    const result = { ...merged, ...migrateLegacy(merged) };
    if (merged.kind === "lowerthird") {
      result.title = textOf(merged.title);
      result.body = textOf(merged.body);
      result.lowerthird = cleanLowerThird(merged.lowerthird);
    }
    return result;
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

  // src/dock/style/settings-store.js
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

  // src/dock/live/live-bar.js
  var PHASE_LABEL = { off: "OFF", live: "LIVE", hidden: "HIDDEN" };
  var EMPTY_PREVIEW = { has: false, text: "Nothing loaded", sub: "Look up a verse or pick a slide", canNav: false };
  var NEEDS = {
    scripture: "Look up a verse first.",
    songs: "No slide text to display.",
    announcement: "Write the announcement first.",
    timer: "Set up the timer first."
  };
  var LIVE_MSG = {
    scripture: "Verse is live.",
    songs: "Slide is live.",
    announcement: "Announcement is live.",
    timer: "Timer is running."
  };
  function initLiveBar({ session, tabs, setStatus }) {
    const bar = $("live-bar"), pill = $("status-pill"), what = $("status-what"), previewText = $("preview-text"), previewSub = $("preview-sub"), planLine = $("plan-line"), btnPrev = $("btn-prev"), btnShow = $("btn-show"), btnHide = $("btn-hide"), btnNext = $("btn-next"), btnClear = $("btn-clear"), timerControls = $("timer-controls"), timerText = $("timer-live-text"), btnTimerPause = $("btn-timer-pause"), btnTimerReset = $("btn-timer-reset");
    const activeTab = () => tabs[session.activeTab] || null;
    function liveLabel() {
      if (session.phase !== "live") return "";
      if (session.liveTab === "scripture") return "Verse";
      if (session.liveTab === "announcement" || session.liveTab === "timer") {
        const name = session.liveTab === "timer" ? "Timer" : "Announcement";
        const title2 = session.liveContent ? session.liveContent.title : "";
        return title2 ? name + " \xB7 " + title2 : name;
      }
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
      const planText = tabs.plan ? tabs.plan.summary() : null;
      planLine.textContent = planText || "";
      planLine.classList.toggle("hidden", !planText);
      const live = tabs.timer ? tabs.timer.live() : null;
      timerControls.classList.toggle("hidden", !live);
      if (live) {
        timerText.textContent = live.text + (live.paused ? " (paused)" : "") + (live.title ? " \xB7 " + live.title : "");
        btnTimerPause.textContent = live.paused ? "Resume" : "Pause";
        btnTimerPause.classList.toggle("hidden", !live.canControl);
        btnTimerReset.classList.toggle("hidden", !live.canControl);
      }
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
        setStatus(NEEDS[session.activeTab] || "Nothing to show.", "error");
        return;
      }
      if (tab.markShown) tab.markShown();
      session.show();
      setStatus(LIVE_MSG[session.activeTab] || "Live.", "success");
    });
    btnHide.addEventListener("click", () => session.hide());
    btnClear.addEventListener("click", () => {
      session.clear();
      if (tabs.songs && tabs.songs.resetPosition) tabs.songs.resetPosition();
    });
    btnPrev.addEventListener("click", () => step(-1));
    btnNext.addEventListener("click", () => step(1));
    btnTimerPause.addEventListener("click", () => {
      const live = tabs.timer.live();
      if (!live) return;
      if (live.paused) tabs.timer.resume();
      else tabs.timer.pause();
    });
    btnTimerReset.addEventListener("click", () => tabs.timer.reset());
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
      } else if (e.key === "PageDown") {
        e.preventDefault();
        if (tabs.plan) tabs.plan.nextItem();
      } else if (e.key === "PageUp") {
        e.preventDefault();
        if (tabs.plan) tabs.plan.prevItem();
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

  // src/dock/scripture/smart-box.js
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

  // src/dock/scripture/scripture-tab.js
  function initScriptureTab({ session, scripture, store, setStatus, refresh, addToPlan, isPicking = () => false }) {
    const verseText = $("verse-text"), languageSel = $("language-sel"), translationSel = $("translation-sel"), autoShowCb = $("auto-show-cb"), randomScope = $("random-scope"), btnRandom = $("btn-random"), btnToPlan = $("btn-verse-to-plan"), results = $("search-results");
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
      btnToPlan.disabled = false;
      smart.setValue(result.rawRef);
      hideResults();
      refresh();
      setStatus(result.reference, "success");
    }
    async function lookup(reference, { autoShow = autoShowCb.checked && !isPicking() } = {}) {
      if (busy) return null;
      busy = true;
      setStatus("Looking up " + reference + "...", "loading");
      const result = await scripture.fetchVerse(reference, translation());
      busy = false;
      if (result.error) {
        setStatus(result.error, "error");
        return false;
      }
      apply(result);
      if (autoShow) session.show();
      return true;
    }
    async function loadReading(reference, translationKey) {
      if (busy) {
        setStatus("Still loading a verse, try again in a moment.", "");
        return null;
      }
      const entry = TRANSLATIONS.find((t) => t.key === translationKey);
      if (entry && entry.key !== translation()) {
        languageSel.value = entry.lang;
        fillTranslations(entry.key);
        store.update({ language: languageSel.value, translation: translation() });
      }
      return lookup(reference, { autoShow: false });
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
    btnToPlan.addEventListener("click", (e) => {
      if (plainRef) addToPlan(plainRef, translation(), e.shiftKey);
    });
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
      loadReading,
      focus: () => smart.focus()
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

  // src/songs/search.js
  var CONTEXT = 30;
  var NO_MATCH = Object.freeze({ matched: false, via: null, excerpt: null, score: 0 });
  function normalizeText(text) {
    return String(text ?? "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/['\u2019]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function tokenize(query) {
    const normalized = normalizeText(query);
    return normalized ? normalized.split(" ") : [];
  }
  function excerptFor(slides, tokens) {
    let best = "";
    let bestHits = -1;
    for (const slide of slides) {
      const normalized = normalizeText(slide);
      const hits = tokens.filter((t) => normalized.includes(t)).length;
      if (hits > bestHits) {
        best = slide;
        bestHits = hits;
      }
    }
    const lower = best.toLowerCase();
    const found = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
    const idx = found.length ? Math.min(...found) : 0;
    const start = Math.max(0, idx - CONTEXT);
    const end = Math.min(best.length, idx + CONTEXT * 2);
    return (start > 0 ? "..." : "") + best.slice(start, end).trim() + (end < best.length ? "..." : "");
  }
  function songMatches(song, query) {
    const tokens = tokenize(query);
    if (!tokens.length) return { matched: true, via: null, excerpt: null, score: 0 };
    const titleText = normalizeText([song.title, song.altTitle].filter((t) => typeof t === "string").join(" "));
    const slides = (song.slides || []).filter((s) => typeof s === "string");
    const lyricsText = normalizeText(slides.join(" "));
    let titleHits = 0;
    let lyricHits = 0;
    for (const token of tokens) {
      const inTitle = titleText.includes(token);
      const inLyrics = lyricsText.includes(token);
      if (!inTitle && !inLyrics) return NO_MATCH;
      if (inTitle) titleHits += 1;
      if (inLyrics) lyricHits += 1;
    }
    const phrase = tokens.join(" ");
    const allInTitle = titleHits === tokens.length;
    let score = titleHits * 50 + lyricHits * 10;
    if (allInTitle) score += 1e3;
    if (titleText.startsWith(phrase)) score += 500;
    else if (titleText.includes(phrase)) score += 200;
    if (lyricsText.includes(phrase)) score += 100;
    return { matched: true, via: allInTitle ? "title" : "lyrics", excerpt: allInTitle ? null : excerptFor(slides, tokens), score };
  }
  function searchSongs(songs, query) {
    return songs.map((song) => ({ song, ...songMatches(song, query) })).filter((result) => result.matched).sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
  }
  var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function markTokens(text, tokens) {
    const raw = String(text ?? "");
    const usable = (tokens || []).filter(Boolean).map(escapeRegExp);
    if (!usable.length) return escapeHtml(raw);
    const parts = raw.split(new RegExp("(" + usable.join("|") + ")", "i"));
    return parts.map((part, i) => i % 2 === 1 ? "<mark>" + escapeHtml(part) + "</mark>" : escapeHtml(part)).join("");
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

  // src/dock/songs/songs-tab.js
  function initSongsTab({ session, library, setStatus, refresh, addToPlan }) {
    const search = $("song-search"), listEl = $("song-list"), view = $("song-view"), nameEl = $("song-name"), btnAll = $("btn-all-songs"), btnToPlan = $("btn-song-to-plan"), btnEdit = $("btn-edit-song"), cardsEl = $("slide-cards"), editor = $("song-editor"), titleInput = $("song-title-input"), slideList = $("slide-list"), slideText = $("slide-textarea"), btnAdd = $("btn-add-slide"), btnUpdate = $("btn-update-slide"), btnDelSlide = $("btn-delete-slide"), btnSave = $("btn-save-song"), btnDelete = $("btn-delete-song"), btnDone = $("btn-done-edit"), btnNew = $("btn-new-song");
    let activeSongId = null;
    let activeSlideIdx = null;
    let shownIdx = -1;
    let editing = false;
    let listOpen = true;
    let discardArmed = false;
    const getSong = () => library.get(activeSongId);
    function contentIndex() {
      return session.isLive && session.liveTab === "songs" && shownIdx >= 0 ? shownIdx : activeSlideIdx;
    }
    function hasUnsavedEdits() {
      const song = getSong();
      const typedTitle = titleInput.value.trim();
      const titleChanged = song ? (typedTitle || "Untitled") !== song.title : typedTitle !== "";
      const text = slideText.value;
      const slideChanged = text.trim() !== "" && !(song && activeSlideIdx !== null && song.slides[activeSlideIdx] === text);
      return titleChanged || slideChanged;
    }
    function slideLines() {
      const song = getSong();
      const idx = contentIndex();
      if (song && idx !== null) return song.slides[idx] || "";
      return editing ? slideText.value.trim() : "";
    }
    function resetSelection() {
      activeSongId = null;
      activeSlideIdx = null;
      shownIdx = -1;
      editing = false;
      listOpen = true;
    }
    function renderList() {
      const query = search.value;
      const tokens = tokenize(query);
      const dupIds = new Set(findDuplicateGroups(library.list()).flat().map((s) => s.id));
      const found = searchSongs(library.list(), query);
      if (!found.length) {
        const li = document.createElement("li");
        li.className = "song-item";
        li.textContent = query.trim() ? 'No songs match "' + query.trim() + '"' : "No songs yet. Use + New or Import.";
        listEl.replaceChildren(li);
        return;
      }
      listEl.replaceChildren(...found.map(({ song, excerpt }) => {
        const li = document.createElement("li");
        li.className = "song-item";
        const title = document.createElement("span");
        title.className = "title";
        title.innerHTML = markTokens(song.title || "Untitled", tokens);
        if (dupIds.has(song.id)) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = "DUPLICATE";
          title.appendChild(badge);
        }
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = song.slides.length + (song.slides.length === 1 ? " slide" : " slides");
        const add = document.createElement("button");
        add.type = "button";
        add.className = "add";
        add.textContent = "+ Plan";
        add.title = "Add this song to the open plan (hold Shift to keep choosing)";
        add.setAttribute("aria-label", "Add " + (song.title || "Untitled") + " to the plan");
        add.addEventListener("click", (e) => {
          e.stopPropagation();
          addToPlan(song.id, e.shiftKey);
        });
        const del = document.createElement("button");
        del.type = "button";
        del.className = "del";
        del.textContent = "\u2715";
        del.title = "Delete this song";
        del.setAttribute("aria-label", "Delete " + song.title);
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          removeSong(song);
        });
        li.append(title, count, add, del);
        if (excerpt) {
          const note = document.createElement("span");
          note.className = "excerpt";
          note.innerHTML = markTokens(excerpt, tokens);
          li.appendChild(note);
        }
        li.addEventListener("click", () => open(song.id));
        return li;
      }));
    }
    function renderCards(song) {
      if (!song.slides.length) {
        const hint = document.createElement("p");
        hint.className = "faint";
        hint.textContent = "This song has no slides yet. Press Edit to add some.";
        cardsEl.replaceChildren(hint);
        return;
      }
      cardsEl.replaceChildren(...song.slides.map((text, i) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "card" + (i === activeSlideIdx ? " cur" : "");
        const number = document.createElement("small");
        number.textContent = String(i + 1);
        card.append(number, document.createTextNode(text));
        card.addEventListener("click", () => showSlide(i));
        return card;
      }));
    }
    function renderChips() {
      const song = getSong();
      slideList.replaceChildren(...(song ? song.slides : []).map((text, i) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "slide-chip" + (i === activeSlideIdx ? " on" : "");
        chip.textContent = (text.split("\n")[0] || "Slide " + (i + 1)).slice(0, 30);
        chip.title = text;
        chip.addEventListener("click", () => selectSlide(i));
        return chip;
      }));
    }
    function render() {
      const song = getSong();
      const showList = !editing && (!song || listOpen);
      listEl.classList.toggle("hidden", !showList);
      search.classList.toggle("hidden", editing);
      view.classList.toggle("hidden", editing || !song || showList);
      editor.classList.toggle("hidden", !editing);
      if (showList) renderList();
      if (song && !editing) {
        nameEl.textContent = song.title;
        renderCards(song);
      }
      if (editing) renderChips();
      btnDelete.disabled = !song;
      refresh();
    }
    function open(id, { preview = false } = {}) {
      activeSongId = id;
      const song = getSong();
      activeSlideIdx = preview && song && song.slides.length ? 0 : null;
      shownIdx = -1;
      editing = false;
      listOpen = false;
      search.value = "";
      render();
    }
    function showSlide(i) {
      activeSlideIdx = i;
      shownIdx = i;
      renderCards(getSong());
      session.show();
      setStatus("Slide is live.", "success");
    }
    function step(dir) {
      const song = getSong();
      if (!song || !song.slides.length) return;
      let target = shownIdx < 0 ? dir > 0 ? 0 : song.slides.length - 1 : shownIdx + dir;
      target = Math.max(0, Math.min(song.slides.length - 1, target));
      activeSlideIdx = target;
      shownIdx = target;
      renderCards(song);
      session.show();
    }
    async function removeSong(song) {
      if (!confirm('Delete "' + (song.title || "Untitled") + '"? This cannot be undone.')) return;
      await library.remove(song.id);
      if (song.id === activeSongId) resetSelection();
      render();
      setStatus('Deleted "' + (song.title || "Untitled") + '".', "");
    }
    function selectSlide(i) {
      const song = getSong();
      if (!song) return;
      activeSlideIdx = i;
      slideText.value = song.slides[i] || "";
      btnUpdate.disabled = false;
      btnDelSlide.disabled = false;
      renderChips();
      refresh();
    }
    function clearSlideEditor() {
      activeSlideIdx = null;
      slideText.value = "";
      btnUpdate.disabled = true;
      btnDelSlide.disabled = true;
    }
    function startEditing() {
      const song = getSong();
      editing = true;
      listOpen = false;
      titleInput.value = song ? song.title : "";
      clearSlideEditor();
      render();
    }
    function startNew() {
      activeSongId = null;
      shownIdx = -1;
      startEditing();
    }
    async function saveSong() {
      const title = titleInput.value.trim() || "Untitled";
      const existing = getSong();
      const saved = await library.save({ ...existing || { slides: [] }, id: existing ? existing.id : void 0, title });
      activeSongId = saved.id;
      btnDelete.disabled = false;
      setStatus("Song saved.", "success");
      render();
    }
    async function addSlide() {
      const text = slideText.value;
      if (!text.trim()) {
        setStatus("Enter slide text first.", "error");
        return;
      }
      const existing = getSong();
      const saved = await library.save({
        ...existing || { title: titleInput.value.trim() || "Untitled" },
        id: existing ? existing.id : void 0,
        slides: [...existing ? existing.slides : [], text]
      });
      activeSongId = saved.id;
      activeSlideIdx = saved.slides.length - 1;
      slideText.value = "";
      btnUpdate.disabled = false;
      btnDelSlide.disabled = false;
      render();
      setStatus("Slide added.", "success");
    }
    async function updateSlide() {
      const song = getSong();
      if (!song || activeSlideIdx === null) return;
      await library.save({ ...song, slides: song.slides.map((s, i) => i === activeSlideIdx ? slideText.value : s) });
      renderChips();
      if (session.isLive && session.liveTab === "songs" && shownIdx === activeSlideIdx) session.resendIfLive({ fresh: true });
      refresh();
      setStatus("Slide updated.", "success");
    }
    async function deleteSlide() {
      const song = getSong();
      if (!song || activeSlideIdx === null) return;
      await library.save({ ...song, slides: song.slides.filter((_, i) => i !== activeSlideIdx) });
      if (shownIdx === activeSlideIdx) shownIdx = -1;
      clearSlideEditor();
      render();
      setStatus("Slide deleted.", "");
    }
    search.addEventListener("focus", () => {
      listOpen = true;
      render();
    });
    search.addEventListener("input", () => {
      listOpen = true;
      render();
    });
    btnAll.addEventListener("click", () => {
      listOpen = true;
      render();
    });
    btnEdit.addEventListener("click", startEditing);
    btnToPlan.addEventListener("click", (e) => {
      const song = getSong();
      if (song) addToPlan(song.id, e.shiftKey);
    });
    btnNew.addEventListener("click", startNew);
    btnDone.addEventListener("click", () => {
      if (hasUnsavedEdits() && !discardArmed) {
        discardArmed = true;
        setStatus("You have unsaved text. Use Save song, Add slide or Update, or press Done again to discard it.", "error");
        return;
      }
      discardArmed = false;
      editing = false;
      listOpen = !getSong();
      render();
    });
    titleInput.addEventListener("input", () => {
      discardArmed = false;
    });
    btnSave.addEventListener("click", saveSong);
    btnDelete.addEventListener("click", () => {
      const song = getSong();
      if (song) removeSong(song);
    });
    btnAdd.addEventListener("click", addSlide);
    btnUpdate.addEventListener("click", updateSlide);
    btnDelSlide.addEventListener("click", deleteSlide);
    slideText.addEventListener("input", () => {
      discardArmed = false;
      refresh();
    });
    render();
    return {
      getContent() {
        const song = getSong();
        return { title: song ? song.title : editing ? titleInput.value.trim() : "", body: slideLines() };
      },
      preview() {
        const song = getSong();
        const lines = slideLines();
        const where = activeSlideIdx === null ? "no slide picked" : "slide " + (activeSlideIdx + 1) + " of " + (song ? song.slides.length : 0);
        return {
          has: lines.length > 0,
          text: lines || (song ? "Pick a slide" : "Nothing loaded"),
          sub: song ? song.title + " \xB7 " + where : "Pick a song and a slide",
          canNav: !!(song && song.slides.length)
        };
      },
      /** Open a song with slide 1 previewed, not shown. False when unsaved editor text would be lost or the song is gone. */
      loadSong(id) {
        if (editing && hasUnsavedEdits()) return false;
        if (!library.get(id)) return false;
        open(id, { preview: true });
        return true;
      },
      /** Which song and slide is loaded, for the plan's "slide 2/4" label. */
      position() {
        const song = getSong();
        if (!song) return null;
        return { songId: song.id, index: shownIdx >= 0 ? shownIdx : activeSlideIdx, count: song.slides.length };
      },
      step,
      markShown() {
        shownIdx = activeSlideIdx === null ? -1 : activeSlideIdx;
      },
      resetPosition() {
        shownIdx = -1;
      },
      /** Re-render after the library changed underneath us (bulk actions, folder attach). */
      refreshList() {
        if (activeSongId && !getSong()) resetSelection();
        render();
      }
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

  // src/dock/songs/import-panel.js
  var SONG_FILE = /[.](txt|json|csv|tsv)$/i;
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Read failed"));
      reader.readAsText(file);
    });
  }
  function initImportPanel({ library, setStatus, report: report2, onImported }) {
    const panel = $("import-panel"), title = $("import-panel-title"), hint = $("import-panel-hint"), listEl = $("import-song-list"), fileInput = $("import-file-input"), folderInput = $("import-folder-input");
    let pending = [];
    function close() {
      panel.classList.add("hidden");
      listEl.replaceChildren();
      pending = [];
      fileInput.value = "";
      folderInput.value = "";
    }
    function showPreview(incoming, sourceLabel) {
      if (!incoming.length) {
        setStatus("No songs found in those files.", "error");
        return;
      }
      const existing = new Set(library.list().map((s) => normalizeTitle(s.title)));
      pending = incoming.map((song) => {
        const exists = existing.has(normalizeTitle(song.title));
        return { ...song, exists, selected: !exists };
      });
      const newCount = pending.filter((s) => !s.exists).length;
      title.textContent = "Import preview - " + sourceLabel;
      hint.textContent = pending.length + " found, " + newCount + " new, " + (pending.length - newCount) + " already exist";
      listEl.replaceChildren(...pending.map((song, idx) => {
        const li = document.createElement("li");
        li.className = song.exists ? "conflict" : "";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.id = "isc-" + idx;
        box.checked = song.selected;
        box.addEventListener("change", () => {
          pending = pending.map((s, i) => i === idx ? { ...s, selected: box.checked } : s);
        });
        const label = document.createElement("label");
        label.htmlFor = box.id;
        const name = document.createElement("span");
        name.className = "isc-title";
        name.textContent = song.title;
        const meta = document.createElement("span");
        meta.className = "isc-meta";
        meta.textContent = song.slides.length + " slides" + (song.exists ? " - already exists" : "");
        label.append(name, meta);
        li.append(box, label);
        return li;
      }));
      panel.classList.remove("hidden");
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
      showPreview(all, sourceLabel);
      if (failed.length) setStatus(failedMessage, "error");
    }
    async function confirmImport() {
      const chosen = pending.filter((s) => s.selected);
      if (!chosen.length) {
        setStatus("No songs selected.", "error");
        return;
      }
      const { added, replaced } = await library.upsertByTitle(
        chosen.map(({ title: t, altTitle, slides }) => ({ title: t, altTitle, slides }))
      );
      close();
      onImported();
      const parts = [];
      if (added) parts.push(added + " added");
      if (replaced) parts.push(replaced + " updated");
      setStatus(parts.join(", ") + ".", "success");
    }
    $("btn-import-file").addEventListener("click", () => fileInput.click());
    $("tool-import-folder").addEventListener("click", () => folderInput.click());
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      if (files.length) await processFiles(files, files.length === 1 ? files[0].name : files.length + " files");
    });
    folderInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files).filter((f) => SONG_FILE.test(f.name));
      if (!files.length) {
        setStatus("No compatible files in that folder.", "error");
        return;
      }
      const folderName = files[0].webkitRelativePath.split("/")[0] || "folder";
      await processFiles(files, folderName + " (" + files.length + " files)");
    });
    $("btn-import-confirm").addEventListener("click", confirmImport);
    $("btn-import-cancel").addEventListener("click", close);
    $("btn-import-close").addEventListener("click", close);
    return { close };
  }

  // src/core/record-folder.js
  var BACKSLASH2 = String.fromCharCode(92);
  function safeFilename(title, fallback = "song") {
    return (title || "untitled").replace(/[<>:"/|?*\x00-\x1f]/g, "_").split(BACKSLASH2).join("_").replace(/\s+/g, "_").replace(/_+/g, "_").slice(0, 80).replace(/^_+|_+$/g, "") || fallback;
  }
  function createRecordFolder(dirHandle, { isRecord, toRecord, nameOf, label = "song" }) {
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
      const records = [];
      const errors = [];
      const seen = /* @__PURE__ */ new Set();
      fileOf.clear();
      occupied.clear();
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".json")) continue;
        try {
          const file = await entry.getFile();
          const data = JSON.parse(await file.text());
          if (!isRecord(data)) throw new Error(`Not a ${label} file`);
          if (seen.has(data.id)) throw new Error("Duplicate id " + data.id);
          seen.add(data.id);
          records.push(toRecord(data));
          fileOf.set(data.id, entry.name);
        } catch (err) {
          occupied.add(entry.name.toLowerCase());
          errors.push({ file: entry.name, message: err.message });
        }
      }
      return { records, errors };
    }
    async function write(record) {
      const clean = toRecord(record);
      const previous = fileOf.get(clean.id);
      const name = unusedName(safeFilename(nameOf(clean), label), clean.id);
      await writeText(name, JSON.stringify(clean, null, 2));
      fileOf.set(clean.id, name);
      if (previous && previous !== name) await removeFile(previous);
    }
    async function remove(id) {
      const name = fileOf.get(id);
      if (!name) return;
      await removeFile(name);
      fileOf.delete(id);
    }
    return { name: dirHandle.name, list, write, remove, writeText };
  }

  // src/songs/folder.js
  var HANDLE_KEY = "library-dir";
  function createSongFolder(dirHandle) {
    const base = createRecordFolder(dirHandle, { isRecord: isSongRecord, toRecord: toSongRecord, nameOf: (s) => s.title, label: "song" });
    return {
      name: base.name,
      async list() {
        const { records, errors } = await base.list();
        return { songs: records, errors };
      },
      write: base.write,
      remove: base.remove,
      writeLyrics: (songs) => base.writeText(LYRICS_FILENAME, buildLyricsFile(songs))
    };
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

  // src/dock/songs/library-tools.js
  var PICKER_ID = "obs-songs";
  function initLibraryTools({ library, kv, setStatus, report: report2, onChanged, onFolderChange = async () => {
  } }) {
    const banner = $("library-banner"), btnTools = $("btn-tools"), menu = $("tools-menu"), statusLine = $("library-status"), toolChoose = $("tool-choose-folder"), toolReconnect = $("tool-reconnect"), toolRewrite = $("tool-rewrite-lyrics"), toolStop = $("tool-stop-folder");
    let pendingHandle = null;
    function setMenu(open) {
      menu.classList.toggle("hidden", !open);
      btnTools.setAttribute("aria-expanded", String(open));
    }
    function render() {
      const mode = library.mode();
      banner.classList.toggle("hidden", mode === "folder");
      banner.classList.toggle("is-lost", mode === "folder-lost");
      banner.textContent = mode === "folder-lost" ? "Lost access to the song folder. Songs are safe in this browser. Open Library tools and choose Reconnect." : "Songs are saved in this browser only. Open Library tools and choose a library folder to keep them as files and a lyrics.txt.";
      statusLine.textContent = mode === "folder" ? "Folder: " + (pendingHandle ? pendingHandle.name : "connected") : mode === "folder-lost" ? "Folder not connected" : "Songs stored in this browser only";
      toolReconnect.classList.toggle("hidden", mode !== "folder-lost");
      toolStop.classList.toggle("hidden", mode !== "folder");
      toolRewrite.disabled = mode !== "folder";
      toolChoose.textContent = mode === "folder" ? "Change library folder" : "Choose library folder";
      onChanged();
    }
    async function attach(handle, successMessage) {
      const result = await library.attachFolder(createSongFolder(handle));
      pendingHandle = handle;
      await saveHandle(kv, handle);
      result.errors.forEach((e) => report2(new Error(e.file + ": " + e.message)));
      const skipped = result.errors.length ? " " + result.errors.length + " file(s) were skipped (see Diagnostics)." : "";
      setStatus(successMessage + " " + result.loaded + " song(s) loaded, " + result.carried + " added." + skipped, "success");
      try {
        await onFolderChange(handle);
      } catch (err) {
        report2(err);
        setStatus("Songs are ready, but plans could not use the folder.", "error");
      }
      render();
    }
    async function chooseFolder() {
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
    }
    async function reconnect() {
      try {
        if (pendingHandle && await ensurePermission(pendingHandle, { request: true })) await attach(pendingHandle, "Reconnected.");
        else await chooseFolder();
      } catch (err) {
        report2(err);
        setStatus("Could not reconnect to the folder.", "error");
      }
    }
    function exportSongs() {
      const songs = library.list();
      if (!songs.length) {
        setStatus("No songs to export.", "error");
        return;
      }
      const blob = new Blob([JSON.stringify({ version: 1, songs }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "stage-songs-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus("Exported " + songs.length + " songs.", "success");
    }
    async function removeDuplicates() {
      const groups = findDuplicateGroups(library.list());
      if (!groups.length) {
        setStatus("No duplicate songs found.", "");
        return;
      }
      const extra = groups.reduce((n, g) => n + (g.length - 1), 0);
      if (!confirm("Found " + groups.length + " title" + (groups.length !== 1 ? "s" : "") + " with duplicates (" + extra + " extra cop" + (extra !== 1 ? "ies" : "y") + ").\n\nFor each, the version with the most slides will be kept and the rest deleted. This cannot be undone.")) return;
      const ids = pickRemovals(groups);
      await library.removeMany([...ids]);
      onChanged();
      setStatus("Removed " + ids.size + " duplicate song" + (ids.size !== 1 ? "s" : "") + ".", "success");
    }
    async function clearLibrary() {
      const count = library.list().length;
      if (!count) {
        setStatus("Library is already empty.", "");
        return;
      }
      const inFolder = library.mode() === "folder";
      if (!confirm("Delete ALL " + count + " song" + (count !== 1 ? "s" : "") + " from the library?\n\n" + (inFolder ? "Their files in the library folder will be deleted too. " : "") + "This cannot be undone. If you have not backed up, click Cancel, use Export all as JSON first, then come back.")) return;
      if (prompt("To confirm, type DELETE below:") !== "DELETE") {
        setStatus("Clear cancelled. Nothing was deleted.", "");
        return;
      }
      await library.clearAll();
      onChanged();
      setStatus("Library cleared. Import your songs again to bring them back.", "success");
    }
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
    btnTools.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenu(menu.classList.contains("hidden"));
    });
    menu.addEventListener("click", () => setMenu(false));
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== btnTools) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.classList.contains("hidden")) {
        setMenu(false);
        e.stopPropagation();
      }
    }, true);
    toolChoose.addEventListener("click", chooseFolder);
    toolReconnect.addEventListener("click", reconnect);
    toolRewrite.addEventListener("click", async () => {
      await library.rewriteLyrics();
      const ok = library.mode() === "folder";
      setStatus(ok ? "lyrics.txt rewritten." : "Folder not connected.", ok ? "success" : "error");
      render();
    });
    toolStop.addEventListener("click", () => {
      library.detach();
      pendingHandle = null;
      Promise.resolve(onFolderChange(null)).catch(report2);
      setStatus("No longer using the folder. Songs stay in this browser.", "");
      render();
    });
    $("tool-export").addEventListener("click", exportSongs);
    $("tool-duplicates").addEventListener("click", removeDuplicates);
    $("tool-clear-all").addEventListener("click", clearLibrary);
    return { restore, render };
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

  // src/overlay/style-math.js
  var CARD_DEFAULT = { frosted: true, "frosted-light": true, pure: false, "sacred-light": true, custom: true };
  function defaultShowCard(theme) {
    return CARD_DEFAULT[theme] ?? true;
  }

  // src/dock/style/segmented.js
  function bindSegmented(container, { get, set }) {
    const buttons = [...container.querySelectorAll("button[data-value]")];
    function paint() {
      const current = get();
      buttons.forEach((button) => {
        const on = button.dataset.value === current;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", String(on));
      });
    }
    buttons.forEach((button) => button.addEventListener("click", () => {
      set(button.dataset.value);
      paint();
    }));
    paint();
    return { paint };
  }

  // src/dock/style/bg-image.js
  var MAX_WIDTH = 1920;
  var JPEG_QUALITY = 0.85;
  var UNREADABLE = "That image could not be read.";
  function readBackgroundImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(UNREADABLE));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error(UNREADABLE));
        img.onload = () => {
          const ratio = Math.min(1, MAX_WIDTH / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
          } catch {
            resolve(e.target.result);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // src/dock/style/style-tab.js
  function initStyleTab({ session, store, setStatus, report: report2 }) {
    const fontSel = $("font-sel"), btnItalic = $("btn-italic"), opacitySlider = $("opacity-slider"), opacityValue = $("opacity-value"), scaleSlider = $("scale-slider"), scaleValue = $("scale-value"), showCardCb = $("show-card-cb"), showTitleCb = $("show-title-cb"), showRefCb = $("show-ref-cb"), customSection = $("custom-colors-section"), colorBg = $("color-bg"), colorText = $("color-text"), colorAccent = $("color-accent"), btnBgImage = $("btn-bg-image"), btnBgClear = $("btn-bg-clear"), bgName = $("bg-image-name"), bgInput = $("bg-image-input");
    FONTS.forEach((font) => {
      const option = document.createElement("option");
      option.value = font.value;
      option.textContent = font.label;
      fontSel.appendChild(option);
    });
    function sync() {
      const s = store.get();
      fontSel.value = s.font;
      btnItalic.setAttribute("aria-pressed", String(!!s.italic));
      btnItalic.classList.toggle("on", !!s.italic);
      opacitySlider.value = String(s.opacity);
      opacityValue.textContent = s.opacity + "%";
      scaleSlider.value = String(s.scale);
      scaleValue.textContent = s.scale + "%";
      showCardCb.checked = s.showCard !== false;
      showTitleCb.checked = s.showTitle !== false;
      showRefCb.checked = s.showReference !== false;
      customSection.classList.toggle("hidden", s.theme !== "custom");
      colorBg.value = s.customColors.bg;
      colorText.value = s.customColors.text;
      colorAccent.value = s.customColors.accent;
      btnBgClear.classList.toggle("hidden", !s.bgImage);
      bgName.textContent = s.bgImage ? "Custom image in use" : "None, using the theme colour";
      segments.forEach((segment) => segment.paint());
    }
    function change(patch) {
      store.update(patch);
      session.resendIfLive();
      sync();
    }
    const segments = [
      bindSegmented($("theme-swatches"), {
        get: () => store.get().theme,
        set: (theme) => change({ theme, showCard: defaultShowCard(theme) })
      }),
      bindSegmented($("anim-seg"), { get: () => store.get().animation, set: (animation) => change({ animation }) }),
      bindSegmented($("position-seg"), { get: () => store.get().position, set: (position) => change({ position }) }),
      bindSegmented($("size-seg"), { get: () => store.get().fontSize, set: (fontSize) => change({ fontSize }) })
    ];
    fontSel.addEventListener("change", () => change({ font: fontSel.value }));
    btnItalic.addEventListener("click", () => change({ italic: !store.get().italic }));
    opacitySlider.addEventListener("input", () => change({ opacity: Number(opacitySlider.value) }));
    scaleSlider.addEventListener("input", () => change({ scale: Number(scaleSlider.value) }));
    showCardCb.addEventListener("change", () => change({ showCard: showCardCb.checked }));
    showTitleCb.addEventListener("change", () => change({ showTitle: showTitleCb.checked }));
    showRefCb.addEventListener("change", () => change({ showReference: showRefCb.checked }));
    [colorBg, colorText, colorAccent].forEach((input) => input.addEventListener("input", () => {
      change({ customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value } });
    }));
    btnBgImage.addEventListener("click", () => bgInput.click());
    bgInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      bgInput.value = "";
      if (!file) return;
      try {
        change({ bgImage: await readBackgroundImage(file) });
        setStatus("Background image set.", "success");
      } catch (err) {
        report2(err);
        setStatus(err.message, "error");
      }
    });
    btnBgClear.addEventListener("click", () => {
      change({ bgImage: null });
      setStatus("Background image removed.", "");
    });
    sync();
  }

  // src/plan/model.js
  var PLAN_VERSION = 1;
  var DEFAULT_PLAN_NAME = "Untitled plan";
  var cleanName = (name) => (name || "").trim() || DEFAULT_PLAN_NAME;
  var isItem = (i) => !!i && typeof i === "object" && typeof i.id === "string" && typeof i.type === "string";
  function isPlanRecord(x) {
    return !!x && typeof x === "object" && typeof x.id === "string" && typeof x.name === "string" && (x.v === void 0 || Number.isInteger(x.v) && x.v <= PLAN_VERSION) && Array.isArray(x.items) && x.items.every(isItem);
  }
  function toPlanRecord(x) {
    return { v: PLAN_VERSION, id: x.id, name: x.name, items: x.items.map((i) => ({ ...i })) };
  }
  function createPlan(name = DEFAULT_PLAN_NAME, uid2 = uid) {
    return { v: PLAN_VERSION, id: "p_" + uid2(), name: cleanName(name), items: [] };
  }
  var songItem = (songId, uid2 = uid) => ({ id: "i_" + uid2(), type: "song", songId });
  var readingItem = (ref, translation, uid2 = uid) => ({ id: "i_" + uid2(), type: "reading", ref, translation });
  var announcementItem = ({ title = "", body = "" }, uid2 = uid) => ({ id: "i_" + uid2(), type: "announcement", title: title.trim(), body: body.trim() });
  function timerItem({ mode, seconds, at, title = "" }, uid2 = uid) {
    const base = { id: "i_" + uid2(), type: "timer", mode };
    const spec = mode === "clock" ? { at } : { seconds };
    return { ...base, ...spec, title: title.trim() };
  }
  function addItem(plan, item, afterId = null) {
    const at = afterId === null ? -1 : plan.items.findIndex((i) => i.id === afterId);
    const index = at === -1 ? plan.items.length : at + 1;
    return { ...plan, items: [...plan.items.slice(0, index), item, ...plan.items.slice(index)] };
  }
  function moveItemTo(plan, id, toIndex) {
    const from = plan.items.findIndex((i) => i.id === id);
    if (from === -1) return plan;
    const to = Math.max(0, Math.min(plan.items.length - 1, toIndex));
    if (to === from) return plan;
    const rest = plan.items.filter((i) => i.id !== id);
    return { ...plan, items: [...rest.slice(0, to), plan.items[from], ...rest.slice(to)] };
  }
  function moveItem(plan, id, delta) {
    const from = plan.items.findIndex((i) => i.id === id);
    return from === -1 ? plan : moveItemTo(plan, id, from + delta);
  }
  function removeItem(plan, id) {
    return plan.items.some((i) => i.id === id) ? { ...plan, items: plan.items.filter((i) => i.id !== id) } : plan;
  }
  var renamePlan = (plan, name) => ({ ...plan, name: cleanName(name) });
  function uniqueName(plans, name, exceptId = null) {
    const base = cleanName(name);
    const taken = new Set(plans.filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2;
    while (taken.has((base + " (" + n + ")").toLowerCase())) n += 1;
    return base + " (" + n + ")";
  }
  function replaceItem(plan, id, item) {
    if (!plan.items.some((i) => i.id === id)) return plan;
    return { ...plan, items: plan.items.map((i) => i.id === id ? { ...item, id } : i) };
  }

  // src/plan/folder.js
  var PLANS_DIR = "plans";
  async function createPlanFolder(dirHandle) {
    const dir = await dirHandle.getDirectoryHandle(PLANS_DIR, { create: true });
    return createRecordFolder(dir, { isRecord: isPlanRecord, toRecord: toPlanRecord, nameOf: (p) => p.name, label: "plan" });
  }

  // src/plan/store.js
  function createPlanStore({ local, onError = () => {
  }, canWrite = () => true, uid: uid2 = uid }) {
    let plans = local.load();
    let folder = null;
    let unreadable = [];
    const dirty = new Set(local.loadDirty());
    async function persist({ write = [], remove: remove2 = [] } = {}) {
      if (!folder || !canWrite()) {
        write.forEach((p) => dirty.add(p.id));
      } else {
        try {
          for (const plan of write) await folder.write(plan);
          for (const id of remove2) await folder.remove(id);
          write.forEach((p) => dirty.delete(p.id));
        } catch (err) {
          onError(err);
          write.forEach((p) => dirty.add(p.id));
        }
      }
      local.save(plans);
      local.saveDirty([...dirty]);
    }
    const get = (id) => plans.find((p) => p.id === id) || null;
    async function save(input) {
      const record = toPlanRecord({ ...input, id: input.id || "p_" + uid2(), name: uniqueName(plans, input.name, input.id) });
      plans = plans.some((p) => p.id === record.id) ? plans.map((p) => p.id === record.id ? record : p) : [...plans, record];
      await persist({ write: [record] });
      return record;
    }
    async function remove(id) {
      if (!get(id)) return;
      plans = plans.filter((p) => p.id !== id);
      dirty.delete(id);
      await persist({ remove: [id] });
    }
    async function duplicate(id) {
      const source = get(id);
      if (!source) return null;
      return save({
        ...source,
        id: "p_" + uid2(),
        name: source.name + " (copy)",
        items: source.items.map((i) => ({ ...i, id: "i_" + uid2() }))
      });
    }
    async function attach(dirHandle) {
      const newFolder = await createPlanFolder(dirHandle);
      const { records, errors } = await newFolder.list();
      const edited = new Set(dirty);
      dirty.clear();
      const inFolder = new Set(records.map((p) => p.id));
      const carried = plans.filter((p) => edited.has(p.id) || !inFolder.has(p.id));
      folder = newFolder;
      unreadable = errors;
      plans = [...records.filter((p) => !edited.has(p.id)), ...carried];
      await persist({ write: carried });
      return { loaded: records.length, carried: carried.length, errors };
    }
    function detach() {
      folder = null;
      unreadable = [];
      local.save(plans);
    }
    return {
      list: () => plans,
      get,
      save,
      remove,
      duplicate,
      attach,
      detach,
      unreadable: () => unreadable,
      lastId: () => local.loadLastId(),
      setLastId: (id) => local.saveLastId(id)
    };
  }

  // src/plan/local-store.js
  var PLANS_KEY = "obs-stage-plans";
  var LAST_PLAN_KEY = "obs-stage-last-plan";
  var DIRTY_KEY = "obs-stage-plans-dirty";
  function createLocalPlanStore(storage, onError = () => {
  }) {
    function load() {
      try {
        const raw = storage?.getItem(PLANS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isPlanRecord).map(toPlanRecord) : [];
      } catch (err) {
        onError(err);
        return [];
      }
    }
    function save(plans) {
      try {
        storage?.setItem(PLANS_KEY, JSON.stringify(plans));
      } catch (err) {
        onError(err);
      }
    }
    function loadLastId() {
      try {
        return storage?.getItem(LAST_PLAN_KEY) || null;
      } catch (err) {
        onError(err);
        return null;
      }
    }
    function saveLastId(id) {
      try {
        if (id) storage?.setItem(LAST_PLAN_KEY, id);
        else storage?.removeItem(LAST_PLAN_KEY);
      } catch (err) {
        onError(err);
      }
    }
    function loadDirty() {
      try {
        const parsed = JSON.parse(storage?.getItem(DIRTY_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
      } catch (err) {
        onError(err);
        return [];
      }
    }
    function saveDirty(ids) {
      try {
        storage?.setItem(DIRTY_KEY, JSON.stringify(ids));
      } catch (err) {
        onError(err);
      }
    }
    return { load, save, loadLastId, saveLastId, loadDirty, saveDirty };
  }

  // src/overlay/timer-clock.js
  function remainingMs(timer, now) {
    if (typeof timer.endAt === "number") return Math.max(0, timer.endAt - now);
    return Math.max(0, timer.remainingMs || 0);
  }
  function formatClock(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1e3);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hours > 0 ? hours + ":" + pad(minutes) + ":" + pad(seconds) : minutes + ":" + pad(seconds);
  }

  // src/plan/extras.js
  var MAX_TIMER_SECONDS = 359999;
  var CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  var isValidClockTime = (at) => typeof at === "string" && CLOCK_TIME.test(at);
  function isValidTimerSpec(spec) {
    if (!spec || typeof spec !== "object") return false;
    if (spec.mode === "duration") {
      return Number.isInteger(spec.seconds) && spec.seconds >= 1 && spec.seconds <= MAX_TIMER_SECONDS;
    }
    if (spec.mode === "clock") return isValidClockTime(spec.at);
    return false;
  }
  function clockEndAt(at, now) {
    const [hours, minutes] = at.split(":").map(Number);
    const day = new Date(now);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
  }
  function describeTimerSpec(spec) {
    return spec.mode === "clock" ? "at " + spec.at : formatClock(spec.seconds * 1e3);
  }
  function parseClockInput(text) {
    const raw = typeof text === "string" ? text.trim() : "";
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw) || /^(\d{1,2})(\d{2})$/.exec(raw);
    if (!match) return null;
    const at = match[1].padStart(2, "0") + ":" + match[2];
    return isValidClockTime(at) ? at : null;
  }
  var WHOLE_NUMBER = /^\d+$/;
  function announcementFromInputs({ title = "", body = "" }) {
    if (!body.trim()) return { ok: false, hint: "Write the text to show." };
    return { ok: true, draft: { type: "announcement", title: title.trim(), body: body.trim() } };
  }
  function timerFromInputs({ mode, title = "", minutes = "", seconds = "", clock = "" }) {
    const label = title.trim();
    if (mode === "clock") {
      const at = parseClockInput(clock);
      return at ? { ok: true, draft: { type: "timer", mode: "clock", at, title: label } } : { ok: false, hint: "Enter a 24-hour time such as 10:30." };
    }
    const m = minutes.trim() || "0";
    const s = seconds.trim() || "0";
    if (!WHOLE_NUMBER.test(m) || !WHOLE_NUMBER.test(s)) return { ok: false, hint: "Use whole numbers for minutes and seconds." };
    if (Number(s) > 59) return { ok: false, hint: "Seconds go up to 59." };
    const total = Number(m) * 60 + Number(s);
    if (total < 1) return { ok: false, hint: "Enter a time of at least 1 second." };
    if (total > MAX_TIMER_SECONDS) return { ok: false, hint: "The longest timer is 99:59:59." };
    return { ok: true, draft: { type: "timer", mode: "duration", seconds: total, title: label } };
  }

  // src/plan/cursor.js
  var titleOk = (item) => item.title === void 0 || typeof item.title === "string";
  function itemStatus(item, library) {
    if (item.type === "song") return library.get(item.songId) ? "ok" : "missing";
    if (item.type === "reading") return typeof item.ref === "string" && item.ref.trim() ? "ok" : "unsupported";
    if (item.type === "announcement") return typeof item.body === "string" && item.body.trim() && titleOk(item) ? "ok" : "unsupported";
    if (item.type === "timer") return isValidTimerSpec(item) && titleOk(item) ? "ok" : "unsupported";
    return "unsupported";
  }
  function itemTitle(item, library) {
    const status = itemStatus(item, library);
    if (item.type === "song") return status === "ok" ? library.get(item.songId).title || "Untitled" : "Song missing";
    if (status !== "ok") return "Unsupported item";
    if (item.type === "reading") return item.ref;
    if (item.type === "announcement") return (item.title || "").trim() || item.body.trim().split("\n")[0];
    return (item.title || "").trim() || describeTimerSpec(item);
  }
  var indexOfItem = (plan, id) => id === null ? -1 : plan.items.findIndex((i) => i.id === id);
  function nextLoadable(plan, currentId, library) {
    for (let i = indexOfItem(plan, currentId) + 1; i < plan.items.length; i += 1) {
      if (itemStatus(plan.items[i], library) === "ok") return plan.items[i];
    }
    return null;
  }
  function prevLoadable(plan, currentId, library) {
    for (let i = indexOfItem(plan, currentId) - 1; i >= 0; i -= 1) {
      if (itemStatus(plan.items[i], library) === "ok") return plan.items[i];
    }
    return null;
  }
  function currentAfterRemove(plan, currentId, removedId) {
    if (currentId !== removedId) return currentId;
    const at = indexOfItem(plan, removedId);
    return at > 0 ? plan.items[at - 1].id : null;
  }
  function planSummary(plan, currentId, library) {
    const total = plan.items.length;
    if (!total) return null;
    const at = indexOfItem(plan, currentId);
    const next = nextLoadable(plan, currentId, library);
    const where = at === -1 ? total + (total === 1 ? " item" : " items") : at + 1 + " of " + total;
    return where + " \xB7 " + (next ? "Next: " + itemTitle(next, library) : "End of plan");
  }

  // src/dock/plan/extras-editor.js
  function initExtrasEditor({ onAdd, onSave, onShowNow }) {
    const root = $("extras-editor"), heading = $("ed-heading"), title = $("ed-title"), text = $("ed-text"), announcementFields = $("ed-announcement-fields"), timerFields = $("ed-timer-fields"), modeButtons = [...document.querySelectorAll("#ed-mode button")], durationFields = $("ed-duration-fields"), clockFields = $("ed-clock-fields"), minutes = $("ed-minutes"), seconds = $("ed-seconds"), clock = $("ed-clock"), hint = $("ed-hint"), btnAdd = $("ed-add"), btnShow = $("ed-show"), btnCancel = $("ed-cancel");
    let type = "announcement";
    let mode = "duration";
    let editingId = null;
    function read() {
      return type === "announcement" ? announcementFromInputs({ title: title.value, body: text.value }) : timerFromInputs({ mode, title: title.value, minutes: minutes.value, seconds: seconds.value, clock: clock.value });
    }
    function setMode(next) {
      mode = next;
      modeButtons.forEach((button) => {
        const on = button.dataset.value === mode;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", String(on));
      });
      durationFields.classList.toggle("hidden", mode !== "duration");
      clockFields.classList.toggle("hidden", mode !== "clock");
    }
    function update() {
      const result = read();
      hint.textContent = result.ok ? "" : result.hint;
      btnAdd.disabled = !result.ok;
      btnShow.disabled = !result.ok;
    }
    function close() {
      root.classList.add("hidden");
      editingId = null;
    }
    function open({ type: nextType, item = null }) {
      type = nextType;
      editingId = item ? item.id : null;
      heading.textContent = (item ? "Edit " : "New ") + (type === "announcement" ? "announcement" : "timer");
      announcementFields.classList.toggle("hidden", type !== "announcement");
      timerFields.classList.toggle("hidden", type !== "timer");
      title.value = item ? item.title || "" : "";
      text.value = item && type === "announcement" ? item.body || "" : "";
      setMode(item && item.mode === "clock" ? "clock" : "duration");
      const total = item && item.mode === "duration" && Number.isInteger(item.seconds) && item.seconds > 0 ? item.seconds : 0;
      minutes.value = total ? String(Math.floor(total / 60)) : "";
      seconds.value = total ? String(total % 60) : "";
      clock.value = item && item.mode === "clock" ? item.at || "" : "";
      btnAdd.textContent = item ? "Save" : "Add to plan";
      root.classList.remove("hidden");
      update();
      (type === "announcement" ? text : minutes).focus();
    }
    [title, text, minutes, seconds, clock].forEach((field) => field.addEventListener("input", update));
    modeButtons.forEach((button) => button.addEventListener("click", () => {
      setMode(button.dataset.value);
      update();
    }));
    btnAdd.addEventListener("click", () => {
      const result = read();
      if (!result.ok) return;
      if (editingId) onSave(result.draft, editingId);
      else onAdd(result.draft);
      close();
    });
    btnShow.addEventListener("click", () => {
      const result = read();
      if (!result.ok) return;
      onShowNow(result.draft);
      close();
    });
    btnCancel.addEventListener("click", close);
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        close();
        e.stopPropagation();
      }
    });
    return { open, close, isOpen: () => !root.classList.contains("hidden") };
  }

  // src/dock/plan/plan-tab.js
  var TYPE_ICON = { song: "\u266B", reading: "\u271D", announcement: "\u270E", timer: "\u23F1" };
  var BANNER_TEXT = {
    local: "Plans are saved in this browser only. Open Songs, Library tools and choose a library folder to keep them as files.",
    "folder-lost": "Lost access to the library folder. Plans are safe in this browser. Open Songs, Library tools and choose Reconnect."
  };
  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== void 0) el.textContent = text;
    return el;
  }
  function initPlanTab({ session, store, library, tabs, setStatus, showView, refresh, report: report2 }) {
    const select = $("plan-select"), listEl = $("plan-list"), banner = $("plan-banner"), unreadableEl = $("plan-unreadable"), btnMenu = $("btn-plan-menu"), menu = $("plan-menu"), picker = $("picker-banner"), pickerText = $("picker-text"), btnNext = $("btn-next-item");
    let plan = store.get(store.lastId()) || store.list()[0] || createPlan();
    let currentId = null;
    let picking = null;
    let queue = Promise.resolve();
    let loading = false;
    let openRowId = null;
    let dragId = null;
    const enqueue = (job) => {
      queue = queue.then(job).catch(report2);
      return queue;
    };
    async function commit(next) {
      plan = next;
      if (store.get(plan.id) || plan.items.length || plan.name !== DEFAULT_PLAN_NAME) plan = await store.save(plan);
      store.setLastId(plan.id);
      render();
    }
    const edit = (change) => enqueue(() => commit(change(plan)));
    const openPlan = (next) => enqueue(async () => {
      plan = next;
      currentId = null;
      store.setLastId(plan.id);
      render();
    });
    const draftItem = (draft) => draft.type === "announcement" ? announcementItem(draft) : timerItem(draft);
    function showNow(draft) {
      const item = draftItem(draft);
      if (!tabs[draft.type].load(item)) {
        setStatus("That could not be loaded.", "error");
        return;
      }
      session.setTab(draft.type);
      if (tabs[draft.type].markShown) tabs[draft.type].markShown();
      session.show();
      setStatus(draft.type === "timer" ? "Timer is running." : "Announcement is live.", "success");
    }
    const editor = initExtrasEditor({
      onAdd: (draft) => {
        edit((p) => addItem(p, draftItem(draft), currentId));
        setStatus("Added " + (draft.title || draft.type) + " to the plan.", "success");
      },
      onSave: (draft, id) => {
        const saved = draftItem(draft);
        edit((p) => replaceItem(p, id, saved));
        if (id === currentId) tabs[draft.type].load(saved);
        setStatus("Saved.", "success");
      },
      onShowNow: showNow
    });
    function renderSelect() {
      const known = store.list();
      const entries = known.some((p) => p.id === plan.id) ? known : [...known, plan];
      select.replaceChildren(...entries.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
        const option = make("option", "", p.name);
        option.value = p.id;
        return option;
      }));
      select.value = plan.id;
    }
    function renderBanner() {
      const mode = library.mode();
      banner.classList.toggle("hidden", mode === "folder");
      banner.classList.toggle("is-lost", mode === "folder-lost");
      banner.textContent = BANNER_TEXT[mode] || "";
      const bad = store.unreadable();
      unreadableEl.classList.toggle("hidden", !bad.length);
      unreadableEl.textContent = bad.map((e) => "Unreadable plan file: " + e.file).join(" \xB7 ");
      picker.classList.toggle("hidden", !picking);
      pickerText.textContent = "Adding to " + plan.name;
    }
    function statusText(item, index, currentIndex) {
      const status = itemStatus(item, library);
      if (status !== "ok") return status;
      if (item.id === currentId) {
        const pos = item.type === "song" && tabs.songs ? tabs.songs.position() : null;
        if (pos && pos.songId === item.songId && pos.index !== null) return "slide " + (pos.index + 1) + "/" + pos.count;
        return "loaded";
      }
      if (index < currentIndex) return "done";
      if (item.type === "song") {
        const count = library.get(item.songId).slides.length;
        return count + (count === 1 ? " slide" : " slides");
      }
      if (item.type === "announcement") return "announcement";
      if (item.type === "timer") return describeTimerSpec(item);
      return item.translation || "reading";
    }
    function renderRow(item, index, currentIndex) {
      const status = itemStatus(item, library);
      const li = make("li", "plan-item" + (item.id === currentId ? " cur" : "") + (index < currentIndex ? " done" : "") + (status !== "ok" ? " missing" : ""));
      li.dataset.id = item.id;
      const grip = make("span", "plan-grip", "\u2261");
      grip.setAttribute("aria-hidden", "true");
      const icon = make("span", "plan-icon", TYPE_ICON[item.type] || "?");
      const title = make("button", "plan-title", itemTitle(item, library));
      title.type = "button";
      title.addEventListener("click", () => loadItem(item));
      const state = make("span", "plan-status", statusText(item, index, currentIndex));
      const more = make("button", "plan-more", "\u22EF");
      more.type = "button";
      more.setAttribute("aria-label", "Actions for " + itemTitle(item, library));
      more.setAttribute("aria-expanded", String(openRowId === item.id));
      more.addEventListener("click", () => {
        openRowId = openRowId === item.id ? null : item.id;
        render();
      });
      li.append(grip, icon, title, state, more);
      if (openRowId === item.id) li.appendChild(renderActions(item, index));
      wireDrag(li, item);
      return li;
    }
    function renderNext() {
      const next = nextLoadable(plan, currentId, library);
      btnNext.disabled = !next;
      btnNext.textContent = !plan.items.length || next ? "Next item \xBB" : "End of plan";
    }
    function actionButton(className, text, onClick) {
      const button = make("button", className, text);
      button.type = "button";
      button.addEventListener("click", onClick);
      return button;
    }
    function renderActions(item, index) {
      const actions = make("div", "row-actions");
      const up = actionButton("btn btn-ghost", "Move up", () => edit((p) => moveItem(p, item.id, -1)));
      up.disabled = index === 0;
      const down = actionButton("btn btn-ghost", "Move down", () => edit((p) => moveItem(p, item.id, 1)));
      down.disabled = index === plan.items.length - 1;
      const canEdit = item.type === "announcement" || item.type === "timer";
      const editButton = canEdit ? [actionButton("btn btn-ghost", "Edit", () => editor.open({ type: item.type, item }))] : [];
      actions.append(...editButton, up, down, actionButton("btn btn-danger", "Remove", () => removeRow(item.id)));
      return actions;
    }
    function removeRow(id) {
      enqueue(async () => {
        currentId = currentAfterRemove(plan, currentId, id);
        openRowId = null;
        await commit(removeItem(plan, id));
      });
    }
    function wireDrag(li, item) {
      li.draggable = true;
      li.addEventListener("dragstart", (e) => {
        dragId = item.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
      });
      li.addEventListener("dragover", (e) => {
        if (dragId) e.preventDefault();
      });
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const moving = dragId;
        dragId = null;
        if (moving && moving !== item.id) edit((p) => moveItemTo(p, moving, indexOfItem(p, item.id)));
      });
      li.addEventListener("dragend", () => {
        dragId = null;
      });
    }
    function renderRows() {
      if (!plan.items.length) {
        listEl.replaceChildren(make("li", "plan-empty faint", "Nothing planned yet. Use + Song or + Verse, or press + Plan on a song or verse."));
        return;
      }
      const currentIndex = indexOfItem(plan, currentId);
      listEl.replaceChildren(...plan.items.map((item, index) => renderRow(item, index, currentIndex)));
    }
    function render() {
      renderSelect();
      renderBanner();
      renderRows();
      renderNext();
      refresh();
    }
    async function loadItem(item) {
      if (loading) {
        setStatus("Still loading, try again in a moment.", "");
        return;
      }
      const status = itemStatus(item, library);
      if (status !== "ok") {
        setStatus(status === "missing" ? "That song is no longer in the library." : "This kind of item cannot be loaded yet.", "error");
        return;
      }
      loading = true;
      try {
        if (item.type === "song") {
          if (!tabs.songs.loadSong(item.songId)) {
            setStatus("Finish or discard the song you are editing first.", "error");
            return;
          }
          session.setTab("songs");
        } else if (item.type === "announcement" || item.type === "timer") {
          tabs[item.type].load(item);
          session.setTab(item.type);
        } else {
          const ok = await tabs.scripture.loadReading(item.ref, item.translation);
          if (ok === null) return;
          if (ok) session.setTab("scripture");
        }
        currentId = item.id;
        render();
      } finally {
        loading = false;
      }
    }
    async function nextItem() {
      const next = nextLoadable(plan, currentId, library);
      if (!next) {
        setStatus("End of the plan.", "");
        return;
      }
      await loadItem(next);
    }
    async function prevItem() {
      const prev = prevLoadable(plan, currentId, library);
      if (!prev) {
        setStatus("Start of the plan.", "");
        return;
      }
      await loadItem(prev);
    }
    function finishAdd(keepOpen, label) {
      setStatus("Added " + label + " to " + plan.name + ".", "success");
      if (picking && !keepOpen) {
        picking = null;
        showView("plan");
      }
    }
    async function addSong(songId, keepOpen = false) {
      await edit((p) => addItem(p, songItem(songId), currentId));
      const song = library.get(songId);
      finishAdd(keepOpen, song ? song.title : "song");
    }
    async function addReading(ref, translation, keepOpen = false) {
      await edit((p) => addItem(p, readingItem(ref, translation), currentId));
      finishAdd(keepOpen, ref);
    }
    function startPicking(target) {
      picking = target;
      showView(target);
      if (target === "scripture" && tabs.scripture) tabs.scripture.focus();
    }
    function setMenu(open) {
      menu.classList.toggle("hidden", !open);
      btnMenu.setAttribute("aria-expanded", String(open));
    }
    btnMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenu(menu.classList.contains("hidden"));
    });
    menu.addEventListener("click", () => setMenu(false));
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== btnMenu) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.classList.contains("hidden")) {
        setMenu(false);
        e.stopPropagation();
      }
    }, true);
    $("plan-new").addEventListener("click", () => {
      const name = prompt("Name for the new plan:", "");
      if (name === null) return;
      enqueue(async () => {
        currentId = null;
        await commit(createPlan(name));
      });
    });
    $("plan-rename").addEventListener("click", () => {
      const name = prompt("Rename this plan:", plan.name);
      if (name === null) return;
      edit((p) => renamePlan(p, name));
    });
    $("plan-duplicate").addEventListener("click", () => enqueue(async () => {
      if (!store.get(plan.id)) {
        setStatus("Add an item before duplicating this plan.", "error");
        return;
      }
      const copy = await store.duplicate(plan.id);
      plan = copy;
      currentId = null;
      store.setLastId(plan.id);
      render();
      setStatus('Duplicated as "' + copy.name + '".', "success");
    }));
    $("plan-delete").addEventListener("click", () => {
      if (!confirm('Delete the plan "' + plan.name + '"? This cannot be undone.')) return;
      enqueue(async () => {
        await store.remove(plan.id);
        plan = createPlan();
        currentId = null;
        store.setLastId(null);
        render();
        setStatus("Plan deleted.", "");
      });
    });
    select.addEventListener("change", () => {
      const chosen = store.get(select.value);
      select.blur();
      if (chosen) openPlan(chosen);
    });
    $("btn-plan-add-announcement").addEventListener("click", () => editor.open({ type: "announcement" }));
    $("btn-plan-add-timer").addEventListener("click", () => editor.open({ type: "timer" }));
    btnNext.addEventListener("click", nextItem);
    $("btn-plan-add-song").addEventListener("click", () => startPicking("songs"));
    $("btn-plan-add-verse").addEventListener("click", () => startPicking("scripture"));
    $("picker-back").addEventListener("click", () => showView("plan"));
    function reload() {
      enqueue(async () => {
        const fresh = store.get(plan.id) || store.get(store.lastId()) || store.list()[0];
        if (fresh) plan = fresh;
        if (indexOfItem(plan, currentId) === -1) currentId = null;
        render();
      });
    }
    function onView(name) {
      if (picking && name !== picking) picking = null;
      render();
    }
    render();
    return {
      render,
      reload,
      onView,
      addSong,
      addReading,
      nextItem,
      prevItem,
      isPicking: () => picking !== null,
      summary: () => planSummary(plan, currentId, library)
    };
  }

  // src/dock/plan/timer-run.js
  var specOf = (item) => item.mode === "clock" ? { mode: "clock", at: item.at } : { mode: "duration", seconds: item.seconds };
  var fullMs = (spec) => spec.seconds * 1e3;
  function createTimerRun(now = Date.now) {
    let loaded = null;
    let running = null;
    const isPaused = () => !!running && running.spec.mode === "duration" && typeof running.timer.endAt !== "number";
    function clockTimer(spec) {
      const endAt = clockEndAt(spec.at, now());
      return endAt <= now() ? { remainingMs: 0 } : { endAt };
    }
    const canControl = () => !!running && running.spec.mode === "duration";
    function previewTimer(spec) {
      return spec.mode === "clock" ? clockTimer(spec) : { remainingMs: fullMs(spec) };
    }
    return {
      load(item) {
        if (!isValidTimerSpec(item)) return false;
        loaded = { spec: specOf(item), title: (item.title || "").trim() };
        return true;
      },
      loaded: () => loaded,
      previewTimer,
      /** The loaded timer goes on air: a duration starts from the full time, a clock timer follows the clock. */
      start() {
        if (!loaded) return null;
        const { spec, title } = loaded;
        const timer = spec.mode === "clock" ? clockTimer(spec) : { endAt: now() + fullMs(spec) };
        running = { spec, title, timer };
        return timer;
      },
      running: () => running,
      canControl,
      isPaused,
      pause() {
        if (!canControl() || isPaused()) return false;
        running.timer = { remainingMs: remainingMs(running.timer, now()) };
        return true;
      },
      resume() {
        if (!canControl() || !isPaused()) return false;
        running.timer = { endAt: now() + running.timer.remainingMs };
        return true;
      },
      reset() {
        if (!canControl()) return false;
        running.timer = { endAt: now() + fullMs(running.spec) };
        return true;
      },
      remainingNow: () => running ? remainingMs(running.timer, now()) : null
    };
  }

  // src/dock/plan/extras-tab.js
  var DISPLAY_TICK_MS = 1e3;
  var NOTHING = { has: false, text: "Nothing loaded", canNav: false };
  function initExtrasTab({ session, refresh, now = Date.now, startTicker = true }) {
    const run = createTimerRun(now);
    let announcement = { title: "", body: "" };
    const announcementTab = {
      load(item) {
        announcement = { title: (item.title || "").trim(), body: (item.body || "").trim() };
        refresh();
        return announcement.body.length > 0;
      },
      getContent: () => ({ ...announcement }),
      preview() {
        if (!announcement.body) return { ...NOTHING, sub: "Announcement" };
        return {
          has: true,
          text: announcement.body,
          sub: announcement.title ? "Announcement \xB7 " + announcement.title : "Announcement",
          canNav: false
        };
      },
      step() {
      }
    };
    function timerContent() {
      const loaded = run.loaded();
      if (!loaded) return { title: "", body: "", timer: { remainingMs: 0 } };
      const running = run.running();
      const timer = running && running.spec === loaded.spec ? running.timer : run.previewTimer(loaded.spec);
      return { title: loaded.title, body: "", timer };
    }
    const isLiveTimer = () => session.isLive && session.liveTab === "timer" && !!run.running();
    function pushLive() {
      session.updateLive({ timer: run.running().timer });
      refresh();
    }
    const timerTab = {
      load(item) {
        const ok = run.load(item);
        refresh();
        return ok;
      },
      getContent: timerContent,
      preview() {
        const loaded = run.loaded();
        if (!loaded) return { ...NOTHING, sub: "Timer" };
        const { timer } = timerContent();
        return {
          has: true,
          text: formatClock(remainingMs(timer, now())),
          sub: "Timer \xB7 " + (loaded.title || describeTimerSpec(loaded.spec)),
          canNav: false
        };
      },
      /** Show starts the loaded timer (a duration from its full time; pressing Show again restarts it). */
      markShown() {
        run.start();
      },
      step() {
      },
      /** The clock that is on air, for the live bar's controls, or null. */
      live() {
        if (!isLiveTimer()) return null;
        const running = run.running();
        return { text: formatClock(run.remainingNow()), title: running.title, paused: run.isPaused(), canControl: run.canControl() };
      },
      pause() {
        if (isLiveTimer() && run.pause()) pushLive();
      },
      resume() {
        if (isLiveTimer() && run.resume()) pushLive();
      },
      reset() {
        if (isLiveTimer() && run.reset()) pushLive();
      }
    };
    if (startTicker) {
      setInterval(() => {
        if (session.activeTab === "timer" || session.liveTab === "timer") refresh();
      }, DISPLAY_TICK_MS);
    }
    return { announcement: announcementTab, timer: timerTab };
  }

  // src/dock/main.js
  var diagnostics = createDiagnostics();
  var report = (context) => (err) => diagnostics.log(context, err);
  var EMPTY_SCRIPTURE = { body: "", reference: "" };
  var EMPTY_SONG = { title: "", body: "" };
  var VIEWS = ["plan", "scripture", "songs", "style"];
  function wireDiagnosticsPanel() {
    const list = $("diag-list"), count = $("diag-count");
    diagnostics.subscribe((entries) => {
      count.textContent = entries.length ? "(" + entries.length + ")" : "";
      list.replaceChildren(...entries.slice().reverse().map((entry) => {
        const li = document.createElement("li");
        li.textContent = entry.at.slice(11, 19) + "  " + entry.context + ": " + entry.message;
        return li;
      }));
    });
    $("diag-clear").addEventListener("click", () => diagnostics.clear());
  }
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
        if (name === "scripture" || name === "songs") session.setTab(name);
        if (tabs.plan) tabs.plan.onView(name);
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
          songs: () => tabs.songs ? tabs.songs.getContent() : EMPTY_SONG,
          announcement: () => tabs.announcement ? tabs.announcement.getContent() : EMPTY_SONG,
          timer: () => tabs.timer ? tabs.timer.getContent() : { ...EMPTY_SONG, timer: { remainingMs: 0 } }
        },
        onChange: () => {
          if (liveBar) liveBar.refresh();
          if (tabs.plan) tabs.plan.render();
        }
      });
      liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });
      const extras = initExtrasTab({ session, refresh: () => liveBar.refresh() });
      tabs.announcement = extras.announcement;
      tabs.timer = extras.timer;
      const scripture = createScriptureApi({
        cache: idbCache(openKv("obs-stage-cache"), report("cache")),
        offline: createOfflineProvider()
      });
      tabs.scripture = initScriptureTab({
        session,
        scripture,
        store,
        setStatus: status.setStatus,
        refresh: () => liveBar.refresh(),
        addToPlan: (ref, translation, keepOpen) => tabs.plan.addReading(ref, translation, keepOpen),
        isPicking: () => !!tabs.plan && tabs.plan.isPicking()
      });
      let libraryTools = null;
      const library = createLibrary({
        local: createLocalSongStore(window.localStorage, report("songs")),
        onModeChange: () => {
          if (libraryTools) libraryTools.render();
          if (tabs.plan) tabs.plan.render();
        },
        onError: report("library")
      });
      const planStore = createPlanStore({
        local: createLocalPlanStore(window.localStorage, report("plans")),
        onError: (err) => {
          report("plans")(err);
          library.markLost();
        },
        canWrite: () => library.mode() === "folder"
      });
      tabs.songs = initSongsTab({
        session,
        library,
        setStatus: status.setStatus,
        refresh: () => liveBar.refresh(),
        addToPlan: (songId, keepOpen) => tabs.plan.addSong(songId, keepOpen)
      });
      initImportPanel({
        library,
        setStatus: status.setStatus,
        report: report("songs"),
        onImported: () => tabs.songs.refreshList()
      });
      tabs.plan = initPlanTab({
        session,
        store: planStore,
        library,
        tabs,
        setStatus: status.setStatus,
        showView,
        refresh: () => liveBar.refresh(),
        report: report("plans")
      });
      libraryTools = initLibraryTools({
        library,
        kv: openKv("obs-stage-library"),
        setStatus: status.setStatus,
        report: report("library"),
        onChanged: () => {
          tabs.songs.refreshList();
          tabs.plan.render();
        },
        onFolderChange: async (handle) => {
          if (handle) await planStore.attach(handle);
          else planStore.detach();
          tabs.plan.reload();
        }
      });
      document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.tab)));
      wireDiagnosticsPanel();
      initStyleTab({ session, store, setStatus: status.setStatus, report: report("settings") });
      transport.start();
      showView("plan");
      await libraryTools.restore();
    } catch (err) {
      diagnostics.log("dock init", err);
      console.error("[dock] init failed:", err);
    }
  })();
})();
