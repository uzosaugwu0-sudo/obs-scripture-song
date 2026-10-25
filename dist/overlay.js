(() => {
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

  // src/overlay/style-math.js
  var THEME_BG = {
    frosted: "#0e121e",
    "frosted-light": "#ffffff",
    pure: "#0a0c14",
    // only used when Show card is turned on for Pure Type
    "sacred-light": "#0a0a14"
  };
  var THEME_ALPHA = { frosted: 0.625, "frosted-light": 0.8 };
  var SIZE_RANGE = {
    "fs-sm": { min: 26, max: 34 },
    "fs-md": { min: 34, max: 46 },
    "fs-lg": { min: 46, max: 58 },
    "fs-xl": { min: 58, max: 72 }
  };
  var SHORT_LEN = 80;
  var LONG_LEN = 220;
  var MIN_HEIGHT_VH = { "fs-sm": 18, "fs-md": 24, "fs-lg": 32, "fs-xl": 42 };
  var LABEL_REM = { "fs-sm": 0.9, "fs-md": 1.1, "fs-lg": 1.3, "fs-xl": 1.55 };
  function hexToRgba(hex, alpha) {
    const h = (typeof hex === "string" ? hex : "").replace("#", "");
    const a = Math.max(0, Math.min(1, alpha));
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return "rgba(10, 10, 20, " + a + ")";
    return "rgba(" + parseInt(h.slice(0, 2), 16) + ", " + parseInt(h.slice(2, 4), 16) + ", " + parseInt(h.slice(4, 6), 16) + ", " + a + ")";
  }
  function cardAlpha(theme, opacityPct) {
    const alpha = opacityPct / 100 * (THEME_ALPHA[theme] ?? 1);
    return Math.max(0, Math.min(1, alpha));
  }
  function getScale(state) {
    const raw = state.scale !== void 0 ? state.scale : 100;
    return Math.max(0.5, Math.min(1.5, raw / 100));
  }
  function computeBodyFontSize(text, sizeClass, scale) {
    const range = SIZE_RANGE[sizeClass] || SIZE_RANGE["fs-md"];
    const len = (text || "").length;
    let size;
    if (len < SHORT_LEN) size = range.max;
    else if (len > LONG_LEN) size = range.min;
    else {
      const t = (len - SHORT_LEN) / (LONG_LEN - SHORT_LEN);
      size = Math.round(range.max - t * (range.max - range.min));
    }
    return Math.round(size * scale);
  }

  // src/overlay/split-lines.js
  var MIN_PIECE = 12;
  var MAX_PIECES = 8;
  function splitLines(text, kind) {
    const raw = (text || "").replace(/\r\n?/g, "\n").trim();
    if (!raw) return [];
    if (kind === "song") return raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const pieces = raw.replace(/\s+/g, " ").split(/(?<=[,;:.?!])\s+/);
    const out = [];
    let pending = "";
    for (const piece of pieces) {
      const current = pending ? `${pending} ${piece}` : piece;
      if (current.length < MIN_PIECE) pending = current;
      else {
        out.push(current);
        pending = "";
      }
    }
    if (pending) {
      if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${pending}`;
      else out.push(pending);
    }
    if (out.length <= MAX_PIECES) return out;
    const size = Math.ceil(out.length / MAX_PIECES);
    const grouped = [];
    for (let i = 0; i < out.length; i += size) grouped.push(out.slice(i, i + size).join(" "));
    return grouped;
  }

  // src/overlay/timer-clock.js
  var STALE_AFTER_MS = 36e5;
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
  var isRunning = (timer) => typeof timer.endAt === "number";
  function isStale(timer, now) {
    return isRunning(timer) && now - timer.endAt > STALE_AFTER_MS;
  }

  // src/overlay/render.js
  var KIND_CLASSES = ["kind-verse", "kind-song", "kind-announcement", "kind-timer", "kind-lowerthird"];
  var THEME_CLASSES = ["theme-frosted", "theme-frosted-light", "theme-pure", "theme-sacred-light", "theme-custom"];
  var POS_CLASSES = ["pos-bottom", "pos-center", "pos-top"];
  var ALIGN_CLASSES = ["lt-left", "lt-center", "lt-right"];
  var SIZE_CLASSES = ["fs-sm", "fs-md", "fs-lg", "fs-xl"];
  var ANIM_CLASSES = ["anim-rise", "anim-wipe", "anim-lines", "anim-cut"];
  var CARD_STATES = ["card-in", "card-out"];
  var TEXT_STATES = ["text-in", "text-out"];
  var SACRED_IMAGE = "assets/bg1.png";
  var ENTER_MS = { rise: 560, wipe: 700, lines: 400 };
  var LEAVE_MS = { rise: 400, wipe: 460, lines: 400 };
  var TEXT_OUT_MS = 240;
  var TEXT_IN_MS = 340;
  var MAX_STAGGER_S = 0.35;
  var LINES_BUDGET_S = 2.4;
  var TIMER_TICK_MS = 250;
  var TIMER_SCALE = 1.6;
  var LT_NAME_SCALE = 0.9;
  var LT_INFO_SCALE = 0.56;
  var LT_LOGO_SCALE = 1.2;
  function createRenderer(doc = document, onError = () => {
  }) {
    const stage = doc.getElementById("stage");
    const card = doc.getElementById("card");
    const wrap = doc.getElementById("wrap");
    const titleEl = doc.getElementById("ov-title");
    const bodyEl = doc.getElementById("ov-body");
    const refEl = doc.getElementById("ov-ref");
    const logoEl = doc.getElementById("ov-logo");
    let epoch = 0;
    let tickHandle = null;
    function setClass(group, value) {
      group.forEach((c) => stage.classList.remove(c));
      stage.classList.add(value);
    }
    function play(el, add, remove, fallbackMs, token, done) {
      remove.forEach((c) => el.classList.remove(c));
      void el.offsetWidth;
      el.classList.add(add);
      let finished = false;
      let timer = null;
      const onEnd = (e) => {
        if (e.target === el) finish();
      };
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        el.removeEventListener("animationend", onEnd);
        if (token === epoch && done) done();
      }
      timer = setTimeout(finish, fallbackMs);
      el.addEventListener("animationend", onEnd);
    }
    function stopTick() {
      if (tickHandle !== null) {
        clearInterval(tickHandle);
        tickHandle = null;
      }
    }
    function paintClock(timer) {
      bodyEl.textContent = formatClock(remainingMs(timer, Date.now()));
    }
    function startTick(timer) {
      stopTick();
      paintClock(timer);
      if (typeof timer.endAt !== "number") return;
      tickHandle = setInterval(() => {
        paintClock(timer);
        if (remainingMs(timer, Date.now()) === 0) stopTick();
      }, TIMER_TICK_MS);
    }
    function applyStyles(state) {
      const kind = state.kind;
      const theme = state.theme;
      const opacityPct = state.opacity !== void 0 ? state.opacity : 88;
      const font = state.font || "Open Sans";
      const sizeClass = "fs-" + (state.fontSize || "md");
      const scale = getScale(state);
      const colors = state.customColors || DEFAULTS.customColors;
      setClass(KIND_CLASSES, "kind-" + kind);
      setClass(THEME_CLASSES, "theme-" + theme);
      setClass(POS_CLASSES, "pos-" + (kind === "lowerthird" ? "bottom" : state.position || "bottom"));
      ALIGN_CLASSES.forEach((c) => stage.classList.remove(c));
      if (kind === "lowerthird") stage.classList.add("lt-" + state.lowerthird.align);
      setClass(SIZE_CLASSES, sizeClass);
      setClass(ANIM_CLASSES, "anim-" + state.animation);
      if (state.animation !== "lines") stage.classList.remove("lines-go");
      let imageUrl = null;
      if (theme === "sacred-light") imageUrl = SACRED_IMAGE;
      else if (state.bgMode === "image" && state.bgImage) imageUrl = state.bgImage;
      const showCard = imageUrl ? true : state.showCard !== false;
      stage.classList.toggle("no-card", !showCard);
      card.style.background = "";
      card.style.backgroundColor = "";
      card.style.backgroundImage = "";
      card.style.backgroundSize = "";
      card.style.backgroundPosition = "";
      card.style.backgroundRepeat = "";
      if (imageUrl) {
        card.style.backgroundImage = 'url("' + imageUrl + '")';
        card.style.backgroundSize = "cover";
        card.style.backgroundPosition = "center";
        card.style.backgroundRepeat = "no-repeat";
      } else if (showCard) {
        const hex = theme === "custom" ? colors.bg : THEME_BG[theme] || THEME_BG.frosted;
        card.style.background = hexToRgba(hex, cardAlpha(theme, opacityPct));
      } else {
        card.style.backgroundColor = "transparent";
      }
      if (theme === "custom") {
        const accent = colors.accent || "#a78bfa";
        const swap = kind === "lowerthird";
        bodyEl.style.color = swap ? accent : colors.text || "#ffffff";
        titleEl.style.color = swap ? colors.text || "#ffffff" : accent;
        refEl.style.color = accent;
        card.style.setProperty("--accent", accent);
      } else {
        bodyEl.style.color = "";
        titleEl.style.color = "";
        refEl.style.color = "";
        card.style.removeProperty("--accent");
      }
      card.style.fontFamily = "'" + font + "', 'Open Sans', Georgia, serif";
      bodyEl.style.fontStyle = state.italic ? "italic" : "normal";
      const hideTitle = kind === "verse" || kind !== "lowerthird" && state.showTitle === false || kind !== "song" && !state.title;
      const hideRef = kind !== "verse" || state.showReference === false;
      titleEl.style.display = hideTitle ? "none" : "";
      refEl.style.display = hideRef ? "none" : "";
      stage.classList.toggle("no-title", hideTitle);
      stage.classList.toggle("no-ref", hideRef);
      card.style.minHeight = (MIN_HEIGHT_VH[sizeClass] || 24) * scale + "vh";
      card.style.paddingTop = Math.round(28 * scale) + "px";
      card.style.paddingBottom = Math.round(24 * scale) + "px";
      card.style.paddingLeft = "52px";
      card.style.paddingRight = "52px";
      if (kind === "lowerthird") {
        card.style.minHeight = "";
        card.style.paddingTop = Math.round(14 * scale) + "px";
        card.style.paddingBottom = Math.round(14 * scale) + "px";
        card.style.paddingLeft = "20px";
        card.style.paddingRight = "28px";
      }
      const labelRem = (LABEL_REM[sizeClass] || 1.1) * scale;
      titleEl.style.fontSize = labelRem + "rem";
      refEl.style.fontSize = labelRem + "rem";
    }
    function scaleText(text, sizeClass, scale) {
      bodyEl.style.fontSize = computeBodyFontSize(text, sizeClass, scale) + "px";
    }
    function fillContent(state) {
      const logo = state.kind === "lowerthird" ? state.lowerthird.logo : null;
      if (logo) logoEl.src = logo;
      else logoEl.removeAttribute("src");
      stage.classList.toggle("has-logo", !!logo);
      const titled = state.kind !== "verse";
      titleEl.textContent = titled ? state.title || "" : "";
      refEl.textContent = state.kind === "verse" ? state.reference || "" : "";
      const body = state.body || "";
      bodyEl.setAttribute("aria-label", state.kind === "timer" ? state.title || "Timer" : body);
      if (state.kind === "lowerthird") {
        const base = computeBodyFontSize("", "fs-" + (state.fontSize || "md"), getScale(state));
        titleEl.style.fontSize = Math.round(base * LT_NAME_SCALE) + "px";
        bodyEl.style.fontSize = Math.round(base * LT_INFO_SCALE) + "px";
        bodyEl.textContent = body;
        bodyEl.style.removeProperty("--stagger");
        logoEl.style.height = Math.round(base * (LT_NAME_SCALE + LT_INFO_SCALE) * LT_LOGO_SCALE) + "px";
        return;
      }
      if (state.kind === "timer") {
        paintClock(state.timer);
        bodyEl.style.removeProperty("--stagger");
        bodyEl.style.fontSize = Math.round(computeBodyFontSize("", "fs-" + (state.fontSize || "md"), getScale(state)) * TIMER_SCALE) + "px";
        return;
      }
      if (state.animation === "lines") {
        const lines = splitLines(body, state.kind === "verse" ? "verse" : "song");
        bodyEl.textContent = "";
        lines.forEach((text, i) => {
          const span = doc.createElement("span");
          span.className = "ln";
          span.style.setProperty("--i", String(i));
          span.textContent = text;
          bodyEl.appendChild(span);
        });
        const stagger = lines.length > 1 ? Math.min(MAX_STAGGER_S, LINES_BUDGET_S / lines.length) : MAX_STAGGER_S;
        bodyEl.style.setProperty("--stagger", stagger + "s");
      } else {
        bodyEl.textContent = body;
        bodyEl.style.removeProperty("--stagger");
      }
      scaleText(body, "fs-" + (state.fontSize || "md"), getScale(state));
    }
    function restartLines() {
      stage.classList.remove("lines-go");
      void stage.offsetWidth;
      stage.classList.add("lines-go");
    }
    function show(state, token) {
      const anim = state.animation;
      const wasVisible = !stage.classList.contains("hidden");
      const commit = () => {
        applyStyles(state);
        fillContent(state);
        stage.classList.remove("hidden");
        if (state.kind === "timer") startTick(state.timer);
      };
      CARD_STATES.forEach((c) => card.classList.remove(c));
      TEXT_STATES.forEach((c) => wrap.classList.remove(c));
      if (!wasVisible) {
        commit();
        if (anim === "cut") return;
        play(card, "card-in", CARD_STATES, ENTER_MS[anim], token, () => card.classList.remove("card-in"));
        if (anim === "lines") restartLines();
        return;
      }
      if (anim === "cut") {
        commit();
        return;
      }
      if (anim === "lines") {
        commit();
        restartLines();
        return;
      }
      play(wrap, "text-out", TEXT_STATES, TEXT_OUT_MS, token, () => {
        commit();
        play(wrap, "text-in", TEXT_STATES, TEXT_IN_MS, token, () => wrap.classList.remove("text-in"));
      });
    }
    function hide(state, token) {
      if (stage.classList.contains("hidden")) return;
      const anim = state.animation;
      const finish = () => {
        stopTick();
        CARD_STATES.forEach((c) => card.classList.remove(c));
        TEXT_STATES.forEach((c) => wrap.classList.remove(c));
        stage.classList.add("hidden");
      };
      if (anim === "cut") {
        finish();
        return;
      }
      setClass(ANIM_CLASSES, "anim-" + anim);
      TEXT_STATES.forEach((c) => wrap.classList.remove(c));
      play(card, "card-out", CARD_STATES, LEAVE_MS[anim], token, finish);
    }
    function clear() {
      stopTick();
      CARD_STATES.forEach((c) => card.classList.remove(c));
      TEXT_STATES.forEach((c) => wrap.classList.remove(c));
      stage.classList.remove("lines-go");
      stage.classList.add("hidden");
      titleEl.textContent = "";
      bodyEl.textContent = "";
      refEl.textContent = "";
    }
    function handle(raw) {
      try {
        const state = normalizeState(raw);
        if (!state) return;
        if (state.action === "show" && state.kind === "timer" && isStale(state.timer, Date.now())) return;
        epoch += 1;
        stopTick();
        const token = epoch;
        switch (state.action) {
          case "show":
            show(state, token);
            break;
          case "hide":
            hide(state, token);
            break;
          case "clear":
            clear();
            break;
        }
      } catch (err) {
        onError(err);
      }
    }
    return { handle };
  }

  // src/overlay/main.js
  var report = (err) => console.error("[overlay]", err);
  var transport = createBrowserTransport("overlay", report);
  var renderer = createRenderer(document, report);
  transport.subscribe((state) => renderer.handle(state));
  transport.start();
})();
