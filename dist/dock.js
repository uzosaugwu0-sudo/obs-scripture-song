(() => {
  // src/dock/util.js
  var $ = (id) => document.getElementById(id);

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
      document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.tab)));
      transport.start();
      showView("scripture");
    } catch (err) {
      diagnostics.log("dock init", err);
      console.error("[dock] init failed:", err);
    }
  })();
})();
