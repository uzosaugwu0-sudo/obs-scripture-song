# OBS Scripture & Song - Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dock UI with a pinned live bar plus Scripture / Songs / Style tabs on a small design system, and give the overlay new themes (Frosted, Frosted Light, Pure Type, Sacred Light, Custom) and four new animations (Soft rise, Glass wipe, Line by line, Instant cut), without changing the song library, offline scripture, transport or state shape.

**Architecture:** Pure logic first and unit tested (state migration, smart-input rules, line splitting, song search, settings store). The overlay is rewritten next (CSS themes and animations driven by classes). The dock is then rebuilt: one shell task (tokens, all CSS, full markup, live bar, tab registry in `main.js`), then one task per tab, each wiring its markup and shipping its own browser tests. `session`, `library`, transport, scripture API, parsers and the folder backend are not modified.

**Tech Stack:** JavaScript ES modules bundled by esbuild into classic scripts (existing), Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-obs-overlay-redesign-design.md` (this repo, branch `feat/redesign`). Foundation spec and plan live in the claude repo, branch `worktree-overlay-foundation-spec`.

**Repo and branch:** `C:\Users\osaug\claude\unified overlay` (Git Bash: `/c/Users/osaug/claude/unified overlay`), branch `feat/redesign` (already created and pushed with the spec). All paths below are relative to that folder.

## Global Constraints

- Runs as plain classic scripts over `file:///` in OBS 28+ (Chromium): no ES-module script tags, no `fetch()` of local files, no new runtime dependency.
- Dock is designed for a **narrow** panel, about 380px wide: at a 380x700 viewport the live bar is fully visible without scrolling on every tab and `document.documentElement.scrollWidth <= 380`.
- Show and Hide buttons are at least 40px tall.
- State shape and `STATE_VERSION` (1) do not change. `theme` is one of `frosted`, `frosted-light`, `pure`, `sacred-light`, `custom`. `animation` is one of `rise`, `wipe`, `lines`, `cut`. Defaults: `frosted`, `rise`.
- Legacy mapping (applied in `normalizeState` and `loadSettings`): theme `dark`, `gold`, `neon` -> `frosted`; `white` -> `frosted-light`; `sacred-light`, `custom` unchanged; animation `fade`, `slide` -> `rise`; `none` -> `cut`; any other value -> default.
- localStorage keys, BroadcastChannel name, the song file format and library semantics do not change.
- Keyboard shortcuts unchanged: Left/Right and Up/Down step, Space toggles show/hide, Escape hides; ignored while typing in an input, textarea or select.
- Intentionally removed: the three quick boxes, the book/chapter/verse dropdown pickers and the separate Search card.
- Card alpha: `effective alpha = (opacity slider / 100) x THEME_ALPHA[theme]` with `THEME_ALPHA = { frosted: 0.625, frosted-light: 0.8 }` (others 1), so the default 88% gives 0.55 for Frosted and 0.704 for Frosted Light.
- Animation timings: Soft rise card in 0.5 s (14 px up), out 0.35 s, text change 0.2 s out then 0.3 s in; Glass wipe card in 0.6 s, text fades in after 0.25 s, out 0.4 s; Line by line card fade 0.35 s, each line 0.45 s, stagger 0.35 s capped so all lines finish within about 2.4 s; Instant cut has no transition.
- Files stay under about 400 lines; coverage at or above 80% lines/functions on the logic modules in `vitest.config.js`.
- Immutability: modules return new objects; the only intentionally mutable state is the dock session object, per-tab view state and the DOM.
- Shell note for implementers: if you create files with shell heredocs, avoid unbalanced single quotes in comments and do not rely on double backslashes surviving; prefer building such strings with `String.fromCharCode(92)`.

## Review Focus

Failure modes the spec implies but no feature task names; each has a pinning test in the task noted.

1. **Overlay interrupted mid-animation:** rapid Next presses, show then immediately hide, hide then immediately show. The final state must match the last command (right text, visible or hidden), never stuck half-faded or hidden over new content. *(Task 3)*
2. **Pathological text for Line by line:** empty or whitespace-only body, one very long word, no punctuation, more than 8 clauses. Must not throw and must render something sensible. *(Tasks 2, 3)*
3. **Smart box input that is not a clean reference:** blank Enter, digits only (`316`), extra spaces (`john  3 :16`), `1 John` without a chapter, a very long sentence, mixed case. Each must reach a defined outcome (message, book selection, reference or search), never throw. *(Task 4, Task 8)*
4. **Old or hostile stored values after the upgrade:** saved settings with `theme: gold`, `animation: slide`, an unknown `theme: weird`, a stored overlay state with legacy names. Must load with valid defaults and no errors. *(Tasks 1, 3, 10)*
5. **Narrow-dock overflow with real-world content:** an 80-character song title, a 500-character slide, 30 songs, long translation names. No sideways scroll, live bar still pinned. *(Task 9)*

---

## File Structure

```
src/
  core/      state.js (themes, animations, migrateLegacy)  settings.js (migrates on load)
  scripture/ books.js (+normalizeBookName)  smart-input.js (new)
  songs/     search.js (new)
  overlay/   style-math.js (+cardAlpha, defaultShowCard)  split-lines.js (new)  render.js (rewrite)  main.js
  dock/      settings-store.js  live-bar.js  segmented.js  bg-image.js  smart-box.js  scripture-tab.js
             songs-tab.js  import-panel.js  library-tools.js  style-tab.js  status.js  main.js
             (unchanged: session.js diagnostics.js util.js)
             (deleted: stream-controls.js display-settings.js library-ui.js)
  css/       tokens.css base.css live-bar.css tabs.css fields.css cards.css banners.css overlay.css
             (deleted: dock.css; the build concatenates the dock sheets into dist/css/dock.css)
  html/      dock.html (rewritten)  overlay.html (initial classes)
smoke/       helpers.js overlay.spec.js shell.spec.js scripture.spec.js songs.spec.js style.spec.js
             (deleted: dock.spec.js parity.spec.js, replaced by the specs above)
tests/       core/ scripture/ songs/ overlay/ dock/ ... one unit file per new pure module
```

Responsibilities: `core` = state shape and persisted settings; `scripture/smart-input.js` = what the smart box means; `songs/search.js` = song matching; `overlay/*` = how a state becomes pixels; `dock/settings-store.js` = the one in-memory copy of the persisted settings; each `dock/*-tab.js` = one tab's behaviour; `live-bar.js` = the pinned bar and the global shortcuts.

---

### Task 1: Theme and animation vocabulary, with legacy migration

**Files:**
- Modify: `src/core/state.js` (replace whole file), `src/core/settings.js` (replace whole file)
- Test: `tests/core/state.test.js` (append), `tests/core/settings.test.js` (replace whole file)

**Interfaces:**
- Produces (`state.js`): `THEMES`, `ANIMATIONS` (frozen arrays), `migrateLegacy({ theme, animation } = {}) -> { theme, animation }` (always valid values), `DEFAULTS` with `theme: 'frosted'`, `animation: 'rise'`, plus every existing export unchanged (`STATE_VERSION`, `ACTIONS`, `KINDS`, `nextSeq`, `normalizeState`). `normalizeState` output always has a valid `theme` and `animation`.
- Produces (`settings.js`): unchanged exports; `loadSettings` output always has a valid `theme` and `animation`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/state.test.js`:

```js
import { THEMES, ANIMATIONS, migrateLegacy } from '../../src/core/state.js';

describe('themes and animations', () => {
  it('exposes the new vocabulary and defaults', () => {
    expect(THEMES).toEqual(['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom']);
    expect(ANIMATIONS).toEqual(['rise', 'wipe', 'lines', 'cut']);
    expect(DEFAULTS.theme).toBe('frosted');
    expect(DEFAULTS.animation).toBe('rise');
  });
});

describe('migrateLegacy', () => {
  it.each([
    ['dark', 'frosted'], ['gold', 'frosted'], ['neon', 'frosted'], ['white', 'frosted-light'],
    ['sacred-light', 'sacred-light'], ['custom', 'custom'], ['pure', 'pure'], ['frosted', 'frosted'],
    ['weird', 'frosted'], [undefined, 'frosted'], [42, 'frosted'],
  ])('maps theme %s to %s', (from, to) => {
    expect(migrateLegacy({ theme: from }).theme).toBe(to);
  });

  it.each([
    ['fade', 'rise'], ['slide', 'rise'], ['none', 'cut'],
    ['rise', 'rise'], ['wipe', 'wipe'], ['lines', 'lines'], ['cut', 'cut'],
    ['weird', 'rise'], [undefined, 'rise'], [null, 'rise'],
  ])('maps animation %s to %s', (from, to) => {
    expect(migrateLegacy({ animation: from }).animation).toBe(to);
  });

  it('tolerates being called with nothing', () => {
    expect(migrateLegacy()).toEqual({ theme: 'frosted', animation: 'rise' });
  });
});

describe('normalizeState with legacy values', () => {
  it('migrates a stored pre-upgrade state so it still renders', () => {
    const state = normalizeState({ action: 'show', kind: 'verse', seq: 1, theme: 'neon', animation: 'slide' });
    expect(state.theme).toBe('frosted');
    expect(state.animation).toBe('rise');
  });
  it('replaces unknown values with defaults instead of rejecting the state', () => {
    const state = normalizeState({ action: 'show', kind: 'song', seq: 2, theme: 'weird', animation: 'spin' });
    expect(state).toMatchObject({ theme: 'frosted', animation: 'rise' });
  });
  it('keeps new values untouched', () => {
    const state = normalizeState({ action: 'show', kind: 'song', seq: 3, theme: 'pure', animation: 'lines' });
    expect(state).toMatchObject({ theme: 'pure', animation: 'lines' });
  });
});
```

Replace `tests/core/settings.test.js` with:

```js
import { describe, it, expect, vi } from 'vitest';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../../src/core/settings.js';
import { memoryStorage } from '../helpers/memory-storage.js';

describe('settings', () => {
  it('round-trips and merges custom colours with defaults', () => {
    const storage = memoryStorage();
    saveSettings({ theme: 'pure', customColors: { bg: '#111111' } }, { storage });
    const loaded = loadSettings({ storage });
    expect(loaded.theme).toBe('pure');
    expect(loaded.customColors).toEqual({ bg: '#111111', text: '#ffffff', accent: '#a78bfa' });
    expect(loaded.opacity).toBe(88);
  });

  it('falls back to defaults and reports corrupt JSON', () => {
    const onError = vi.fn();
    const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
    expect(loadSettings({ storage, onError }).theme).toBe('frosted');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports a failing save (quota) instead of throwing', () => {
    const onError = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveSettings({ theme: 'x' }, { storage, onError })).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('treats a stored null as corrupt, not as settings', () => {
    const onError = vi.fn();
    const storage = memoryStorage({ [SETTINGS_KEY]: 'null' });
    expect(loadSettings({ storage, onError }).theme).toBe('frosted');
    expect(onError).toHaveBeenCalled();
  });

  it.each([
    [{ theme: 'dark', animation: 'fade' }, 'frosted', 'rise'],
    [{ theme: 'gold', animation: 'slide' }, 'frosted', 'rise'],
    [{ theme: 'white', animation: 'none' }, 'frosted-light', 'cut'],
    [{ theme: 'weird', animation: 'spin' }, 'frosted', 'rise'],
    [{}, 'frosted', 'rise'],
  ])('migrates saved settings %j', (saved, theme, animation) => {
    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify(saved) });
    const loaded = loadSettings({ storage });
    expect(loaded.theme).toBe(theme);
    expect(loaded.animation).toBe(animation);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core`
Expected: FAIL (`THEMES` / `migrateLegacy` are not exported; settings expectations for `frosted` fail).

- [ ] **Step 3: Implement**

Replace `src/core/state.js` with:

```js
export const STATE_VERSION = 1;
export const ACTIONS = Object.freeze(['show', 'hide', 'clear']);
export const KINDS = Object.freeze(['verse', 'song']);
export const THEMES = Object.freeze(['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom']);
export const ANIMATIONS = Object.freeze(['rise', 'wipe', 'lines', 'cut']);

export const DEFAULTS = Object.freeze({
  action:        'show',
  kind:          'verse',   // one of KINDS; later phases add more
  title:         '',        // song title
  body:          '',        // verse text or slide lines
  reference:     '',        // scripture reference
  theme:         'frosted',
  position:      'bottom',
  fontSize:      'md',
  animation:     'rise',
  visible:       false,
  version:       STATE_VERSION,
  seq:           0,         // monotonic; replaces the old timestamp
  opacity:       88,
  scale:         100,
  font:          'Open Sans',
  italic:        false,
  showCard:      true,
  showTitle:     true,
  showReference: true,
  bgMode:        'color',   // 'color' | 'image'
  bgImage:       null,
  customColors:  { bg: '#0a0a14', text: '#ffffff', accent: '#a78bfa' },
});

const LEGACY_THEMES     = Object.freeze({ dark: 'frosted', gold: 'frosted', neon: 'frosted', white: 'frosted-light' });
const LEGACY_ANIMATIONS = Object.freeze({ fade: 'rise', slide: 'rise', none: 'cut' });

/** Map pre-redesign theme and animation names onto the new set; anything unknown becomes the default. */
export function migrateLegacy({ theme, animation } = {}) {
  const t = LEGACY_THEMES[theme] ?? theme;
  const a = LEGACY_ANIMATIONS[animation] ?? animation;
  return {
    theme:     THEMES.includes(t) ? t : DEFAULTS.theme,
    animation: ANIMATIONS.includes(a) ? a : DEFAULTS.animation,
  };
}

/** Next sequence number: always above the last one, and clock-based so it survives restarts. */
export function nextSeq(lastSeq, nowMs) {
  return Math.max(lastSeq + 1, nowMs);
}

/**
 * Turn anything that arrives over a transport into a usable state, or null.
 * The overlay ignores null, so hostile or newer-than-us payloads render nothing.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.version === 'number' && raw.version > STATE_VERSION) return null;
  const merged = {
    ...DEFAULTS,
    ...raw,
    customColors: { ...DEFAULTS.customColors, ...(raw.customColors || {}) },
  };
  if (!ACTIONS.includes(merged.action)) return null;
  if (!KINDS.includes(merged.kind)) return null;
  return { ...merged, ...migrateLegacy(merged) };
}
```

Replace `src/core/settings.js` with:

```js
import { DEFAULTS, migrateLegacy } from './state.js';

export const SETTINGS_KEY = 'obs-stage-display-settings';

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function saveSettings(settings, { storage = defaultStorage(), onError = () => {} } = {}) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    onError(err);
  }
}

export function loadSettings({ storage = defaultStorage(), onError = () => {} } = {}) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = {
        ...DEFAULTS,
        ...parsed,
        customColors: { ...DEFAULTS.customColors, ...(parsed.customColors || {}) },
      };
      return { ...merged, ...migrateLegacy(merged) };
    }
  } catch (err) {
    onError(err);
  }
  return { ...DEFAULTS, customColors: { ...DEFAULTS.customColors } };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run`
Expected: PASS for the whole unit suite (the existing transport, session and library tests are unaffected). Browser tests are updated later in this plan.

- [ ] **Step 5: Commit**

```bash
git add src/core tests/core
git commit -m "feat: new theme and animation vocabulary with legacy migration"
```

---

### Task 2: Overlay pure helpers (line splitting, card alpha, theme defaults)

**Files:**
- Create: `src/overlay/split-lines.js`
- Modify: `src/overlay/style-math.js` (replace whole file)
- Test: `tests/overlay/split-lines.test.js` (new), `tests/overlay/style-math.test.js` (append)

**Interfaces:**
- Produces (`split-lines.js`): `splitLines(text, kind) -> string[]` where `kind` is `'song'` or `'verse'`.
  - Song: split on line breaks, trim each, drop empty ones.
  - Verse: split after `, ; : . ? !` followed by whitespace; any piece shorter than 12 characters is joined with the next piece (a short last piece joins the previous one); if more than 8 pieces remain they are grouped into consecutive chunks of `ceil(n / 8)` pieces joined with a space.
  - Empty or whitespace-only input returns `[]`.
- Produces (`style-math.js`): everything it exports today, with `THEME_BG` updated to the new theme names, plus `THEME_ALPHA`, `cardAlpha(theme, opacityPct) -> number` in `[0, 1]`, `defaultShowCard(theme) -> boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/overlay/split-lines.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { splitLines } from '../../src/overlay/split-lines.js';

describe('splitLines (songs)', () => {
  it('splits on line breaks, trims and drops blanks', () => {
    expect(splitLines('Line one\n\n  Line two \r\nLine three\n', 'song')).toEqual(['Line one', 'Line two', 'Line three']);
  });
  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitLines('', 'song')).toEqual([]);
    expect(splitLines('   \n \n', 'song')).toEqual([]);
    expect(splitLines(undefined, 'song')).toEqual([]);
  });
});

describe('splitLines (verses)', () => {
  it('splits after clause punctuation', () => {
    const verse = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
    expect(splitLines(verse, 'verse')).toEqual([
      'For God so loved the world,',
      'that he gave his only begotten Son,',
      'that whosoever believeth in him should not perish,',
      'but have everlasting life.',
    ]);
  });
  it('joins a short first piece with the next one', () => {
    expect(splitLines('Jesus wept. Then he rose up and walked away.', 'verse'))
      .toEqual(['Jesus wept. Then he rose up and walked away.']);
  });
  it('joins a short last piece with the previous one', () => {
    expect(splitLines('This is a longer clause, ok.', 'verse')).toEqual(['This is a longer clause, ok.']);
  });
  it('keeps text without punctuation as one line', () => {
    expect(splitLines('In the beginning God created the heavens and the earth', 'verse'))
      .toEqual(['In the beginning God created the heavens and the earth']);
  });
  it('survives one very long word', () => {
    const word = 'x'.repeat(500);
    expect(splitLines(word, 'verse')).toEqual([word]);
  });
  it('groups evenly when there are more than 8 pieces', () => {
    const verse = Array.from({ length: 10 }, (_, i) => `clause number ${i},`).join(' ');
    const lines = splitLines(verse, 'verse');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('clause number 0, clause number 1,');
  });
  it('collapses odd whitespace and returns nothing for blank text', () => {
    expect(splitLines('  a   verse   with   gaps  ', 'verse')).toEqual(['a verse with gaps']);
    expect(splitLines('  \n ', 'verse')).toEqual([]);
  });
});
```

Append to `tests/overlay/style-math.test.js`:

```js
import { cardAlpha, defaultShowCard, THEME_BG } from '../../src/overlay/style-math.js';

describe('cardAlpha', () => {
  it('scales the slider by the theme base alpha', () => {
    expect(cardAlpha('frosted', 88)).toBeCloseTo(0.55, 5);
    expect(cardAlpha('frosted-light', 88)).toBeCloseTo(0.704, 5);
    expect(cardAlpha('custom', 88)).toBeCloseTo(0.88, 5);
  });
  it('clamps to 0..1', () => {
    expect(cardAlpha('custom', 250)).toBe(1);
    expect(cardAlpha('custom', -5)).toBe(0);
  });
});

describe('defaultShowCard', () => {
  it('is off only for Pure Type', () => {
    expect(defaultShowCard('pure')).toBe(false);
    for (const t of ['frosted', 'frosted-light', 'sacred-light', 'custom']) expect(defaultShowCard(t)).toBe(true);
    expect(defaultShowCard('unknown')).toBe(true);
  });
});

describe('THEME_BG', () => {
  it('has a card colour for every built-in theme that uses one', () => {
    for (const t of ['frosted', 'frosted-light', 'pure', 'sacred-light']) expect(THEME_BG[t]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/overlay`
Expected: FAIL (`split-lines.js` missing, `cardAlpha` not exported).

- [ ] **Step 3: Implement**

`src/overlay/split-lines.js`:

```js
const MIN_PIECE = 12;   // shorter pieces are joined to a neighbour
const MAX_PIECES = 8;   // more than this are grouped evenly

/**
 * Lines for the Line by line animation. A song slide splits on its own line
 * breaks; a verse splits after clause punctuation so it builds like speech.
 */
export function splitLines(text, kind) {
  const raw = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return [];
  if (kind === 'song') return raw.split('\n').map((l) => l.trim()).filter(Boolean);

  const pieces = raw.replace(/\s+/g, ' ').split(/(?<=[,;:.?!])\s+/);
  const out = [];
  let pending = '';
  for (const piece of pieces) {
    const current = pending ? `${pending} ${piece}` : piece;
    if (current.length < MIN_PIECE) pending = current;
    else { out.push(current); pending = ''; }
  }
  if (pending) {
    if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${pending}`;
    else out.push(pending);
  }

  if (out.length <= MAX_PIECES) return out;
  const size = Math.ceil(out.length / MAX_PIECES);
  const grouped = [];
  for (let i = 0; i < out.length; i += size) grouped.push(out.slice(i, i + size).join(' '));
  return grouped;
}
```

Replace `src/overlay/style-math.js` with:

```js
// Card colour used behind the text for themes that have a card.
export const THEME_BG = {
  frosted:         '#0e121e',
  'frosted-light': '#ffffff',
  pure:            '#0a0c14',   // only used when Show card is turned on for Pure Type
  'sacred-light':  '#0a0a14',
};

// Base alpha multiplied by the opacity slider, so the default 88% gives 0.55 / 0.704 glass.
export const THEME_ALPHA = { frosted: 0.625, 'frosted-light': 0.8 };

// Pure Type floats text on the video; every other theme starts with its card on.
const CARD_DEFAULT = { frosted: true, 'frosted-light': true, pure: false, 'sacred-light': true, custom: true };

// Body type scales with text length: short text large, long text small.
export const SIZE_RANGE = {
  'fs-sm': { min: 26, max: 34 },
  'fs-md': { min: 34, max: 46 },
  'fs-lg': { min: 46, max: 58 },
  'fs-xl': { min: 58, max: 72 },
};
export const SHORT_LEN = 80;
export const LONG_LEN  = 220;

// Baselines the Overlay Scale slider multiplies
export const MIN_HEIGHT_VH = { 'fs-sm': 18, 'fs-md': 24, 'fs-lg': 32, 'fs-xl': 42 };
export const LABEL_REM     = { 'fs-sm': 0.90, 'fs-md': 1.10, 'fs-lg': 1.30, 'fs-xl': 1.55 };

export function hexToRgba(hex, alpha) {
  const h = (typeof hex === 'string' ? hex : '').replace('#', '');
  const a = Math.max(0, Math.min(1, alpha));
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(10, 10, 20, ' + a + ')';
  return 'rgba(' + parseInt(h.slice(0, 2), 16) + ', '
                 + parseInt(h.slice(2, 4), 16) + ', '
                 + parseInt(h.slice(4, 6), 16) + ', ' + a + ')';
}

export function cardAlpha(theme, opacityPct) {
  const alpha = (opacityPct / 100) * (THEME_ALPHA[theme] ?? 1);
  return Math.max(0, Math.min(1, alpha));
}

export function defaultShowCard(theme) {
  return CARD_DEFAULT[theme] ?? true;
}

export function getScale(state) {
  const raw = state.scale !== undefined ? state.scale : 100;
  return Math.max(0.5, Math.min(1.5, raw / 100));
}

export function computeBodyFontSize(text, sizeClass, scale) {
  const range = SIZE_RANGE[sizeClass] || SIZE_RANGE['fs-md'];
  const len   = (text || '').length;
  let size;
  if (len < SHORT_LEN)     size = range.max;
  else if (len > LONG_LEN) size = range.min;
  else {
    const t = (len - SHORT_LEN) / (LONG_LEN - SHORT_LEN);
    size = Math.round(range.max - t * (range.max - range.min));
  }
  return Math.round(size * scale);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/overlay`
Expected: PASS. The overlay renderer still imports `THEME_BG` with the old keys; its `|| '#0a0a14'` fallback keeps it working until Task 3 rewrites it.

- [ ] **Step 5: Commit**

```bash
git add src/overlay tests/overlay
git commit -m "feat: line splitting, card alpha and per-theme card defaults for the overlay"
```

---

### Task 3: Overlay themes, animations and renderer

**Files:**
- Modify: `src/css/overlay.css` (replace whole file), `src/html/overlay.html` (initial classes), `src/overlay/render.js` (replace whole file)
- Create: `smoke/overlay.spec.js`

**Interfaces:**
- Consumes: `normalizeState`, `DEFAULTS` (Task 1: states arrive with valid `theme` and `animation`); `splitLines` (Task 2); `THEME_BG`, `MIN_HEIGHT_VH`, `LABEL_REM`, `hexToRgba`, `getScale`, `computeBodyFontSize`, `cardAlpha` (Task 2).
- Produces: `createRenderer(doc = document, onError = () => {}) -> { handle(rawState) }` (unchanged signature). DOM contract used by tests and later tasks: `#stage` carries classes `hidden`, `kind-*`, `theme-<theme>`, `pos-*`, `fs-*`, `anim-<animation>`, `no-card`, `lines-go`; `#card` may carry `card-in` / `card-out`; `#wrap` may carry `text-in` / `text-out`; in Line by line mode `#ov-body` contains `.ln` spans.
- Behaviour contract: the last command always wins. Every deferred step (animation end, timer) is ignored if a newer command has arrived (an epoch counter), so interrupted animations cannot leave the overlay hidden over new content or half-faded.

- [ ] **Step 1: Write the failing browser tests**

`smoke/overlay.spec.js`:

```js
import { test, expect } from '@playwright/test';

const KEY = 'obs-stage-display-state';
const THEMES = ['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom'];
const ANIMATIONS = ['rise', 'wipe', 'lines', 'cut'];
const VERSE = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';

async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/overlay.html');
  let seq = Date.now();
  const push = (state) => page.evaluate(
    ([key, payload]) => localStorage.setItem(key, JSON.stringify(payload)),
    [KEY, { action: 'show', kind: 'verse', version: 1, visible: true, body: VERSE, reference: 'John 3:16 KJV', ...state, seq: (seq += 1) }],
  );
  return { push, errors, stage: page.locator('#stage'), body: page.locator('#ov-body') };
}

test('every theme and animation renders a verse and hides again', async ({ page }) => {
  test.setTimeout(120000);
  const { push, errors, stage } = await setup(page);
  for (const theme of THEMES) {
    for (const animation of ANIMATIONS) {
      await push({ theme, animation });
      await expect(stage).not.toHaveClass(/hidden/);
      await expect(stage).toHaveClass(new RegExp(`theme-${theme}( |$)`));
      await expect(stage).toHaveClass(new RegExp(`anim-${animation}( |$)`));
      await expect(page.locator('#ov-body')).toContainText('For God so loved the world');
      await push({ action: 'hide', visible: false, theme, animation });
      await expect(stage).toHaveClass(/hidden/);
    }
  }
  expect(errors).toEqual([]);
});

test('Line by line splits a verse at its clauses and a song at its line breaks', async ({ page }) => {
  const { push } = await setup(page);
  await push({ animation: 'lines' });
  await expect(page.locator('#ov-body .ln')).toHaveCount(4);
  await push({ kind: 'song', title: 'Song', body: 'A line\nB line\nC line', animation: 'lines' });
  await expect(page.locator('#ov-body .ln')).toHaveCount(3);
  await push({ animation: 'rise' });
  await expect(page.locator('#ov-body .ln')).toHaveCount(0);
  await expect(page.locator('#ov-body')).toContainText('For God so loved the world');
});

for (const animation of ['rise', 'wipe']) {
  test(`${animation}: a content change ends fully visible with the new text`, async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ animation, body: 'First text here' });
    await expect(body).toHaveText('First text here');
    await push({ animation, body: 'Second text here' });
    await expect(body).toHaveText('Second text here');
    await expect(page.locator('#wrap')).toHaveCSS('opacity', '1');
    await expect(page.locator('#card')).toHaveCSS('opacity', '1');
  });
}

test('rapid Next presses end on the last text', async ({ page }) => {
  const { push, stage, body } = await setup(page);
  for (const text of ['Text one', 'Text two', 'Text three', 'Text four', 'Text five']) {
    await push({ animation: 'rise', body: text });
    await page.waitForTimeout(25);
  }
  await expect(body).toHaveText('Text five');
  await expect(stage).not.toHaveClass(/hidden/);
  await expect(page.locator('#wrap')).toHaveCSS('opacity', '1');
});

test('show then an immediate hide ends hidden and stays hidden', async ({ page }) => {
  const { push, stage } = await setup(page);
  await push({ animation: 'wipe' });
  await page.waitForTimeout(100);
  await push({ action: 'hide', visible: false, animation: 'wipe' });
  await expect(stage).toHaveClass(/hidden/);
  await page.waitForTimeout(900);
  await expect(stage).toHaveClass(/hidden/);
});

test('hide then an immediate show ends visible with the new text', async ({ page }) => {
  const { push, stage, body } = await setup(page);
  await push({ animation: 'rise', body: 'First text here' });
  await expect(stage).not.toHaveClass(/hidden/);
  await push({ action: 'hide', visible: false, animation: 'rise' });
  await page.waitForTimeout(150);
  await push({ animation: 'rise', body: 'Second text here' });
  await expect(body).toHaveText('Second text here');
  await page.waitForTimeout(800);
  await expect(stage).not.toHaveClass(/hidden/);
  await expect(page.locator('#card')).toHaveCSS('opacity', '1');
});

test('legacy and unknown theme and animation names still render', async ({ page }) => {
  const { push, stage } = await setup(page);
  await push({ theme: 'neon', animation: 'slide' });
  await expect(stage).toHaveClass(/theme-frosted( |$)/);
  await expect(stage).toHaveClass(/anim-rise( |$)/);
  await push({ theme: 'weird', animation: 'spin' });
  await expect(stage).toHaveClass(/theme-frosted( |$)/);
  await push({ theme: 'white', animation: 'none' });
  await expect(stage).toHaveClass(/theme-frosted-light( |$)/);
  await expect(stage).toHaveClass(/anim-cut( |$)/);
});

test('Sacred Light shows the image card, Pure Type floats text, Frosted uses glass alpha', async ({ page }) => {
  const { push, stage } = await setup(page);
  await push({ theme: 'sacred-light' });
  await expect(page.locator('#card')).toHaveCSS('background-image', /bg1\.png/);

  await push({ theme: 'pure', showCard: false });
  await expect(stage).toHaveClass(/no-card/);
  await push({ theme: 'pure', showCard: true });
  await expect(stage).not.toHaveClass(/no-card/);
  await expect(page.locator('#card')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await push({ theme: 'frosted', showCard: true, opacity: 88 });
  await expect(page.locator('#card')).toHaveCSS('background-color', /rgba\(14, 18, 30, 0\.55\d*\)/);
});

test('empty text never throws', async ({ page }) => {
  const { push, errors, stage } = await setup(page);
  for (const animation of ANIMATIONS) {
    await push({ animation, body: '', reference: '' });
    await expect(stage).not.toHaveClass(/hidden/);
    await push({ animation, body: '   ', reference: '', kind: 'song', title: '' });
  }
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Build and run to verify failure**

Run: `npm run build && npx playwright test smoke/overlay.spec.js`
Expected: FAIL (the overlay still has the old themes: `theme-frosted` class never appears, no `.ln` spans).

Note: the old `smoke/dock.spec.js` and `smoke/parity.spec.js` are expected to be red from this task until Task 7 deletes and replaces them; only run `smoke/overlay.spec.js` until then.

- [ ] **Step 3: Rewrite `src/css/overlay.css`**

Replace the whole file with the following (three parts, concatenated in this order).

Part 1, layout and text:

```css
/* OBS Stage Display - Overlay Styles
   One card, two kinds of content. A song slide shows a title above the text;
   a scripture slide shows a reference below it. Themes restyle the card,
   animations are classes added by render.js. */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%;
  height: 100%;
  background: transparent !important;
  overflow: hidden;
  pointer-events: none;
}

#stage {
  position: fixed;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 9999;
  pointer-events: none;
}
#stage.hidden { display: none; }
#stage.pos-bottom { bottom: 0; top: auto; padding-bottom: 28px; }
#stage.pos-top    { top: 0; bottom: auto; padding-top: 28px; }
#stage.pos-center { top: 50%; bottom: auto; transform: translateY(-50%); }

#card {
  width: 96%;
  max-width: 1800px;
  padding: 28px 52px 24px;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  transition: min-height 0.5s cubic-bezier(0.4, 0, 0.2, 1),
              max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: min-height, max-height;
  --accent: #9ec1ff;
  /* background, font and vertical padding are set by JS */
}

/* Card off: text floats directly on the video */
#stage.no-card #card {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
#stage.no-card .accent { display: none; }
#stage.no-card #ov-body { text-shadow: 0 2px 14px rgba(0, 0, 0, 0.95), 0 1px 4px rgba(0, 0, 0, 0.80); }
#stage.no-card #ov-title,
#stage.no-card #ov-ref  { text-shadow: 0 1px 8px rgba(0, 0, 0, 0.95); }

#wrap { width: 100%; text-align: center; }

#ov-title {
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-variant: small-caps;
  margin-bottom: 2px;
}
#ov-body {
  line-height: 1.7;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  width: 100%;
  max-width: 92%;
  margin: 0 auto;
}
#ov-ref {
  font-weight: 600;
  font-variant: small-caps;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
#ov-title:empty, #ov-ref:empty { display: none; }
.ln { display: block; }

.accent {
  display: block;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent) 20%, var(--accent) 80%, transparent);
}
.accent-top    { width: 60%; max-width: 400px; margin: 6px auto 2px; opacity: 0.45; }
.accent-bottom { width: 80%; max-width: 900px; margin: 14px auto 10px; opacity: 0.50; }
#stage.kind-verse .accent-top,
#stage.kind-song  .accent-bottom { display: none; }
#stage.no-title   .accent-top    { display: none; }
#stage.no-ref     .accent-bottom { display: none; }
```

Part 2, themes and sizes:

```css
/* Theme: Frosted (dark glass) */
.theme-frosted #card {
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  --accent: #9ec1ff;
}
.theme-frosted #ov-body  { color: #ffffff; }
.theme-frosted #ov-title,
.theme-frosted #ov-ref   { color: #9ec1ff; }

/* Theme: Frosted Light */
.theme-frosted-light #card {
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.30);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  --accent: #2f5fd0;
}
.theme-frosted-light #ov-body  { color: #1a2233; }
.theme-frosted-light #ov-title,
.theme-frosted-light #ov-ref   { color: #2f5fd0; font-weight: 800; }

/* Theme: Pure Type. No card by default; Show card adds a scrim set by JS */
.theme-pure .accent { display: none; }
.theme-pure #card   { border: none; box-shadow: none; }
.theme-pure #ov-body {
  color: #ffffff;
  font-weight: 700;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.85), 0 0 3px rgba(0, 0, 0, 0.9);
}
.theme-pure #ov-title,
.theme-pure #ov-ref {
  color: #ffffff;
  opacity: 0.9;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.9);
}

/* Theme: Sacred Light. The background image fills the card; JS sets the image. */
.theme-sacred-light #card {
  border: 1px solid rgba(232, 201, 122, 0.20);
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.70);
  --accent: #e8c97a;
}
.theme-sacred-light #ov-body {
  color: #ffffff;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.75), 0 1px 4px rgba(0, 0, 0, 0.55);
}
.theme-sacred-light #ov-title,
.theme-sacred-light #ov-ref {
  color: #e8c97a;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.70);
}

/* Theme: Custom. Structure only; colours come from JS */
.theme-custom #card {
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.60);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

/* Font sizes: the body size is set by JS so it can scale with text length */
#stage.fs-sm #card { min-height: 18vh; }
#stage.fs-md #card { min-height: 24vh; }
#stage.fs-lg #card { min-height: 32vh; }
#stage.fs-xl #card { min-height: 42vh; }

.fs-sm #ov-title, .fs-sm #ov-ref { font-size: 0.90rem; }
.fs-md #ov-title, .fs-md #ov-ref { font-size: 1.10rem; }
.fs-lg #ov-title, .fs-lg #ov-ref { font-size: 1.30rem; }
.fs-xl #ov-title, .fs-xl #ov-ref { font-size: 1.55rem; }
```

Part 3, animations (the JS adds and removes the `card-in`, `card-out`, `text-in`, `text-out` and `lines-go` classes):

```css
@keyframes riseIn     { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes riseOut    { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(6px); } }
@keyframes wipeIn     { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes wipeOut    { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 0 100%); } }
@keyframes fadeCardIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeCardOut{ from { opacity: 1; } to { opacity: 0; } }
@keyframes textIn     { from { opacity: 0; } to { opacity: 1; } }
@keyframes textOut    { from { opacity: 1; } to { opacity: 0; } }
@keyframes lineIn     { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* Soft rise */
.anim-rise #card.card-in  { animation: riseIn 0.5s ease-out both; }
.anim-rise #card.card-out { animation: riseOut 0.35s ease-in both; }

/* Glass wipe: the card sweeps in, then the text fades in */
.anim-wipe #card.card-in  { animation: wipeIn 0.6s cubic-bezier(0.22, 0.8, 0.3, 1) both; }
.anim-wipe #card.card-in #wrap { animation: textIn 0.35s ease-out 0.25s both; }
.anim-wipe #card.card-out { animation: wipeOut 0.4s ease-in both; }

/* Line by line: card fades, then each line rises in, staggered (--i and --stagger set by JS) */
.anim-lines #card.card-in  { animation: fadeCardIn 0.35s ease-out both; }
.anim-lines #card.card-out { animation: fadeCardOut 0.35s ease-in both; }
.anim-lines.lines-go .ln {
  opacity: 0;
  animation: lineIn 0.45s ease-out both;
  animation-delay: calc(var(--i, 0) * var(--stagger, 0.35s) + 0.15s);
}

/* Text swap while the card stays up (Soft rise and Glass wipe) */
#wrap.text-out { animation: textOut 0.2s ease-in both; }
#wrap.text-in  { animation: textIn 0.3s ease-out both; }

/* Instant cut: nothing moves */
.anim-cut #card, .anim-cut #wrap { animation: none !important; }
```

- [ ] **Step 4: Update the overlay page's initial classes**

```bash
sed -i 's/class="hidden kind-verse theme-dark pos-bottom fs-md"/class="hidden kind-verse theme-frosted pos-bottom fs-md anim-rise"/' src/html/overlay.html
grep -n 'id="stage"' src/html/overlay.html
```

Expected: the `#stage` line shows `theme-frosted` and `anim-rise`.

- [ ] **Step 5: Rewrite `src/overlay/render.js`**

Replace the whole file (part 1 of 2, setup and styles):

```js
import { DEFAULTS, normalizeState } from '../core/state.js';
import {
  THEME_BG, MIN_HEIGHT_VH, LABEL_REM,
  hexToRgba, getScale, computeBodyFontSize, cardAlpha,
} from './style-math.js';
import { splitLines } from './split-lines.js';

const KIND_CLASSES  = ['kind-verse', 'kind-song'];
const THEME_CLASSES = ['theme-frosted', 'theme-frosted-light', 'theme-pure', 'theme-sacred-light', 'theme-custom'];
const POS_CLASSES   = ['pos-bottom', 'pos-center', 'pos-top'];
const SIZE_CLASSES  = ['fs-sm', 'fs-md', 'fs-lg', 'fs-xl'];
const ANIM_CLASSES  = ['anim-rise', 'anim-wipe', 'anim-lines', 'anim-cut'];
const CARD_STATES   = ['card-in', 'card-out'];
const TEXT_STATES   = ['text-in', 'text-out'];
const SACRED_IMAGE  = 'assets/bg1.png';

// Fallback timers a little longer than the CSS durations, in case animationend never fires.
const ENTER_MS    = { rise: 560, wipe: 700, lines: 400 };
const LEAVE_MS    = { rise: 400, wipe: 460, lines: 400 };
const TEXT_OUT_MS = 240;
const TEXT_IN_MS  = 340;
const MAX_STAGGER_S  = 0.35;
const LINES_BUDGET_S = 2.4;

export function createRenderer(doc = document, onError = () => {}) {
  const stage   = doc.getElementById('stage');
  const card    = doc.getElementById('card');
  const wrap    = doc.getElementById('wrap');
  const titleEl = doc.getElementById('ov-title');
  const bodyEl  = doc.getElementById('ov-body');
  const refEl   = doc.getElementById('ov-ref');

  // Bumped by every valid command. Deferred steps compare against it, so the
  // last command always wins and an interrupted animation cannot leave the
  // overlay hidden over new text or half faded.
  let epoch = 0;

  function setClass(group, value) {
    group.forEach((c) => stage.classList.remove(c));
    stage.classList.add(value);
  }

  /** Replays a CSS animation class on el. done() runs once, and only if no newer command arrived. */
  function play(el, add, remove, fallbackMs, token, done) {
    remove.forEach((c) => el.classList.remove(c));
    void el.offsetWidth;                         // force reflow so the animation replays
    el.classList.add(add);
    let finished = false;
    let timer = null;
    const onEnd = (e) => { if (e.target === el) finish(); };
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      el.removeEventListener('animationend', onEnd);
      if (token === epoch && done) done();
    }
    timer = setTimeout(finish, fallbackMs);
    el.addEventListener('animationend', onEnd);
  }

  function applyStyles(state) {
    const kind       = state.kind === 'song' ? 'song' : 'verse';
    const theme      = state.theme;
    const opacityPct = state.opacity !== undefined ? state.opacity : 88;
    const font       = state.font || 'Open Sans';
    const sizeClass  = 'fs-' + (state.fontSize || 'md');
    const scale      = getScale(state);
    const colors     = state.customColors || DEFAULTS.customColors;

    setClass(KIND_CLASSES,  'kind-' + kind);
    setClass(THEME_CLASSES, 'theme-' + theme);
    setClass(POS_CLASSES,   'pos-' + (state.position || 'bottom'));
    setClass(SIZE_CLASSES,  sizeClass);
    setClass(ANIM_CLASSES,  'anim-' + state.animation);
    if (state.animation !== 'lines') stage.classList.remove('lines-go');

    // A background image implies a visible card, since the image is the card.
    let imageUrl = null;
    if (theme === 'sacred-light')                       imageUrl = SACRED_IMAGE;
    else if (state.bgMode === 'image' && state.bgImage) imageUrl = state.bgImage;

    const showCard = imageUrl ? true : (state.showCard !== false);
    stage.classList.toggle('no-card', !showCard);

    card.style.background         = '';
    card.style.backgroundColor    = '';
    card.style.backgroundImage    = '';
    card.style.backgroundSize     = '';
    card.style.backgroundPosition = '';
    card.style.backgroundRepeat   = '';

    if (imageUrl) {
      card.style.backgroundImage    = 'url("' + imageUrl + '")';
      card.style.backgroundSize     = 'cover';
      card.style.backgroundPosition = 'center';
      card.style.backgroundRepeat   = 'no-repeat';
    } else if (showCard) {
      const hex = theme === 'custom' ? colors.bg : (THEME_BG[theme] || THEME_BG.frosted);
      card.style.background = hexToRgba(hex, cardAlpha(theme, opacityPct));
    } else {
      card.style.backgroundColor = 'transparent';
    }

    if (theme === 'custom') {
      const accent = colors.accent || '#a78bfa';
      bodyEl.style.color  = colors.text || '#ffffff';
      titleEl.style.color = accent;
      refEl.style.color   = accent;
      card.style.setProperty('--accent', accent);
    } else {
      bodyEl.style.color  = '';
      titleEl.style.color = '';
      refEl.style.color   = '';
      card.style.removeProperty('--accent');
    }

    card.style.fontFamily  = "'" + font + "', 'Open Sans', Georgia, serif";
    bodyEl.style.fontStyle = state.italic ? 'italic' : 'normal';

    const hideTitle = kind !== 'song'  || state.showTitle === false;
    const hideRef   = kind !== 'verse' || state.showReference === false;
    titleEl.style.display = hideTitle ? 'none' : '';
    refEl.style.display   = hideRef   ? 'none' : '';
    stage.classList.toggle('no-title', hideTitle);
    stage.classList.toggle('no-ref',   hideRef);

    // Overlay Scale: card height and vertical padding only, so width never changes.
    card.style.minHeight     = ((MIN_HEIGHT_VH[sizeClass] || 24) * scale) + 'vh';
    card.style.paddingTop    = Math.round(28 * scale) + 'px';
    card.style.paddingBottom = Math.round(24 * scale) + 'px';
    card.style.paddingLeft   = '52px';
    card.style.paddingRight  = '52px';

    const labelRem = (LABEL_REM[sizeClass] || 1.10) * scale;
    titleEl.style.fontSize = labelRem + 'rem';
    refEl.style.fontSize   = labelRem + 'rem';
  }
```

Part 2 of 2 (append directly after part 1, inside the same function):

```js
  function scaleText(text, sizeClass, scale) {
    bodyEl.style.fontSize = computeBodyFontSize(text, sizeClass, scale) + 'px';
  }

  function fillContent(state) {
    const isSong = state.kind === 'song';
    titleEl.textContent = isSong ? (state.title || '') : '';
    refEl.textContent   = isSong ? '' : (state.reference || '');
    const body = state.body || '';
    bodyEl.setAttribute('aria-label', body);

    if (state.animation === 'lines') {
      const lines = splitLines(body, state.kind);
      bodyEl.textContent = '';
      lines.forEach((text, i) => {
        const span = doc.createElement('span');
        span.className = 'ln';
        span.style.setProperty('--i', String(i));
        span.textContent = text;
        bodyEl.appendChild(span);
      });
      const stagger = lines.length > 1 ? Math.min(MAX_STAGGER_S, LINES_BUDGET_S / lines.length) : MAX_STAGGER_S;
      bodyEl.style.setProperty('--stagger', stagger + 's');
    } else {
      bodyEl.textContent = body;
      bodyEl.style.removeProperty('--stagger');
    }
    scaleText(body, 'fs-' + (state.fontSize || 'md'), getScale(state));
  }

  function restartLines() {
    stage.classList.remove('lines-go');
    void stage.offsetWidth;
    stage.classList.add('lines-go');
  }

  function show(state, token) {
    const anim       = state.animation;
    const wasVisible = !stage.classList.contains('hidden');
    const commit = () => {
      applyStyles(state);
      fillContent(state);
      stage.classList.remove('hidden');
    };

    // A hide may have been in flight: put the card back before anything else.
    CARD_STATES.forEach((c) => card.classList.remove(c));
    TEXT_STATES.forEach((c) => wrap.classList.remove(c));

    if (!wasVisible) {
      commit();
      if (anim === 'cut') return;
      play(card, 'card-in', CARD_STATES, ENTER_MS[anim], token, () => card.classList.remove('card-in'));
      if (anim === 'lines') restartLines();
      return;
    }

    // Already on screen: the card stays put and only the text changes.
    if (anim === 'cut')   { commit(); return; }
    if (anim === 'lines') { commit(); restartLines(); return; }
    play(wrap, 'text-out', TEXT_STATES, TEXT_OUT_MS, token, () => {
      commit();
      play(wrap, 'text-in', TEXT_STATES, TEXT_IN_MS, token, () => wrap.classList.remove('text-in'));
    });
  }

  function hide(state, token) {
    if (stage.classList.contains('hidden')) return;
    const anim = state.animation;
    const finish = () => {
      CARD_STATES.forEach((c) => card.classList.remove(c));
      TEXT_STATES.forEach((c) => wrap.classList.remove(c));
      stage.classList.add('hidden');
    };
    if (anim === 'cut') { finish(); return; }
    setClass(ANIM_CLASSES, 'anim-' + anim);
    TEXT_STATES.forEach((c) => wrap.classList.remove(c));
    play(card, 'card-out', CARD_STATES, LEAVE_MS[anim], token, finish);
  }

  function clear() {
    CARD_STATES.forEach((c) => card.classList.remove(c));
    TEXT_STATES.forEach((c) => wrap.classList.remove(c));
    stage.classList.remove('lines-go');
    stage.classList.add('hidden');
    titleEl.textContent = '';
    bodyEl.textContent  = '';
    refEl.textContent   = '';
  }

  function handle(raw) {
    try {
      const state = normalizeState(raw);
      if (!state) return;                       // hostile, newer or unknown kind: render nothing
      epoch += 1;
      const token = epoch;
      switch (state.action) {
        case 'show':  show(state, token);  break;
        case 'hide':  hide(state, token);  break;
        case 'clear': clear();             break;
      }
    } catch (err) {
      onError(err);                             // a blank overlay beats a broken one on a live stream
    }
  }

  return { handle };
}
```

- [ ] **Step 6: Build and run to verify pass**

Run: `npm run build && npx playwright test smoke/overlay.spec.js`
Expected: PASS (all tests in `overlay.spec.js`; the 20-combination test takes about 20 seconds). Then `npx vitest run` and expect the unit suite green.

If "hide then an immediate show" fails, check that `show()` removes `card-out` before computing `wasVisible` behaviour, and that no `done` callback runs without the `token === epoch` guard.

- [ ] **Step 7: Commit**

```bash
git add src/css/overlay.css src/html/overlay.html src/overlay smoke/overlay.spec.js
git commit -m "feat: new overlay themes and animations with last-command-wins rendering"
```

---

### Task 4: Smart box rules (pure)

**Files:**
- Modify: `src/scripture/books.js` (extract `normalizeBookName`, patched by a script below)
- Create: `src/scripture/smart-input.js`
- Test: `tests/scripture/smart-input.test.js`, `tests/scripture/books.test.js` (append)

**Interfaces:**
- Consumes: `BIBLE_BOOKS`, `BOOK_ALIASES`, `bookIndexOf` (books.js), `parseReference` (reference.js).
- Produces (`books.js`): `normalizeBookName(name) -> string` (lower-case, trimmed, trailing dot removed, leading `1st`/`first`/`I` -> `1 `, `2nd`/`second`/`II` -> `2 `, `3rd`/`third`/`III` -> `3 `, whitespace collapsed; `''` for empty). `bookIndexOf` behaves exactly as before.
- Produces (`smart-input.js`):
  - `suggestBooks(text, limit = 5) -> string[]`: book names whose name, abbreviation or alias **starts with** the normalised text, in Bible order, at most `limit`.
  - `classifyInput(text) -> { kind: 'empty' } | { kind: 'reference', reference: string } | { kind: 'book', bookIndex: number } | { kind: 'search', query: string }`. Order: blank -> empty; `parseReference` succeeds and its book resolves -> reference (the trimmed text); `bookIndexOf(text)` resolves -> book; otherwise search (the trimmed text).
  - `dropdownRows(text) -> Array<{ type: 'book', name: string } | { type: 'search', query: string }>`: the book suggestions, plus one search row when the text has at least 3 letters, is not a valid reference and is not a resolvable book.

- [ ] **Step 1: Write the failing tests**

`tests/scripture/smart-input.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { suggestBooks, classifyInput, dropdownRows } from '../../src/scripture/smart-input.js';
import { BIBLE_BOOKS } from '../../src/scripture/books.js';

const nameAt = (i) => BIBLE_BOOKS[i][0];

describe('suggestBooks', () => {
  it('suggests by prefix, abbreviation and alias, in Bible order', () => {
    expect(suggestBooks('joh')).toEqual(['John']);
    expect(suggestBooks('ps')).toEqual(['Psalms']);
    expect(suggestBooks('1 jo')).toEqual(['1 John']);
    expect(suggestBooks('II cor')).toEqual(['2 Corinthians']);
  });
  it('caps the list and handles ambiguity', () => {
    const jo = suggestBooks('jo');
    expect(jo.length).toBeLessThanOrEqual(5);
    expect(jo).toContain('John');
    expect(suggestBooks('j', 2)).toHaveLength(2);
  });
  it('returns nothing for blank or unknown text', () => {
    expect(suggestBooks('')).toEqual([]);
    expect(suggestBooks('   ')).toEqual([]);
    expect(suggestBooks('zzz')).toEqual([]);
  });
});

describe('classifyInput', () => {
  it('treats blank input as empty', () => {
    expect(classifyInput('')).toEqual({ kind: 'empty' });
    expect(classifyInput('   ')).toEqual({ kind: 'empty' });
    expect(classifyInput(undefined)).toEqual({ kind: 'empty' });
  });
  it.each([
    ['John 3:16', 'John 3:16'],
    ['  Psalm 23 ', 'Psalm 23'],
    ['1 Cor 13:4-7', '1 Cor 13:4-7'],
    ['john  3 :16', 'john  3 :16'],
    ['JOHN 3.16', 'JOHN 3.16'],
  ])('reads %j as a reference', (text, reference) => {
    expect(classifyInput(text)).toEqual({ kind: 'reference', reference });
  });
  it('reads a bare book name, with ordinals, as a book', () => {
    expect(classifyInput('john')).toEqual({ kind: 'book', bookIndex: 42 });
    expect(nameAt(classifyInput('II Corinthians').bookIndex)).toBe('2 Corinthians');
    expect(nameAt(classifyInput('1 John').bookIndex)).toBe('1 John');
  });
  it.each([
    ['loved the world', 'loved the world'],
    ['the', 'the'],
    ['316', '316'],
    ['jo', 'jo'],
    ['Hezekiah 1:1', 'Hezekiah 1:1'],
    ['John 3:16 loved', 'John 3:16 loved'],
  ])('falls back to word search for %j', (text, query) => {
    expect(classifyInput(text)).toEqual({ kind: 'search', query });
  });
  it('never throws on very long or odd input', () => {
    const long = 'love '.repeat(400);
    expect(classifyInput(long).kind).toBe('search');
    expect(classifyInput('???').kind).toBe('search');
    expect(classifyInput('\n\t').kind).toBe('empty');
  });
});

describe('dropdownRows', () => {
  it('shows book rows for a prefix and no search row for a unique book', () => {
    expect(dropdownRows('joh')).toEqual([{ type: 'book', name: 'John' }]);
    expect(dropdownRows('mark')).toEqual([{ type: 'book', name: 'Mark' }]);
  });
  it('offers word search for text that is not a book or reference', () => {
    expect(dropdownRows('loved')).toEqual([{ type: 'search', query: 'loved' }]);
    expect(dropdownRows('the')).toEqual([{ type: 'search', query: 'the' }]);
    expect(dropdownRows('Hezekiah')).toEqual([{ type: 'search', query: 'Hezekiah' }]);
  });
  it('shows nothing for a finished reference, short text or blank input', () => {
    expect(dropdownRows('John 3:16')).toEqual([]);
    expect(dropdownRows('lo')).toEqual([]);
    expect(dropdownRows('')).toEqual([]);
  });
  it('keeps suggestions for short prefixes without a search row', () => {
    expect(dropdownRows('ps')).toEqual([{ type: 'book', name: 'Psalms' }]);
    expect(dropdownRows('1 jo')).toEqual([{ type: 'book', name: '1 John' }]);
  });
});
```

Append to `tests/scripture/books.test.js`:

```js
import { normalizeBookName } from '../../src/scripture/books.js';

describe('normalizeBookName', () => {
  it.each([
    ['John', 'john'], ['  II  Corinthians.', '2 corinthians'], ['1st John', '1 john'],
    ['Third John', '3 john'], ['I Samuel', '1 samuel'], ['', ''], [undefined, ''],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeBookName(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/scripture`
Expected: FAIL (`smart-input.js` and `normalizeBookName` are missing).

- [ ] **Step 3: Extract `normalizeBookName` from `bookIndexOf`**

Create a throwaway script `tmp-patch-books.mjs` in the repo root (delete it after running). It uses `String.fromCharCode(92)` so no double backslashes are needed:

```js
import { readFileSync, writeFileSync } from 'node:fs';

const BS = String.fromCharCode(92);
const file = 'src/scripture/books.js';
let source = readFileSync(file, 'utf8');

const start = source.indexOf("  let n = (name || '').toLowerCase()");
const endMarker = "    .replace(/" + BS + "s+/g, ' ');" + String.fromCharCode(10);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('bookIndexOf normalisation block not found');

const replacement = "  const n = normalizeBookName(name);" + String.fromCharCode(10)
                  + "  if (!n) return -1;" + String.fromCharCode(10);
source = source.slice(0, start) + replacement + source.slice(end + endMarker.length);

source += `
/** Lower-case a typed book name and normalise ordinals: "II Cor." becomes "2 cor". */
export function normalizeBookName(name) {
  const n = (name || '').toLowerCase().trim().replace(/${BS}.$/, '');
  return n
    .replace(/^(1st|first|i)${BS}s+/,   '1 ')
    .replace(/^(2nd|second|ii)${BS}s+/, '2 ')
    .replace(/^(3rd|third|iii)${BS}s+/, '3 ')
    .replace(/${BS}s+/g, ' ');
}
`;
writeFileSync(file, source);
console.log('books.js patched');
```

```bash
node tmp-patch-books.mjs && rm tmp-patch-books.mjs
sed -n '/export function bookIndexOf/,/^}/p' src/scripture/books.js | head -12
```

Expected: the start of `bookIndexOf` now reads `const n = normalizeBookName(name);` then `if (!n) return -1;` followed by the exact-name lookup (`let i = BIBLE_BOOKS.findIndex(`). `normalizeBookName` is a function declaration, so it can sit after `bookIndexOf` in the file.

Run: `npx vitest run tests/scripture/books.test.js`
Expected: PASS (existing `bookIndexOf` tests unchanged, new `normalizeBookName` tests green).

- [ ] **Step 4: Implement `src/scripture/smart-input.js`**

```js
import { BIBLE_BOOKS, BOOK_ALIASES, bookIndexOf, normalizeBookName } from './books.js';
import { parseReference } from './reference.js';

const MIN_SEARCH_LETTERS = 3;

/** Book names starting with the typed text (name, abbreviation or alias), in Bible order. */
export function suggestBooks(text, limit = 5) {
  const q = normalizeBookName(text);
  if (!q) return [];
  const matched = new Set();
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

/** What Enter should do with the text in the smart box. */
export function classifyInput(text) {
  const t = (text || '').trim();
  if (!t) return { kind: 'empty' };
  if (referenceBookResolves(t)) return { kind: 'reference', reference: t };
  const bookIndex = bookIndexOf(t);
  if (bookIndex !== -1) return { kind: 'book', bookIndex };
  return { kind: 'search', query: t };
}

/** Rows for the dropdown under the smart box while typing. */
export function dropdownRows(text) {
  const t = (text || '').trim();
  if (!t) return [];
  const rows = suggestBooks(t).map((name) => ({ type: 'book', name }));
  const letters = (t.match(/[a-z]/gi) || []).length;
  if (letters >= MIN_SEARCH_LETTERS && !referenceBookResolves(t) && bookIndexOf(t) === -1) {
    rows.push({ type: 'search', query: t });
  }
  return rows;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run`
Expected: PASS (whole unit suite).

- [ ] **Step 6: Commit**

```bash
git add src/scripture tests/scripture
git commit -m "feat: smart box rules as pure, tested functions"
```

---

### Task 5: Song search and the settings store (pure logic)

**Files:**
- Create: `src/songs/search.js`, `src/dock/settings-store.js`
- Test: `tests/songs/search.test.js`, `tests/dock/settings-store.test.js`

**Interfaces:**
- Produces (`search.js`): `normalizeText(text) -> string` (lower-case, accents and apostrophes removed, any other run of non-letter and non-digit characters becomes one space, trimmed; works for any script), `tokenize(query) -> string[]`, `songMatches(song, query) -> { matched, via: 'title' | 'lyrics' | null, excerpt: string | null, score: number }`, `searchSongs(songs, query) -> Array<{ song, via, excerpt, score }>` (matches only, best first) and `markTokens(text, tokens) -> string` (HTML-escaped text with every token occurrence wrapped in `<mark>`).
  - A song matches when **every** word of the query appears somewhere in its title, alternative title or lyrics: any order, partial words allowed, punctuation and accents ignored (so `dont know` finds "don't know" and `senor` finds "Señor"). A query with no words (blank or only punctuation) matches every song with score 0.
  - Ranking: all words in the title first (a title that starts with the query highest), then partial title hits, then lyric-only matches; ties alphabetical by title.
  - `via` is `'title'` when every word is in the title or alternative title, otherwise `'lyrics'`. For `'lyrics'` the excerpt is about 30 characters of context before the first hit in the slide with the most hits, with `...` where cut; for `'title'` it is `null`. Non-string slide entries are ignored.
- Produces (`settings-store.js`): `createSettingsStore({ storage, onError }) -> { get(), update(patch), subscribe(fn), styleState() }`.
  - `get()` returns the current settings object (initially `loadSettings`, so legacy values are migrated).
  - `update(patch)` returns a **new** settings object (shallow merge, `customColors` merged), persists only the persisted keys, notifies subscribers with the new object.
  - `styleState()` returns the overlay-facing fields only: `theme, position, fontSize, animation, font, italic, opacity, scale, showCard, showTitle, showReference, customColors, bgMode, bgImage`.
  - Persisted keys: the style keys above (except `bgMode`), `bgImage`, `language`, `translation`, `autoShow`.

- [ ] **Step 1: Write the failing tests**

`tests/songs/search.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeText, tokenize, songMatches, searchSongs, markTokens } from '../../src/songs/search.js';

const grace = { id: '1', title: 'Amazing Grace', altTitle: 'Newton Hymn', slides: ['Amazing grace how sweet the sound', 'Verse 2 That saved a wretch like me'] };

describe('normalizeText and tokenize', () => {
  it('lower-cases, strips accents and apostrophes, and turns other punctuation into spaces', () => {
    expect(normalizeText("Don't  STOP, Señor!")).toBe('dont stop senor');
    expect(normalizeText('')).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
  it('keeps letters and digits from other scripts', () => {
    expect(normalizeText('Господь, Бог')).toBe('господь бог');
    expect(normalizeText('和合本 1:1')).toBe('和合本 1 1');
  });
  it('tokenizes into words', () => {
    expect(tokenize('  Grace   how-sweet ')).toEqual(['grace', 'how', 'sweet']);
    expect(tokenize('!!!')).toEqual([]);
  });
});

describe('songMatches', () => {
  it('matches everything for an empty or punctuation-only query', () => {
    expect(songMatches(grace, '')).toEqual({ matched: true, via: null, excerpt: null, score: 0 });
    expect(songMatches(grace, '   ').matched).toBe(true);
    expect(songMatches(grace, '!!!').matched).toBe(true);
  });
  it('matches titles and alternative titles, ignoring case', () => {
    expect(songMatches(grace, 'AMAZING')).toMatchObject({ matched: true, via: 'title', excerpt: null });
    expect(songMatches(grace, 'newton')).toMatchObject({ matched: true, via: 'title' });
  });
  it('matches a partial lyric and returns an excerpt with context', () => {
    const result = songMatches(grace, 'sweet the sound');
    expect(result).toMatchObject({ matched: true, via: 'lyrics' });
    expect(result.excerpt).toContain('sweet');
  });
  it('matches words in any order, spread over title and slides', () => {
    expect(songMatches(grace, 'wretch grace')).toMatchObject({ matched: true, via: 'lyrics' });
    expect(songMatches(grace, 'sound amazing')).toMatchObject({ matched: true });
  });
  it('matches partial words', () => {
    expect(songMatches(grace, 'amaz')).toMatchObject({ matched: true, via: 'title' });
    expect(songMatches(grace, 'wret')).toMatchObject({ matched: true, via: 'lyrics' });
  });
  it('ignores punctuation and accents on both sides', () => {
    const know = { id: '2', title: 'Know', slides: ["I don't know why"] };
    expect(songMatches(know, 'dont know').matched).toBe(true);
    expect(songMatches(know, "don't know").matched).toBe(true);
    const senor = { id: '3', title: 'Señor', slides: [] };
    expect(songMatches(senor, 'senor').matched).toBe(true);
    expect(songMatches(senor, 'SEÑOR').matched).toBe(true);
  });
  it('requires every word', () => {
    expect(songMatches(grace, 'amazing zebra').matched).toBe(false);
    expect(songMatches(grace, 'zebra').matched).toBe(false);
  });
  it('adds ellipses when the excerpt is cut', () => {
    const long = { id: '4', title: 'Long', slides: ['a'.repeat(80) + ' needle ' + 'b'.repeat(80)] };
    const { excerpt } = songMatches(long, 'needle');
    expect(excerpt.startsWith('...')).toBe(true);
    expect(excerpt.endsWith('...')).toBe(true);
    expect(excerpt).toContain('needle');
  });
  it('ignores malformed slides and missing slide lists', () => {
    const odd = { id: '5', title: 'Odd', slides: [null, 5, { text: 'x' }, 'real words here'] };
    expect(songMatches(odd, 'real').via).toBe('lyrics');
    expect(songMatches(odd, 'zzz').matched).toBe(false);
    expect(songMatches({ id: '6', title: 'T' }, 'x').matched).toBe(false);
  });
});

describe('searchSongs', () => {
  const lyricOnly = { id: '2', title: 'Other Song', slides: ['grace and mercy'] };
  const titleStart = { id: '3', title: 'Grace Greater Than Our Sin', slides: ['x'] };
  const titleMid = { id: '4', title: 'Amazing Grace', slides: ['y'] };

  it('ranks title-start, then title, then lyric matches, and drops non-matches', () => {
    const found = searchSongs([lyricOnly, titleMid, titleStart, { id: '9', title: 'Nothing', slides: ['z'] }], 'grace');
    expect(found.map((r) => r.song.id)).toEqual(['3', '4', '2']);
    expect(found[2].via).toBe('lyrics');
  });
  it('lists everything alphabetically for an empty query', () => {
    expect(searchSongs([lyricOnly, titleStart, titleMid], '').map((r) => r.song.id)).toEqual(['4', '3', '2']);
  });
});

describe('markTokens', () => {
  it('wraps each token occurrence, case-insensitively', () => {
    expect(markTokens('Amazing grace', ['amaz', 'grace'])).toBe('<mark>Amaz</mark>ing <mark>grace</mark>');
  });
  it('escapes HTML and never marks inside an entity', () => {
    expect(markTokens('a <b> & c', ['b'])).toBe('a &lt;<mark>b</mark>&gt; &amp; c');
    expect(markTokens('Fish & amp', ['amp'])).toBe('Fish &amp; <mark>amp</mark>');
  });
  it('returns escaped text when there is nothing to mark', () => {
    expect(markTokens('x < y', [])).toBe('x &lt; y');
    expect(markTokens('', ['a'])).toBe('');
  });
});
```

`tests/dock/settings-store.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createSettingsStore } from '../../src/dock/settings-store.js';
import { SETTINGS_KEY } from '../../src/core/settings.js';
import { memoryStorage } from '../helpers/memory-storage.js';

describe('settings store', () => {
  it('starts from defaults and migrates legacy saved values', () => {
    expect(createSettingsStore({ storage: memoryStorage() }).get()).toMatchObject({ theme: 'frosted', animation: 'rise', opacity: 88 });
    const legacy = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'white', animation: 'none', language: 'English' }) });
    expect(createSettingsStore({ storage: legacy }).get()).toMatchObject({ theme: 'frosted-light', animation: 'cut', language: 'English' });
  });

  it('update returns a new object, merges custom colours and notifies', () => {
    const store = createSettingsStore({ storage: memoryStorage() });
    const before = store.get();
    const seen = vi.fn();
    store.subscribe(seen);
    const after = store.update({ theme: 'pure', customColors: { bg: '#111111' } });
    expect(after).not.toBe(before);
    expect(before.theme).toBe('frosted');
    expect(after.theme).toBe('pure');
    expect(after.customColors).toEqual({ bg: '#111111', text: '#ffffff', accent: '#a78bfa' });
    expect(seen).toHaveBeenCalledWith(after);
  });

  it('persists only the persisted keys and survives a reload', () => {
    const storage = memoryStorage();
    const store = createSettingsStore({ storage });
    store.update({ theme: 'sacred-light', translation: 'WEB', autoShow: true, seq: 99, action: 'hide' });
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY));
    expect(saved).toMatchObject({ theme: 'sacred-light', translation: 'WEB', autoShow: true });
    expect('seq' in saved).toBe(false);
    expect('action' in saved).toBe(false);
    expect(createSettingsStore({ storage }).get()).toMatchObject({ theme: 'sacred-light', translation: 'WEB', autoShow: true });
  });

  it('styleState exposes only overlay fields and derives bgMode', () => {
    const store = createSettingsStore({ storage: memoryStorage() });
    const plain = store.styleState();
    expect(plain.bgMode).toBe('color');
    expect(plain.bgImage).toBeNull();
    expect('translation' in plain).toBe(false);
    expect('autoShow' in plain).toBe(false);
    store.update({ bgImage: 'data:image/png;base64,AAAA' });
    expect(store.styleState()).toMatchObject({ bgMode: 'image', bgImage: 'data:image/png;base64,AAAA' });
  });

  it('styleState returns a copy of the custom colours', () => {
    const store = createSettingsStore({ storage: memoryStorage() });
    const style = store.styleState();
    style.customColors.bg = '#000000';
    expect(store.get().customColors.bg).toBe('#0a0a14');
  });

  it('reports corrupt storage and keeps working with defaults', () => {
    const onError = vi.fn();
    const store = createSettingsStore({ storage: memoryStorage({ [SETTINGS_KEY]: '{oops' }), onError });
    expect(store.get().theme).toBe('frosted');
    expect(onError).toHaveBeenCalled();
    expect(() => store.update({ theme: 'pure' })).not.toThrow();
  });

  it('does not throw when saving fails', () => {
    const onError = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const store = createSettingsStore({ storage, onError });
    expect(store.update({ theme: 'pure' }).theme).toBe('pure');
    expect(onError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/songs/search.test.js tests/dock/settings-store.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/songs/search.js`:

```js
const CONTEXT = 30;
const NO_MATCH = Object.freeze({ matched: false, via: null, excerpt: null, score: 0 });

/** Lower-case, accent-free, apostrophe-free text where every other run of punctuation becomes one space. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(query) {
  const normalized = normalizeText(query);
  return normalized ? normalized.split(' ') : [];
}

function excerptFor(slides, tokens) {
  let best = '';
  let bestHits = -1;
  for (const slide of slides) {
    const normalized = normalizeText(slide);
    const hits = tokens.filter((t) => normalized.includes(t)).length;
    if (hits > bestHits) { best = slide; bestHits = hits; }
  }
  const lower = best.toLowerCase();
  const found = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const idx = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, idx - CONTEXT);
  const end = Math.min(best.length, idx + CONTEXT * 2);
  return (start > 0 ? '...' : '') + best.slice(start, end).trim() + (end < best.length ? '...' : '');
}

/** Does the song match, and how well? Every word of the query must appear in the title or the lyrics. */
export function songMatches(song, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return { matched: true, via: null, excerpt: null, score: 0 };

  const titleText = normalizeText([song.title, song.altTitle].filter((t) => typeof t === 'string').join(' '));
  const slides = (song.slides || []).filter((s) => typeof s === 'string');
  const lyricsText = normalizeText(slides.join(' '));

  let titleHits = 0;
  let lyricHits = 0;
  for (const token of tokens) {
    const inTitle = titleText.includes(token);
    const inLyrics = lyricsText.includes(token);
    if (!inTitle && !inLyrics) return NO_MATCH;
    if (inTitle) titleHits += 1;
    if (inLyrics) lyricHits += 1;
  }

  const phrase = tokens.join(' ');
  const allInTitle = titleHits === tokens.length;
  let score = titleHits * 50 + lyricHits * 10;
  if (allInTitle) score += 1000;
  if (titleText.startsWith(phrase)) score += 500;
  else if (titleText.includes(phrase)) score += 200;
  if (lyricsText.includes(phrase)) score += 100;

  return { matched: true, via: allInTitle ? 'title' : 'lyrics', excerpt: allInTitle ? null : excerptFor(slides, tokens), score };
}

/** Matching songs, best first; ties alphabetical. An empty query lists every song alphabetically. */
export function searchSongs(songs, query) {
  return songs
    .map((song) => ({ song, ...songMatches(song, query) }))
    .filter((result) => result.matched)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML-safe text with every token occurrence wrapped in a mark element. */
export function markTokens(text, tokens) {
  const raw = String(text ?? '');
  const usable = (tokens || []).filter(Boolean).map(escapeRegExp);
  if (!usable.length) return escapeHtml(raw);
  const parts = raw.split(new RegExp('(' + usable.join('|') + ')', 'i'));
  return parts.map((part, i) => (i % 2 === 1 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part))).join('');
}
```

`src/dock/settings-store.js`:

```js
import { loadSettings, saveSettings } from '../core/settings.js';

const STYLE_KEYS = ['theme', 'position', 'fontSize', 'animation', 'font', 'italic', 'opacity',
                    'scale', 'showCard', 'showTitle', 'showReference'];
const PERSISTED_KEYS = [...STYLE_KEYS, 'customColors', 'bgImage', 'language', 'translation', 'autoShow'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

/** The one in-memory copy of the persisted dock settings. Values are replaced, never mutated. */
export function createSettingsStore({ storage, onError = () => {} } = {}) {
  let current = loadSettings({ storage, onError });
  const listeners = new Set();

  return {
    get: () => current,

    update(patch) {
      current = {
        ...current,
        ...patch,
        customColors: { ...current.customColors, ...(patch.customColors || {}) },
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
        bgMode: current.bgImage ? 'image' : 'color',
        bgImage: current.bgImage || null,
      };
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run`
Expected: PASS (whole unit suite).

- [ ] **Step 5: Add the new pure dock module to the coverage include list**

In `vitest.config.js`, extend the `coverage.include` array with `'src/dock/settings-store.js'` (the other new pure modules live under directories already listed). Then run `npx vitest run --coverage` and expect the thresholds to hold.

- [ ] **Step 6: Commit**

```bash
git add src/songs/search.js src/dock/settings-store.js tests vitest.config.js
git commit -m "feat: song search matching and the dock settings store"
```

---

### Task 6: Dock shell (design system, markup, live bar, tab wiring)

This task replaces the dock page and styles in one go. The old dock modules and old browser specs are deleted here because they cannot run against the new markup; each following task re-adds one tab together with its own browser tests. After this task the dock loads, switches tabs and shows the pinned live bar; the tab panels are fully marked up but not yet wired.

**Files:**
- Create: `src/css/tokens.css`, `src/css/base.css`, `src/css/live-bar.css`, `src/css/tabs.css`, `src/css/fields.css`, `src/css/cards.css`, `src/css/banners.css`, `src/dock/live-bar.js`, `smoke/helpers.js`, `smoke/shell.spec.js`
- Modify (replace whole file): `src/html/dock.html`, `src/dock/status.js`, `src/dock/main.js`
- Modify: `build.mjs` (concatenate the dock sheets), `tests/build/build.test.js` (append one test)
- Delete: `src/css/dock.css`, `src/dock/stream-controls.js`, `src/dock/display-settings.js`, `src/dock/library-ui.js`, `src/dock/scripture-tab.js`, `src/dock/songs-tab.js`, `smoke/dock.spec.js`, `smoke/parity.spec.js`

**Interfaces:**
- Consumes: `createSession` (unchanged; `session.activeTab` is `'scripture'` or `'songs'`), `createDiagnostics`, `createBrowserTransport`, `createSettingsStore` (Task 5, `styleState()` feeds `readSettings`).
- Produces (`status.js`): `createStatus({ statusBar }) -> { setStatus(message, type?) }` where `type` is `'error'`, `'success'`, `'loading'` or empty.
- Produces (`live-bar.js`): `initLiveBar({ session, tabs, setStatus }) -> { refresh() }`. `tabs` is a plain object that later tasks fill: `tabs.scripture` and `tabs.songs`, each `{ getContent(), preview() -> { has, text, sub, canNav }, step(dir), markShown?(), resetPosition?() }`. `refresh()` repaints the bar from the session and the active tab. It also binds Show / Hide / Clear / Prev / Next and the global keyboard shortcuts.
- Produces (`main.js`): the page wiring and a `showView(name)` function for the three views (`scripture`, `songs`, `style`). The Style view does not change `session.activeTab`, so Show and the preview keep following the last content tab.
- DOM contract (ids used by every later task) is the markup in Step 3; the CSS class vocabulary is the sheets in Step 2.

- [ ] **Step 1: Delete what the new markup replaces**

```bash
git rm src/css/dock.css src/dock/stream-controls.js src/dock/display-settings.js src/dock/library-ui.js src/dock/scripture-tab.js src/dock/songs-tab.js smoke/dock.spec.js smoke/parity.spec.js
```

- [ ] **Step 2: Write the design system**

`src/css/tokens.css`:

```css
:root {
  --bg: #0e1218;
  --surface: #151b24;
  --inset: #0a0e13;
  --border: #232c38;
  --border-strong: #2a3442;
  --text: #e6ebf2;
  --dim: #8793a3;
  --faint: #6f7c8d;
  --accent: #6ea8ff;
  --accent-bg: #243455;
  --accent-ink: #cfe0ff;
  --show: #35c46a;
  --show-ink: #06210f;
  --hide: #e0a93a;
  --hide-bg: #2a2415;
  --live-bg: #101a17;
  --live-border: #1f5a3b;
  --live-dot: #35c46a;
  --warn-bg: #2a2415;
  --warn-border: #5b4a1f;
  --warn-ink: #e6c76f;
  --err-bg: #2a1618;
  --err-border: #6b2a30;
  --err-ink: #f0a0a8;
  --r-control: 7px;
  --r-field: 9px;
  --r-card: 10px;
  --space-1: 4px;
  --space-2: 6px;
  --space-3: 9px;
  --space-4: 12px;
  --font: "Segoe UI", Helvetica, Arial, sans-serif;
  --fs-body: 12px;
  --fs-emph: 13px;
  --fs-label: 10px;
}
```

`src/css/base.css`:

```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: var(--fs-body)/1.4 var(--font); }
#app { padding: 0 var(--space-3) 64px; min-width: 0; }
.hidden { display: none !important; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.row { display: flex; gap: var(--space-2); align-items: center; min-width: 0; }
.row.between { justify-content: space-between; }
.row.wrap { flex-wrap: wrap; }
.row.two > * { flex: 1 1 0; min-width: 0; }
.grow { flex: 1 1 0; min-width: 0; }
.block { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.lbl { font-size: var(--fs-label); letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); font-weight: 700; }
.faint { color: var(--faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
.check { display: flex; gap: 6px; align-items: center; }

.btn { border: 1px solid transparent; border-radius: var(--r-control); background: var(--surface); padding: 8px 12px; font-weight: 600; color: var(--dim); }
.btn:hover:not(:disabled) { color: var(--text); }
.btn:disabled { opacity: 0.4; }
.btn-ghost { border-color: var(--border-strong); color: #c8d2e0; }
.btn-primary { background: var(--accent-bg); color: var(--accent-ink); border-color: #355085; }
.btn-danger { color: var(--err-ink); border-color: var(--err-border); background: transparent; }
.block-btn { width: 100%; }
.link-btn { background: none; border: none; color: var(--dim); padding: 2px 4px; text-decoration: underline; }

.status-bar { position: fixed; left: 8px; right: 8px; bottom: 8px; z-index: 30; padding: 8px 10px;
  border-radius: var(--r-field); background: var(--surface); border: 1px solid var(--border-strong); color: var(--text); }
.status-bar:empty { display: none; }
.status-bar.is-error { background: var(--err-bg); border-color: var(--err-border); color: var(--err-ink); }
.status-bar.is-success { border-color: var(--live-border); }
```

`src/css/live-bar.css`:

```css
.live-bar { position: sticky; top: 0; z-index: 20; margin: 0 calc(-1 * var(--space-3)) var(--space-3);
  padding: var(--space-3); background: var(--surface); border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: var(--space-2); }
.live-bar[data-phase="live"]   { background: var(--live-bg); border-bottom-color: var(--live-border); }
.live-bar[data-phase="hidden"] { background: var(--hide-bg); border-bottom-color: var(--warn-border); }

.live-top { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--dim); }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--faint); flex: none; }
.live-bar[data-phase="live"] .dot   { background: var(--live-dot); box-shadow: 0 0 8px var(--live-dot); }
.live-bar[data-phase="hidden"] .dot { background: var(--hide); }
.pill { background: var(--border); color: var(--dim); border-radius: 99px; padding: 1px 8px; font-weight: 700; letter-spacing: 0.04em; }
.live-bar[data-phase="live"] .pill   { background: #1b3a2a; color: #7ee0a2; }
.live-bar[data-phase="hidden"] .pill { background: var(--hide-bg); color: var(--hide); }
.what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.preview { min-height: 2.9em; min-width: 0; }
.preview-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  font-size: var(--fs-emph); line-height: 1.35; color: var(--text); overflow-wrap: anywhere; }
.preview-sub { display: block; color: var(--dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.live-btns { display: flex; gap: var(--space-2); }
.btn-step { flex: 0.7 1 0; min-height: 44px; font-size: 20px; padding: 0; }
.btn-show { flex: 1.6 1 0; min-height: 44px; background: var(--show); color: var(--show-ink); font-weight: 700; }
.btn-show:hover:not(:disabled) { color: var(--show-ink); filter: brightness(1.08); }
.btn-hide { flex: 1.3 1 0; min-height: 44px; background: var(--hide-bg); color: var(--hide); border-color: var(--warn-border); font-weight: 700; }
```

`src/css/tabs.css`:

```css
.tabs { display: flex; background: var(--surface); border-radius: var(--r-field); padding: 3px; margin-bottom: var(--space-3); }
.tab { flex: 1; background: none; border: none; padding: 8px 0; border-radius: var(--r-control); color: var(--dim); font-weight: 600; }
.tab.on { background: var(--accent-bg); color: var(--accent-ink); }
.panel { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
```
`src/css/fields.css`:

```css
.field, .area, .sel { background: var(--inset); border: 1px solid var(--border-strong); border-radius: var(--r-field);
  padding: 9px 11px; width: 100%; min-width: 0; }
.area { min-height: 84px; resize: vertical; line-height: 1.4; }
.sel { background: var(--surface); padding: 7px 9px; width: auto; flex: 1 1 0; }
.sel.compact { flex: 0 1 auto; max-width: 130px; }
.field:focus, .area:focus, .sel:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px rgba(110, 168, 255, 0.18); }
.field::placeholder, .area::placeholder { color: var(--faint); }

.smart { position: relative; }
.sugg { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 15; margin: 0; padding: 0; list-style: none;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--r-field); overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
.sugg li { padding: 8px 11px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;
  gap: 8px; cursor: pointer; color: #c8d2e0; }
.sugg li:last-child { border-bottom: none; }
.sugg li.hi, .sugg li:hover { background: #1d2a44; color: #ffffff; }
.sugg small { color: var(--dim); }

.results { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow: auto;
  border: 1px solid var(--border); border-radius: var(--r-field); }
.results li { padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer; overflow-wrap: anywhere; }
.results li:last-child { border-bottom: none; }
.results li:hover { background: var(--surface); }
.results .ref { display: block; color: var(--accent); font-weight: 700; }
.results mark { background: rgba(110, 168, 255, 0.25); color: var(--text); border-radius: 2px; }

.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips button { padding: 5px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 99px;
  color: var(--dim); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chips button:hover { color: var(--text); }
.chips button.on { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-bg); }

.seg { display: flex; background: var(--surface); border-radius: var(--r-control); padding: 3px; gap: 2px; }
.seg button { flex: 1; background: none; border: none; padding: 6px 4px; border-radius: 6px; color: var(--dim); font-weight: 600; }
.seg button.on { background: var(--accent-bg); color: var(--accent-ink); }

input[type="range"] { width: 100%; accent-color: var(--accent); }
input[type="color"] { width: 44px; height: 28px; padding: 0; border: 1px solid var(--border-strong); border-radius: 6px; background: none; }
```

`src/css/cards.css`:

```css
.song-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow: auto; }
.song-item { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 9px 10px;
  border-radius: 8px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; min-width: 0; }
.song-item:hover { border-color: var(--border-strong); }
.song-item .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-weight: 600; min-width: 0; }
.song-item .count { color: var(--dim); font-size: 11px; }
.song-item .del { background: none; border: none; color: var(--faint); }
.song-item .excerpt { grid-column: 1 / -1; color: var(--dim); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { margin-left: 6px; background: var(--hide-bg); color: var(--hide); border-radius: 4px; padding: 0 5px; font-size: 9px; letter-spacing: 0.06em; }
.song-name { font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.card { text-align: left; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--r-card);
  padding: 10px; min-height: 66px; max-height: 132px; overflow: hidden; line-height: 1.35; color: var(--text); overflow-wrap: anywhere; }
.card small { display: block; color: var(--faint); font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em; }
.card.cur { border-color: var(--show); background: var(--live-bg); }

.swatches { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.swatch { border: 2px solid var(--border); border-radius: 9px; padding: 0; overflow: hidden; background: var(--surface); color: var(--dim); text-align: center; }
.swatch.on { border-color: var(--accent); color: var(--text); }
.swatch span { display: block; padding: 4px 2px 5px; font-size: 11px; font-weight: 600; }
.art { display: block; height: 38px; position: relative; background: radial-gradient(ellipse at 30% 20%, #4a5a7a, #0a0f1c); }
.art::after { content: ""; position: absolute; left: 8%; right: 8%; bottom: 6px; height: 11px; border-radius: 5px; }
.art-frosted::after { background: rgba(14, 18, 30, 0.65); border: 1px solid rgba(255, 255, 255, 0.25); }
.art-light { background: radial-gradient(ellipse at 30% 20%, #cfd8e6, #8ea0bd); }
.art-light::after { background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(255, 255, 255, 0.9); }
.art-pure::after { left: 14%; right: 14%; bottom: 12px; height: 5px; border-radius: 3px; background: #ffffff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.8); }
.art-sacred { background: linear-gradient(135deg, #0a0a14, #3a2f12); }
.art-sacred::after { background: rgba(232, 201, 122, 0.35); border: 1px solid rgba(232, 201, 122, 0.6); }
.art-custom { background: conic-gradient(from 0deg, #a78bfa, #6ea8ff, #35c46a, #e0a93a, #a78bfa); }
.art-custom::after { display: none; }

.menu { position: relative; }
.menu-list { position: absolute; right: 0; bottom: calc(100% + 4px); min-width: 230px; max-width: 100%; z-index: 25;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--r-field); padding: 4px;
  display: flex; flex-direction: column; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
.menu-list button { background: none; border: none; text-align: left; padding: 8px 10px; border-radius: 6px; color: #c8d2e0; }
.menu-list button:hover:not(:disabled) { background: #1d2a44; color: #ffffff; }
.menu-list button:disabled { opacity: 0.4; }
.menu-list .danger { color: var(--err-ink); }
.menu-list hr { border: none; border-top: 1px solid var(--border); margin: 4px 0; width: 100%; }
.menu-note { padding: 6px 10px; color: var(--dim); font-size: 11px; }
```

`src/css/banners.css`:

```css
.banner { padding: 8px 10px; border-radius: var(--r-field); font-size: 11px; background: var(--warn-bg);
  border: 1px solid var(--warn-border); color: var(--warn-ink); }
.banner.is-lost { background: var(--err-bg); border-color: var(--err-border); color: var(--err-ink); }

.import-panel { border: 1px solid var(--border-strong); border-radius: var(--r-card); padding: 10px; display: flex;
  flex-direction: column; gap: 8px; background: var(--surface); }
.import-list { list-style: none; margin: 0; padding: 0; max-height: 200px; overflow: auto; }
.import-list li { display: flex; gap: 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--border); min-width: 0; }
.import-list li.conflict .isc-title { color: var(--hide); }
.import-list label { display: flex; flex-direction: column; min-width: 0; }
.isc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.isc-meta { color: var(--dim); font-size: 11px; }

.diag { margin-top: 6px; font-size: 11px; color: var(--dim); }
.diag ul { list-style: none; margin: 4px 0; padding: 0; max-height: 120px; overflow: auto; }
.diag li { padding: 2px 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
```
- [ ] **Step 3: Write the new dock page**

Replace `src/html/dock.html` with the following (the build copies it unchanged; the stylesheet link points at the concatenated `css/dock.css`, the script is the bundled `dock.js`). All three panels are marked up here; later tasks only bind to these ids.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stage Display</title>
  <link rel="stylesheet" href="css/dock.css">
</head>
<body>
<div id="app">

  <header id="live-bar" class="live-bar" data-phase="off">
    <div class="live-top">
      <span id="status-dot" class="dot" aria-hidden="true"></span>
      <span id="status-pill" class="pill">OFF</span>
      <span id="status-what" class="what"></span>
      <button id="btn-clear" class="link-btn" type="button" title="Take everything off screen and reset">Clear</button>
    </div>
    <div class="preview" aria-live="polite">
      <span id="preview-text" class="preview-text">Nothing loaded</span>
      <small id="preview-sub" class="preview-sub">Look up a verse or pick a slide</small>
    </div>
    <div class="live-btns">
      <button id="btn-prev" class="btn btn-step" type="button" aria-label="Previous" disabled>&lsaquo;</button>
      <button id="btn-show" class="btn btn-show" type="button" disabled>&#9654; Show</button>
      <button id="btn-hide" class="btn btn-hide" type="button" disabled>&#9632; Hide</button>
      <button id="btn-next" class="btn btn-step" type="button" aria-label="Next" disabled>&rsaquo;</button>
    </div>
  </header>

  <nav class="tabs" role="tablist" aria-label="Sections">
    <button id="tab-scripture" class="tab on" data-tab="scripture" role="tab" aria-selected="true" type="button">Scripture</button>
    <button id="tab-songs" class="tab" data-tab="songs" role="tab" aria-selected="false" type="button">Songs</button>
    <button id="tab-style" class="tab" data-tab="style" role="tab" aria-selected="false" type="button">Style</button>
  </nav>

  <section id="panel-scripture" class="panel" role="tabpanel" aria-labelledby="tab-scripture">
    <div class="smart">
      <input id="smart-input" class="field" type="text" placeholder="John 3:16, a book, or words" autocomplete="off" spellcheck="false" aria-label="Verse reference or word search">
      <ul id="smart-list" class="sugg hidden" role="listbox"></ul>
    </div>
    <ul id="search-results" class="results hidden"></ul>
    <div id="quick-books" class="chips" aria-label="Quick books"></div>
    <div class="block">
      <label class="lbl" for="verse-text">Verse text <span class="faint">(edit before it goes live)</span></label>
      <textarea id="verse-text" class="area" placeholder="Look up a reference and the text appears here"></textarea>
    </div>
    <div class="row">
      <select id="language-sel" class="sel" aria-label="Language"></select>
      <select id="translation-sel" class="sel" aria-label="Translation"></select>
    </div>
    <div class="row between wrap">
      <label class="check"><input type="checkbox" id="auto-show-cb"><span>Auto Show on lookup</span></label>
      <div class="row">
        <select id="random-scope" class="sel compact" aria-label="Random scope">
          <option value="all">Whole Bible</option>
          <option value="ot">Old Testament</option>
          <option value="nt">New Testament</option>
          <option value="gospels">Gospels</option>
          <option value="wisdom">Psalms and Proverbs</option>
        </select>
        <button id="btn-random" class="btn btn-ghost" type="button">&#127922; Random</button>
      </div>
    </div>
  </section>

  <section id="panel-songs" class="panel hidden" role="tabpanel" aria-labelledby="tab-songs">
    <div id="library-banner" class="banner hidden" role="status"></div>
    <input id="song-search" class="field" type="text" placeholder="Search songs or lyrics" autocomplete="off" spellcheck="false" aria-label="Search songs">
    <ul id="song-list" class="song-list"></ul>

    <div id="song-view" class="panel hidden">
      <div class="row between">
        <strong id="song-name" class="song-name"></strong>
        <div class="row">
          <button id="btn-all-songs" class="btn btn-ghost" type="button">All songs</button>
          <button id="btn-edit-song" class="btn btn-ghost" type="button">Edit</button>
        </div>
      </div>
      <div id="slide-cards" class="cards"></div>
    </div>

    <div id="song-editor" class="panel hidden">
      <div class="block">
        <label class="lbl" for="song-title-input">Song title</label>
        <input id="song-title-input" class="field" type="text" placeholder="e.g. Amazing Grace">
      </div>
      <div class="block">
        <div class="lbl">Slides <span class="faint">(one block of text per slide)</span></div>
        <div id="slide-list" class="chips"></div>
      </div>
      <textarea id="slide-textarea" class="area" placeholder="Type slide text here. Enter makes a new line inside the slide."></textarea>
      <div class="row">
        <button id="btn-add-slide" class="btn btn-ghost grow" type="button">Add slide</button>
        <button id="btn-update-slide" class="btn btn-ghost" type="button" disabled>Update</button>
        <button id="btn-delete-slide" class="btn btn-danger" type="button" disabled>Delete slide</button>
      </div>
      <div class="row">
        <button id="btn-save-song" class="btn btn-primary grow" type="button">Save song</button>
        <button id="btn-delete-song" class="btn btn-danger" type="button" disabled>Delete song</button>
        <button id="btn-done-edit" class="btn btn-ghost" type="button">Done</button>
      </div>
    </div>

    <div class="row">
      <button id="btn-new-song" class="btn btn-ghost" type="button">+ New</button>
      <button id="btn-import-file" class="btn btn-ghost" type="button">Import</button>
      <div class="menu grow">
        <button id="btn-tools" class="btn btn-ghost block-btn" type="button" aria-haspopup="menu" aria-expanded="false">Library tools &#9662;</button>
        <div id="tools-menu" class="menu-list hidden" role="menu">
          <div id="library-status" class="menu-note"></div>
          <button id="tool-import-folder" role="menuitem" type="button">Import a folder of songs</button>
          <button id="tool-export" role="menuitem" type="button">Export all as JSON</button>
          <button id="tool-duplicates" role="menuitem" type="button">Find duplicate songs</button>
          <button id="tool-clear-all" class="danger" role="menuitem" type="button">Clear the whole library</button>
          <hr>
          <button id="tool-choose-folder" role="menuitem" type="button">Choose library folder</button>
          <button id="tool-reconnect" class="hidden" role="menuitem" type="button">Reconnect folder</button>
          <button id="tool-rewrite-lyrics" role="menuitem" type="button" disabled>Rewrite lyrics.txt</button>
          <button id="tool-stop-folder" class="hidden" role="menuitem" type="button">Stop using the folder</button>
        </div>
      </div>
    </div>
    <input type="file" id="import-file-input" accept=".json,.txt,.csv,.tsv" multiple class="hidden">
    <input type="file" id="import-folder-input" accept=".json,.txt,.csv,.tsv" multiple webkitdirectory class="hidden">

    <div id="import-panel" class="import-panel hidden">
      <div class="row between">
        <strong id="import-panel-title">Import preview</strong>
        <button id="btn-import-close" class="link-btn" type="button" aria-label="Close">&#10005;</button>
      </div>
      <p id="import-panel-hint" class="faint"></p>
      <ul id="import-song-list" class="import-list"></ul>
      <div class="row">
        <button id="btn-import-confirm" class="btn btn-primary grow" type="button">Import selected</button>
        <button id="btn-import-cancel" class="btn btn-ghost" type="button">Cancel</button>
      </div>
    </div>
  </section>

  <section id="panel-style" class="panel hidden" role="tabpanel" aria-labelledby="tab-style">
    <div class="block">
      <div class="lbl">Theme</div>
      <div id="theme-swatches" class="swatches">
        <button type="button" class="swatch" data-value="frosted"><i class="art art-frosted"></i><span>Frosted</span></button>
        <button type="button" class="swatch" data-value="frosted-light"><i class="art art-light"></i><span>Frosted Light</span></button>
        <button type="button" class="swatch" data-value="pure"><i class="art art-pure"></i><span>Pure Type</span></button>
        <button type="button" class="swatch" data-value="sacred-light"><i class="art art-sacred"></i><span>Sacred Light</span></button>
        <button type="button" class="swatch" data-value="custom"><i class="art art-custom"></i><span>Custom</span></button>
      </div>
    </div>
    <div id="custom-colors-section" class="row two hidden">
      <label class="block"><span class="lbl">Background</span><input type="color" id="color-bg" value="#0a0a14"></label>
      <label class="block"><span class="lbl">Main text</span><input type="color" id="color-text" value="#ffffff"></label>
      <label class="block"><span class="lbl">Title / ref</span><input type="color" id="color-accent" value="#a78bfa"></label>
    </div>
    <div class="block">
      <div class="lbl">Animation</div>
      <div id="anim-seg" class="seg">
        <button type="button" data-value="rise">Soft rise</button>
        <button type="button" data-value="wipe">Wipe</button>
        <button type="button" data-value="lines">Lines</button>
        <button type="button" data-value="cut">Cut</button>
      </div>
    </div>
    <div class="row two">
      <div class="block">
        <div class="lbl">Position</div>
        <div id="position-seg" class="seg">
          <button type="button" data-value="top">Top</button>
          <button type="button" data-value="center">Mid</button>
          <button type="button" data-value="bottom">Low</button>
        </div>
      </div>
      <div class="block">
        <div class="lbl">Size</div>
        <div id="size-seg" class="seg">
          <button type="button" data-value="sm">S</button>
          <button type="button" data-value="md">M</button>
          <button type="button" data-value="lg">L</button>
          <button type="button" data-value="xl">XL</button>
        </div>
      </div>
    </div>
    <div class="row">
      <select id="font-sel" class="sel" aria-label="Font"></select>
      <button id="btn-italic" class="btn btn-ghost" type="button" aria-pressed="false" title="Italic"><i>I</i></button>
    </div>
    <div class="block">
      <div class="lbl">Background opacity <span id="opacity-value" class="faint">88%</span></div>
      <input type="range" id="opacity-slider" min="0" max="100" value="88">
    </div>
    <div class="block">
      <div class="lbl">Overlay scale <span id="scale-value" class="faint">100%</span> <span class="faint">(height only)</span></div>
      <input type="range" id="scale-slider" min="50" max="150" step="5" value="100">
    </div>
    <div class="row wrap">
      <label class="check"><input type="checkbox" id="show-card-cb" checked><span>Show card</span></label>
      <label class="check"><input type="checkbox" id="show-title-cb" checked><span>Song title</span></label>
      <label class="check"><input type="checkbox" id="show-ref-cb" checked><span>Verse reference</span></label>
    </div>
    <div class="block">
      <div class="lbl">Background image</div>
      <div class="row">
        <button id="btn-bg-image" class="btn btn-ghost" type="button">Choose image</button>
        <button id="btn-bg-clear" class="btn btn-ghost hidden" type="button">Remove</button>
        <span id="bg-image-name" class="faint">None, using the theme colour</span>
      </div>
      <input type="file" id="bg-image-input" accept="image/*" class="hidden">
    </div>
    <details id="diagnostics" class="diag">
      <summary>Diagnostics <span id="diag-count"></span></summary>
      <ul id="diag-list"></ul>
      <button id="diag-clear" class="btn btn-ghost" type="button">Clear</button>
    </details>
  </section>

  <div id="status-bar" class="status-bar" role="status"></div>
</div>

<script src="dock.js"></script>
</body>
</html>
```
- [ ] **Step 4: Concatenate the dock sheets in the build**

Create a throwaway script `tmp-patch-build.mjs` in the repo root, run it, then delete it:

```js
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'build.mjs';
let source = readFileSync(file, 'utf8');

const oldCopy = "  await cp('src/css/dock.css', `${DIST}/css/dock.css`);";
if (!source.includes(oldCopy)) throw new Error('dock.css copy line not found');
source = source.replace(oldCopy, '  await buildDockCss();');

const marker = 'export async function build() {';
const helper = [
  "const DOCK_SHEETS = ['tokens', 'base', 'live-bar', 'tabs', 'fields', 'cards', 'banners'];",
  '',
  '/** The dock sheets are small and ordered; the browser gets them as one file. */',
  'async function buildDockCss() {',
  '  const parts = [];',
  "  for (const name of DOCK_SHEETS) parts.push(await readFile(`src/css/${name}.css`, 'utf8'));",
  '  await mkdir(`${DIST}/css`, { recursive: true });',
  '  await writeFile(`${DIST}/css/dock.css`, parts.join(String.fromCharCode(10)));',
  '}',
  '',
  '',
].join(String.fromCharCode(10));
if (!source.includes(marker)) throw new Error('build() marker not found');
source = source.replace(marker, helper + marker);

writeFileSync(file, source);
console.log('build.mjs patched');
```

```bash
node tmp-patch-build.mjs && rm tmp-patch-build.mjs
```

Append to `tests/build/build.test.js`:

```js
describe('dock stylesheet', () => {
  it('concatenates the dock sheets with the design tokens first', () => {
    const css = readFileSync('dist/css/dock.css', 'utf8');
    expect(css.indexOf('--bg:')).toBeGreaterThanOrEqual(0);
    expect(css.indexOf('--bg:')).toBeLessThan(css.indexOf('.live-bar'));
    expect(css).toContain('.swatch');
    expect(css).toContain('.banner');
  });
});
```

- [ ] **Step 5: Write the status line, the live bar and the page wiring**

Replace `src/dock/status.js` with:

```js
/** The toast-style status line at the bottom of the dock. */
export function createStatus({ statusBar }) {
  function setStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className = type ? 'status-bar is-' + type : 'status-bar';
    if (msg) setTimeout(() => {
      if (statusBar.textContent === msg) { statusBar.textContent = ''; statusBar.className = 'status-bar'; }
    }, 3500);
  }
  return { setStatus };
}
```

`src/dock/live-bar.js`:

```js
import { $ } from './util.js';

const PHASE_LABEL = { off: 'OFF', live: 'LIVE', hidden: 'HIDDEN' };
const EMPTY_PREVIEW = { has: false, text: 'Nothing loaded', sub: 'Look up a verse or pick a slide', canNav: false };

/**
 * The pinned bar: status, a preview of what is loaded in the active tab, and
 * Show / Hide / Prev / Next. Also owns the global keyboard shortcuts.
 */
export function initLiveBar({ session, tabs, setStatus }) {
  const bar = $('live-bar'), pill = $('status-pill'), what = $('status-what'),
        previewText = $('preview-text'), previewSub = $('preview-sub'),
        btnPrev = $('btn-prev'), btnShow = $('btn-show'), btnHide = $('btn-hide'),
        btnNext = $('btn-next'), btnClear = $('btn-clear');

  const activeTab = () => tabs[session.activeTab] || null;

  function liveLabel() {
    if (session.phase !== 'live') return '';
    if (session.liveTab === 'scripture') return 'Verse';
    const title = tabs.songs ? tabs.songs.getContent().title : '';
    return title ? 'Song \u00b7 ' + title : 'Song';
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

  btnShow.addEventListener('click', () => {
    const tab = activeTab();
    if (!tab || !tab.preview().has) {
      setStatus(session.activeTab === 'scripture' ? 'Look up a verse first.' : 'No slide text to display.', 'error');
      return;
    }
    if (tab.markShown) tab.markShown();
    session.show();
    setStatus(session.activeTab === 'scripture' ? 'Verse is live.' : 'Slide is live.', 'success');
  });
  btnHide.addEventListener('click', () => session.hide());
  btnClear.addEventListener('click', () => {
    session.clear();
    if (tabs.songs && tabs.songs.resetPosition) tabs.songs.resetPosition();
  });
  btnPrev.addEventListener('click', () => step(-1));
  btnNext.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === 'Escape') btnHide.click();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') { e.preventDefault(); if (session.isLive) btnHide.click(); else btnShow.click(); }
  });

  return { refresh };
}
```

Replace `src/dock/main.js` with:

```js
import { $ } from './util.js';
import { createStatus } from './status.js';
import { createSession } from './session.js';
import { createDiagnostics } from './diagnostics.js';
import { createBrowserTransport } from '../transport/index.js';
import { createSettingsStore } from './settings-store.js';
import { initLiveBar } from './live-bar.js';

const diagnostics = createDiagnostics();
const report = (context) => (err) => diagnostics.log(context, err);

const EMPTY_SCRIPTURE = { body: '', reference: '' };
const EMPTY_SONG = { title: '', body: '' };
const VIEWS = ['scripture', 'songs', 'style'];

(async () => {
  try {
    const status = createStatus({ statusBar: $('status-bar') });
    const transport = createBrowserTransport('dock', report('transport'));
    const store = createSettingsStore({ storage: window.localStorage, onError: report('settings') });

    // Each tab registers itself here when it is initialised (later tasks).
    const tabs = {};
    let liveBar = null;

    const session = createSession({
      transport,
      readSettings: () => store.styleState(),
      providers: {
        scripture: () => (tabs.scripture ? tabs.scripture.getContent() : EMPTY_SCRIPTURE),
        songs: () => (tabs.songs ? tabs.songs.getContent() : EMPTY_SONG),
      },
      onChange: () => { if (liveBar) liveBar.refresh(); },
    });

    /** Which panel is showing. The Style view leaves session.activeTab alone. */
    function showView(name) {
      VIEWS.forEach((view) => {
        const on = view === name;
        $('panel-' + view).classList.toggle('hidden', !on);
        const tab = $('tab-' + view);
        tab.classList.toggle('on', on);
        tab.setAttribute('aria-selected', String(on));
      });
      if (name !== 'style') session.setTab(name);
      if (liveBar) liveBar.refresh();
    }

    liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.tab)));

    transport.start();
    showView('scripture');
  } catch (err) {
    diagnostics.log('dock init', err);
    console.error('[dock] init failed:', err);
  }
})();
```
- [ ] **Step 6: Write the shared browser helpers and the shell specs**

`smoke/helpers.js`:

```js
/** Open the overlay first, then the dock, in the same browser context (so they share storage and channels). */
export async function openPair(context) {
  const overlay = await context.newPage();
  const dock = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');
  return { dock, overlay };
}

/** Type into the smart box and press Enter. */
export async function lookup(dock, text) {
  await dock.fill('#smart-input', text);
  await dock.press('#smart-input', 'Enter');
}

/** Create a song through the editor, then leave the editor so its slide cards show. */
export async function createSong(dock, title, slides) {
  await dock.click('#tab-songs');
  await dock.click('#btn-new-song');
  await dock.fill('#song-title-input', title);
  for (const text of slides) {
    await dock.fill('#slide-textarea', text);
    await dock.click('#btn-add-slide');
  }
  await dock.click('#btn-done-edit');
}

/** Make every request to the Bible API fail, so verses must come from the bundled translations. */
export async function blockBibleApi(context) {
  await context.route('https://bolls.life/**', (route) => route.abort());
}
```

`smoke/shell.spec.js`:

```js
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('dock loads over file:// with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.resolve('dist/dock.html')).href);
  await expect(page.locator('#live-bar')).toBeVisible();
  await expect(page.locator('#status-pill')).toHaveText('OFF');
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('tabs switch panels and keep aria-selected in step', async ({ page }) => {
  await page.goto('/dock.html');
  await expect(page.locator('#panel-scripture')).toBeVisible();
  await page.click('#tab-songs');
  await expect(page.locator('#panel-songs')).toBeVisible();
  await expect(page.locator('#panel-scripture')).toBeHidden();
  await expect(page.locator('#tab-songs')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-scripture')).toHaveAttribute('aria-selected', 'false');
  await page.click('#tab-style');
  await expect(page.locator('#panel-style')).toBeVisible();
  await expect(page.locator('#panel-songs')).toBeHidden();
});

test('with nothing loaded Show and Hide are disabled and the preview says so', async ({ page }) => {
  await page.goto('/dock.html');
  await expect(page.locator('#btn-show')).toBeDisabled();
  await expect(page.locator('#btn-hide')).toBeDisabled();
  await expect(page.locator('#preview-text')).toHaveText('Nothing loaded');
});

test.describe('narrow dock (380 x 700)', () => {
  test.use({ viewport: { width: 380, height: 700 } });

  for (const tab of ['scripture', 'songs', 'style']) {
    test(`${tab}: the live bar stays pinned and nothing scrolls sideways`, async ({ page }) => {
      await page.goto('/dock.html');
      await page.click(`#tab-${tab}`);
      await expect(page.locator(`#panel-${tab}`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const box = await page.locator('#live-bar').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeLessThan(2);
      expect(box.y + box.height).toBeLessThanOrEqual(700);
    });
  }

  test('Show and Hide are large targets', async ({ page }) => {
    await page.goto('/dock.html');
    for (const id of ['#btn-show', '#btn-hide']) {
      const box = await page.locator(id).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  });
});
```

- [ ] **Step 7: Build and run**

Run: `npm run build && npx playwright test smoke/shell.spec.js smoke/overlay.spec.js && npx vitest run`
Expected: PASS: the shell specs (7 tests) and the overlay specs, and the whole unit suite including the new build test. If a narrow-dock test reports `scrollWidth` above 380, find the widest element with `document.querySelectorAll('*')` filtered on `getBoundingClientRect().right > 380` and fix its CSS (long unbroken text needs `min-width: 0` and `overflow-wrap: anywhere`).

- [ ] **Step 8: Commit**

```bash
git add -A src smoke build.mjs tests
git commit -m "feat: dock shell with design system, pinned live bar and the new three-tab markup"
```

---
### Task 7: Scripture tab (smart box, lookup, stepping, search, random)

**Files:**
- Create: `src/dock/smart-box.js`, `src/dock/scripture-tab.js`, `smoke/scripture.spec.js`
- Modify: `src/dock/main.js` (register the tab)

**Interfaces:**
- Consumes: `dropdownRows`, `classifyInput` (Task 4); `createSettingsStore` (Task 5; the tab reads and writes `language`, `translation`, `autoShow`); `initLiveBar`'s `tabs` registry and `refresh` (Task 6); `createScriptureApi` methods `fetchVerse`, `fetchVerseCount`, `searchScripture`, `randomReference` (foundation, unchanged); `stepReference`, `buildReference`, `LANGUAGES`, `TRANSLATIONS`, `BIBLE_BOOKS`; `highlightMatch` (`util.js`); helpers from `smoke/helpers.js`.
- Produces (`smart-box.js`): `initSmartBox({ onReference(text), onSearch(query), setStatus }) -> { setValue(text), focus() }`. It owns `#smart-input`, `#smart-list` and the `#quick-books` chips. Enter with a highlighted dropdown row picks that row; otherwise it follows `classifyInput`: `empty` shows `Enter a reference or some words first.`; `reference` calls `onReference`; `book` fills the box with `<Book> ` and shows `<Book> has N chapters. Type a chapter and verse.`; `search` calls `onSearch`.
- Produces (`scripture-tab.js`): `initScriptureTab({ session, scripture, store, setStatus, refresh }) -> { getContent() -> { body, reference }, preview() -> { has, text, sub, canNav }, step(dir), focus() }`, the registry entry for `tabs.scripture`. Behaviour kept from today: Auto Show sends on lookup; stepping while live (or with Auto Show) updates the screen; changing the translation re-looks-up the current verse; ranges, the 20-verse cap and all error messages come from the unchanged API.

- [ ] **Step 1: Write the failing browser tests**

`smoke/scripture.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { openPair, lookup, blockBibleApi } from './helpers.js';

test.beforeEach(async ({ context }) => { await blockBibleApi(context); });

test('an offline verse from the smart box reaches the overlay, then hides', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/For God so loved the world/);
  await expect(dock.locator('#smart-input')).toHaveValue('John 3:16');

  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved the world');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:16');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);

  await dock.click('#btn-hide');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('the live bar previews the loaded verse and enables Show', async ({ context }) => {
  const { dock } = await openPair(context);
  await expect(dock.locator('#btn-show')).toBeDisabled();
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#preview-text')).toContainText('For God so loved');
  await expect(dock.locator('#preview-sub')).toContainText('John 3:16');
  await expect(dock.locator('#btn-show')).toBeEnabled();
});

test('stepping to the next verse while live updates the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.click('#btn-show');
  await dock.click('#btn-next');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:17');
  await dock.click('#btn-prev');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:16');
});

test('a late-opened overlay restores the live verse', async ({ context }) => {
  const dock = await context.newPage();
  await dock.goto('/dock.html');
  await lookup(dock, 'Psalm 23:1');
  await expect(dock.locator('#verse-text')).toHaveValue(/shepherd/i);
  await dock.click('#btn-show');
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await expect(overlay.locator('#ov-body')).toContainText(/shepherd/i);
});

test('Space shows and hides when focus is not in a field', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.locator('#preview-text').click();
  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);
  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('editing the verse text changes what goes live', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.fill('#verse-text', 'My edited words');
  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toHaveText('My edited words');
});

test('Auto Show sends the verse as soon as it is looked up', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await dock.check('#auto-show-cb');
  await lookup(dock, 'John 3:16');
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved the world');
});

test('Random fills the verse text from the bundled Bible', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#btn-random');
  await expect(dock.locator('#verse-text')).toHaveValue(/.+/);
  await expect(dock.locator('#preview-sub')).toContainText('KJV');
});

test('translation and Auto Show survive a reload', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.selectOption('#translation-sel', 'WEB');
  await dock.check('#auto-show-cb');
  await dock.reload();
  await expect(dock.locator('#translation-sel')).toHaveValue('WEB');
  await expect(dock.locator('#auto-show-cb')).toBeChecked();
});
```
Append to `smoke/scripture.spec.js` (the smart box, search and odd-input cases):

```js
test('typing a book shows suggestions and picking one asks for a chapter', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.fill('#smart-input', 'joh');
  await expect(dock.locator('#smart-list li')).toHaveCount(1);
  await expect(dock.locator('#smart-list li').first()).toContainText('John');
  await dock.locator('#smart-list li').first().click();
  await expect(dock.locator('#smart-input')).toHaveValue('John ');
  await expect(dock.locator('#status-bar')).toContainText('John has 21 chapters');
});

test('Enter on a bare book name selects the book', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.fill('#smart-input', 'john');
  await dock.press('#smart-input', 'Enter');
  await expect(dock.locator('#smart-input')).toHaveValue('John ');
});

test('arrow keys and Enter pick a suggestion', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.fill('#smart-input', 'jo');
  await expect(dock.locator('#smart-list')).toBeVisible();
  await dock.press('#smart-input', 'ArrowDown');
  await dock.press('#smart-input', 'Enter');
  await expect(dock.locator('#smart-input')).toHaveValue(/^[A-Za-z0-9 ]+ $/);
});

test('Escape closes the dropdown without clearing the box', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.fill('#smart-input', 'joh');
  await expect(dock.locator('#smart-list')).toBeVisible();
  await dock.press('#smart-input', 'Escape');
  await expect(dock.locator('#smart-list')).toBeHidden();
  await expect(dock.locator('#smart-input')).toHaveValue('joh');
});

test('quick-book chips fill the box', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.locator('#quick-books button', { hasText: 'Romans' }).click();
  await expect(dock.locator('#smart-input')).toHaveValue('Romans ');
});

test('a blank Enter says what to type', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.press('#smart-input', 'Enter');
  await expect(dock.locator('#status-bar')).toContainText('Enter a reference or some words first.');
});

test('a word search lists matches and clicking one looks the verse up', async ({ context }) => {
  await context.route('https://bolls.life/search/NIV/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ book: 43, chapter: 3, verse: 16, text: 'For God so loved the world' }]),
  }));
  await context.route('https://bolls.life/get-verse/NIV/43/3/16/', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ text: 'Mocked verse text' }),
  }));
  const { dock } = await openPair(context);
  await dock.selectOption('#translation-sel', 'NIV');
  await lookup(dock, 'loved the world');
  await expect(dock.locator('#search-results li')).toHaveCount(1);
  await expect(dock.locator('#search-results li')).toContainText('John 3:16');
  await dock.locator('#search-results li').click();
  await expect(dock.locator('#verse-text')).toHaveValue('Mocked verse text');
  await expect(dock.locator('#smart-input')).toHaveValue('John 3:16');
  await expect(dock.locator('#search-results')).toBeHidden();
});

test('odd input never breaks the box', async ({ context }) => {
  const { dock } = await openPair(context);
  const errors = [];
  dock.on('pageerror', (e) => errors.push(e.message));
  for (const text of ['316', 'john  3 :16', '1 John', 'x'.repeat(2000), 'Hezekiah 1:1', '   ', 'John 3:99']) {
    await lookup(dock, text);
    await expect(dock.locator('#smart-input')).toBeEnabled();
  }
  await lookup(dock, 'john  3 :16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npx playwright test smoke/scripture.spec.js`
Expected: FAIL (nothing is wired to the Scripture panel yet: `#smart-input` does nothing).

- [ ] **Step 3: Implement the smart box**

`src/dock/smart-box.js`:

```js
import { $ } from './util.js';
import { BIBLE_BOOKS } from '../scripture/books.js';
import { classifyInput, dropdownRows } from '../scripture/smart-input.js';

const QUICK_BOOKS = ['John', 'Romans', 'Psalms', 'Matthew', 'Genesis', 'Proverbs', 'Isaiah', 'Hebrews', 'Acts', 'Revelation'];
const BLUR_CLOSE_MS = 120;

/**
 * The one box for a reference, a book name or a word search, with its dropdown
 * and the quick-book chips. It only decides and reports: onReference(text) and
 * onSearch(query) do the actual lookups.
 */
export function initSmartBox({ onReference, onSearch, setStatus }) {
  const input = $('smart-input'), list = $('smart-list'), chips = $('quick-books');
  let rows = [];
  let highlight = -1;

  function close() {
    list.classList.add('hidden');
    list.replaceChildren();
    rows = [];
    highlight = -1;
  }

  function paintHighlight() {
    [...list.children].forEach((li, i) => li.classList.toggle('hi', i === highlight));
  }

  function setBook(name) {
    input.value = name + ' ';
    input.focus();
    render();
    const book = BIBLE_BOOKS.find((b) => b[0] === name);
    if (book) setStatus(book[0] + ' has ' + book[2] + ' chapters. Type a chapter and verse.', '');
  }

  function pick(row) {
    if (row.type === 'book') { setBook(row.name); return; }
    close();
    onSearch(row.query);
  }

  function render() {
    rows = dropdownRows(input.value);
    highlight = -1;
    if (!rows.length) { close(); return; }
    list.replaceChildren(...rows.map((row) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      if (row.type === 'book') {
        li.textContent = row.name;
        const book = BIBLE_BOOKS.find((b) => b[0] === row.name);
        const small = document.createElement('small');
        small.textContent = (book ? book[2] : '') + ' chapters';
        li.appendChild(small);
      } else {
        li.textContent = 'Search verses for "' + row.query + '"';
      }
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(row); });   // mousedown beats blur
      return li;
    }));
    list.classList.remove('hidden');
  }

  function submit() {
    const result = classifyInput(input.value);
    if (result.kind === 'empty') { setStatus('Enter a reference or some words first.', 'error'); return; }
    if (result.kind === 'reference') { close(); onReference(result.reference); return; }
    if (result.kind === 'book') { setBook(BIBLE_BOOKS[result.bookIndex][0]); return; }
    close();
    onSearch(result.query);
  }

  function move(dir) {
    if (!rows.length) return;
    highlight = highlight === -1
      ? (dir > 0 ? 0 : rows.length - 1)
      : (highlight + dir + rows.length) % rows.length;
    paintHighlight();
  }

  input.addEventListener('input', render);
  input.addEventListener('blur', () => setTimeout(close, BLUR_CLOSE_MS));
  input.addEventListener('keydown', (e) => {
    const open = !list.classList.contains('hidden');
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlight >= 0) pick(rows[highlight]); else submit();
    }
  });

  QUICK_BOOKS.forEach((name) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = name;
    chip.addEventListener('click', () => setBook(name));
    chips.appendChild(chip);
  });

  return {
    setValue(text) { input.value = text; close(); },
    focus() { input.focus(); },
  };
}
```
- [ ] **Step 4: Implement the Scripture tab**

`src/dock/scripture-tab.js`:

```js
import { $, highlightMatch } from './util.js';
import { LANGUAGES, TRANSLATIONS } from '../scripture/translations.js';
import { buildReference, stepReference } from '../scripture/reference.js';
import { initSmartBox } from './smart-box.js';

export function initScriptureTab({ session, scripture, store, setStatus, refresh }) {
  const verseText = $('verse-text'), languageSel = $('language-sel'), translationSel = $('translation-sel'),
        autoShowCb = $('auto-show-cb'), randomScope = $('random-scope'), btnRandom = $('btn-random'),
        results = $('search-results');

  let plainRef = '';   // "John 3:16", used for stepping
  let refLabel = '';   // "John 3:16 - KJV", what goes on screen
  let busy = false;

  const translation = () => translationSel.value || 'KJV';

  function fillLanguages() {
    LANGUAGES.forEach((lang) => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang;
      languageSel.appendChild(option);
    });
  }

  function fillTranslations(keepKey) {
    translationSel.replaceChildren(...TRANSLATIONS.filter((t) => t.lang === languageSel.value).map((t) => {
      const option = document.createElement('option');
      option.value = t.key;
      option.textContent = t.key + ' - ' + t.label;
      return option;
    }));
    if (keepKey && [...translationSel.options].some((o) => o.value === keepKey)) translationSel.value = keepKey;
  }

  function hideResults() {
    results.classList.add('hidden');
    results.replaceChildren();
  }

  function apply(result) {
    verseText.value = result.text;
    plainRef = result.rawRef;
    refLabel = result.reference;
    smart.setValue(result.rawRef);
    hideResults();
    refresh();
    setStatus(result.reference, 'success');
  }

  async function lookup(reference) {
    if (busy) return;
    busy = true;
    setStatus('Looking up ' + reference + '...', 'loading');
    const result = await scripture.fetchVerse(reference, translation());
    busy = false;
    if (result.error) { setStatus(result.error, 'error'); return; }
    apply(result);
    if (autoShowCb.checked) session.show();
  }

  async function step(dir) {
    if (!plainRef || busy) return;
    busy = true;
    setStatus(dir > 0 ? 'Next verse...' : 'Previous verse...', 'loading');
    const next = await stepReference(plainRef, dir,
      (bookId, chapter) => scripture.fetchVerseCount(translation(), bookId, chapter));
    if (!next) { busy = false; setStatus('That is the end of the Bible.', ''); return; }
    const result = await scripture.fetchVerse(next, translation());
    busy = false;
    if (result.error) { setStatus(result.error, 'error'); return; }
    apply(result);
    if (session.isLive || autoShowCb.checked) session.show();
  }

  async function runSearch(query) {
    setStatus('Searching ' + translation() + '...', 'loading');
    const found = await scripture.searchScripture(translation(), query);
    if (found.error) { hideResults(); setStatus(found.error, 'error'); return; }
    if (!found.length) { hideResults(); setStatus('No results for "' + query + '".', ''); return; }
    results.replaceChildren(...found.map((r) => {
      const ref = buildReference(r.book, r.chapter, r.verse);
      const li = document.createElement('li');
      const refEl = document.createElement('span');
      refEl.className = 'ref';
      refEl.textContent = ref;
      const textEl = document.createElement('span');
      textEl.innerHTML = highlightMatch(r.text, query);
      li.append(refEl, textEl);
      li.addEventListener('click', () => { lookup(ref); });
      return li;
    }));
    results.classList.remove('hidden');
    setStatus(found.length + ' result' + (found.length === 1 ? '' : 's') + '.', 'success');
  }

  const smart = initSmartBox({ onReference: lookup, onSearch: runSearch, setStatus });

  const saved = store.get();
  fillLanguages();
  languageSel.value = LANGUAGES.includes(saved.language) ? saved.language : 'English';
  fillTranslations(saved.translation || 'KJV');
  autoShowCb.checked = !!saved.autoShow;

  languageSel.addEventListener('change', () => {
    fillTranslations();
    store.update({ language: languageSel.value, translation: translation() });
  });
  translationSel.addEventListener('change', () => {
    store.update({ translation: translation() });
    if (plainRef) lookup(plainRef);
  });
  autoShowCb.addEventListener('change', () => store.update({ autoShow: autoShowCb.checked }));
  verseText.addEventListener('input', refresh);
  btnRandom.addEventListener('click', async () => {
    setStatus('Picking a verse...', 'loading');
    const picked = await scripture.randomReference(translation(), randomScope.value);
    if (picked.error) { setStatus(picked.error, 'error'); return; }
    await lookup(picked.reference);
  });

  return {
    getContent: () => ({ body: verseText.value.trim(), reference: refLabel }),
    preview() {
      const body = verseText.value.trim();
      return {
        has: body.length > 0,
        text: body || 'Nothing loaded',
        sub: body ? (refLabel || 'Edited text') : 'Look up a verse to preview',
        canNav: !!plainRef,
      };
    },
    step,
    focus: () => smart.focus(),
  };
}
```

- [ ] **Step 5: Register the tab in `src/dock/main.js`**

Add these imports below the existing `initLiveBar` import:

```js
import { createScriptureApi } from '../scripture/api.js';
import { createOfflineProvider } from '../scripture/offline.js';
import { openKv, idbCache } from '../core/idb.js';
import { initScriptureTab } from './scripture-tab.js';
```

Add this directly after the line `liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });`:

```js
    const scripture = createScriptureApi({
      cache: idbCache(openKv('obs-stage-cache'), report('cache')),
      offline: createOfflineProvider(),
    });
    tabs.scripture = initScriptureTab({
      session, scripture, store, setStatus: status.setStatus, refresh: () => liveBar.refresh(),
    });
```

- [ ] **Step 6: Build and run to verify pass**

Run: `npm run build && npx playwright test smoke/scripture.spec.js smoke/shell.spec.js smoke/overlay.spec.js && npx vitest run`
Expected: PASS. If the "odd input" test fails on `2000` characters, check that a long query only reaches the search path and that `highlightMatch` is not called with an empty result list.

- [ ] **Step 7: Commit**

```bash
git add src/dock smoke
git commit -m "feat: scripture tab with the smart box, search, stepping and random"
```

---
### Task 8: Songs tab (universal search, slide cards, Edit drawer, Library tools, import)

**Files:**
- Create: `src/dock/import-panel.js`, `src/dock/library-tools.js`, `src/dock/songs-tab.js`, `smoke/songs.spec.js`
- Modify: `src/dock/main.js` (register the tab, banner and tools)

**Interfaces:**
- Consumes: `searchSongs`, `tokenize`, `markTokens` (Task 5); `findDuplicateGroups`, `pickRemovals`, `normalizeTitle`, `parseSongFile`, `createSongFolder`, `ensurePermission`, `saveHandle`, `loadHandle`, `createLibrary`, `createLocalSongStore` (foundation, unchanged); the `tabs` registry and `refresh` (Task 6); helpers in `smoke/helpers.js`.
- Produces (`import-panel.js`): `initImportPanel({ library, setStatus, report, onImported }) -> { close() }`. It binds `#btn-import-file`, `#tool-import-folder`, both file inputs and the `#import-panel` preview (list with checkboxes, `Import selected`, `Cancel`). A file that cannot be read is reported as `Could not read <name>.` after the preview, or instead of it when nothing parsed.
- Produces (`library-tools.js`): `initLibraryTools({ library, kv, setStatus, report, onChanged }) -> { restore(), render() }`. It owns the `#btn-tools` menu (opens on click; closes on item click, outside click or Escape), the banner `#library-banner` (`this browser only` text in local mode, `Lost access` in folder-lost mode, hidden in folder mode), the folder items (choose or change, reconnect, rewrite lyrics.txt, stop using), and the bulk actions (export JSON, find duplicates, clear library) with the same confirmations as today.
- Produces (`songs-tab.js`): `initSongsTab({ session, library, setStatus, refresh }) -> { getContent() -> { title, body }, preview() -> { has, text, sub, canNav }, step(dir), markShown(), resetPosition(), refreshList() }`, the registry entry for `tabs.songs`.
  - View rules: while no song is open, or the search box is focused or has text, or `All songs` was pressed, the ranked list shows; otherwise the open song shows its slide cards. Clicking a card makes it the current slide and puts it on screen. `Edit` and `+ New` swap the cards for the editor until `Done`.
  - `step(dir)` is the old slide navigation: with nothing shown yet, forward starts at slide 1 and back at the last slide; it clamps at the ends and shows the slide.
  - `refreshList()` re-renders the list and drops the open song if it no longer exists (after bulk actions or a library change).

- [ ] **Step 1: Write the failing browser tests**

`smoke/songs.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { openPair, createSong, blockBibleApi } from './helpers.js';

test.beforeEach(async ({ context }) => { await blockBibleApi(context); });

test('a song created in the dock goes live when its slide card is clicked', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Test Song', ['Line one\nLine two']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-title')).toHaveText('Test Song');
  await expect(overlay.locator('#ov-body')).toContainText('Line two');
  await expect(dock.locator('#status-pill')).toHaveText('LIVE');
  await expect(dock.locator('#status-what')).toContainText('Test Song');
});

test('arrow keys step through slides live and Space hides', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Parity Song', ['First slide', 'Second slide']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.locator('#song-name').click();
  await dock.keyboard.press('ArrowRight');
  await expect(overlay.locator('#ov-body')).toHaveText('Second slide');
  await dock.keyboard.press('ArrowRight');
  await expect(overlay.locator('#ov-body')).toHaveText('Second slide');
  await dock.keyboard.press('ArrowLeft');
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('songs survive a reload of the dock', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Parity Song', ['First slide']);
  await dock.reload();
  await dock.click('#tab-songs');
  await expect(dock.locator('#song-list')).toContainText('Parity Song');
});

test('the Edit drawer updates and deletes slides', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Edit Me', ['First', 'Second']);
  await dock.click('#btn-edit-song');
  await dock.locator('.slide-chip').first().click();
  await dock.fill('#slide-textarea', 'First changed');
  await dock.click('#btn-update-slide');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('.card').first()).toContainText('First changed');

  await dock.click('#btn-edit-song');
  await dock.locator('.slide-chip').first().click();
  await dock.click('#btn-delete-slide');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('.card')).toHaveCount(1);
  await expect(dock.locator('.card').first()).toContainText('Second');
});

test('one search box finds songs by title, a lyric fragment or loose words', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Amazing Grace', ['Amazing grace how sweet the sound', 'That saved a wretch like me']);
  await createSong(dock, 'How Great Thou Art', ['Then sings my soul my Saviour God to Thee']);
  await createSong(dock, 'Know', ["I don't know why"]);
  const items = dock.locator('#song-list .song-item');

  await dock.fill('#song-search', 'amazing');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Amazing Grace');

  await dock.fill('#song-search', 'wretch');
  await expect(items).toHaveCount(1);
  await expect(items.first().locator('.excerpt')).toContainText('wretch');
  await expect(items.first().locator('.excerpt mark')).toHaveText('wretch');

  await dock.fill('#song-search', 'saviour sings soul');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('How Great Thou Art');

  await dock.fill('#song-search', 'grace wretch');
  await expect(items.first()).toContainText('Amazing Grace');

  await dock.fill('#song-search', 'dont know');
  await expect(items.first()).toContainText('Know');

  await dock.fill('#song-search', 'zebra');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('No songs match');
});

test('title matches rank above lyric matches', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Zzz Lullaby', ['grace abounds here']);
  await createSong(dock, 'Grace Alone', ['nothing relevant']);
  await dock.fill('#song-search', 'grace');
  const items = dock.locator('#song-list .song-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Grace Alone');
  await expect(items.nth(1)).toContainText('Zzz Lullaby');
});

test('picking a search result opens the song and hostile titles stay inert', async ({ context }) => {
  const { dock } = await openPair(context);
  const errors = [];
  dock.on('pageerror', (e) => errors.push(e.message));
  await createSong(dock, '<img src=x onerror=alert(1)> Song', ['safe text']);
  await dock.fill('#song-search', 'song');
  await expect(dock.locator('#song-list img')).toHaveCount(0);
  await dock.locator('#song-list .song-item').first().click();
  await expect(dock.locator('#slide-cards .card')).toHaveCount(1);
  expect(errors).toEqual([]);
});
```
Append to `smoke/songs.spec.js` (library, banner, import and narrow-dock cases):

```js
test('without a folder the Songs tab warns that songs are browser-only', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await expect(page.locator('#library-banner')).toBeVisible();
  await expect(page.locator('#library-banner')).toContainText('this browser only');
});

test('Library tools opens from its button and closes on outside click and Escape', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.click('#btn-tools');
  await expect(page.locator('#tools-menu')).toBeVisible();
  await expect(page.locator('#btn-tools')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#song-search').click();
  await expect(page.locator('#tools-menu')).toBeHidden();
  await page.click('#btn-tools');
  await expect(page.locator('#tools-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tools-menu')).toBeHidden();
});

test('choosing a folder writes song JSON and lyrics.txt', async ({ page }) => {
  await page.addInitScript(() => {
    // A real directory handle without a native picker: the origin-private file system.
    window.showDirectoryPicker = async () => navigator.storage.getDirectory();
  });
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.click('#btn-tools');
  await page.click('#tool-choose-folder');
  await expect(page.locator('#library-banner')).toBeHidden();

  await createSong(page, 'Folder Song', ['La la la']);
  await expect.poll(async () => page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const names = [];
    for await (const [name] of dir.entries()) names.push(name);
    return names.sort().join(',');
  })).toContain('Folder_Song.json');

  const written = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const out = {};
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') out[name] = await (await handle.getFile()).text();
    }
    return out;
  });
  expect(JSON.parse(written['Folder_Song.json']).slides).toEqual(['La la la']);
  expect(written['lyrics.txt']).toContain('Folder Song');
  expect(written['lyrics.txt']).toContain('La la la');
});

test('a bad import file is reported instead of failing silently', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.setInputFiles('#import-file-input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.locator('#status-bar')).toContainText('Could not read bad.json');
});

test('importing a lyrics file shows a preview and adds the songs', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  const text = '#OBS-LYRICS-V1\n\nFirst Hymn\n\nLine a\n\n==========\n\nSecond Hymn\n\nLine b\n';
  await page.setInputFiles('#import-file-input', { name: 'lyrics.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.locator('#import-panel')).toBeVisible();
  await expect(page.locator('#import-song-list li')).toHaveCount(2);
  await page.click('#btn-import-confirm');
  await expect(page.locator('#import-panel')).toBeHidden();
  await expect(page.locator('#status-bar')).toContainText('2 added');
  await page.fill('#song-search', 'hymn');
  await expect(page.locator('#song-list .song-item')).toHaveCount(2);
});

test('find duplicates keeps the fullest copy after confirming', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Dup', ['one']);
  await createSong(dock, 'Dup', ['one', 'two']);
  dock.once('dialog', (dialog) => dialog.accept());
  await dock.click('#btn-tools');
  await dock.click('#tool-duplicates');
  await expect(dock.locator('#status-bar')).toContainText('Removed 1 duplicate song.');
  await dock.fill('#song-search', 'dup');
  await expect(dock.locator('#song-list .song-item')).toHaveCount(1);
  await expect(dock.locator('#song-list .song-item .count')).toHaveText('2 slides');
});

test.describe('narrow dock with real-world content', () => {
  test.use({ viewport: { width: 380, height: 700 } });

  test('long titles, a 500-character slide and 30 songs never scroll sideways', async ({ page }) => {
    const songs = Array.from({ length: 30 }, (_, i) => ({
      id: 's' + i, altTitle: null,
      title: 'Song number ' + i + ' ' + 'with a very long title '.repeat(4),
      slides: ['Slide text ' + 'long '.repeat(100), 'Second slide'],
    }));
    await page.addInitScript((data) => {
      if (!localStorage.getItem('obs-stage-songs')) localStorage.setItem('obs-stage-songs', JSON.stringify(data));
    }, songs);
    await page.goto('/dock.html');
    await page.click('#tab-songs');
    await expect(page.locator('#song-list .song-item')).toHaveCount(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);

    await page.locator('#song-list .song-item').first().click();
    await expect(page.locator('#slide-cards .card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await page.locator('#live-bar').boundingBox();
    expect(box.y).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npx playwright test smoke/songs.spec.js`
Expected: FAIL (nothing is wired to the Songs panel yet).

- [ ] **Step 3: Implement the import panel**

`src/dock/import-panel.js`:

```js
import { $ } from './util.js';
import { normalizeTitle } from '../songs/model.js';
import { parseSongFile } from '../songs/parse.js';

const SONG_FILE = /[.](txt|json|csv|tsv)$/i;

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsText(file);
  });
}

/** Import preview: choose which songs from a file or folder to add or update. */
export function initImportPanel({ library, setStatus, report, onImported }) {
  const panel = $('import-panel'), title = $('import-panel-title'), hint = $('import-panel-hint'),
        listEl = $('import-song-list'), fileInput = $('import-file-input'), folderInput = $('import-folder-input');
  let pending = [];

  function close() {
    panel.classList.add('hidden');
    listEl.replaceChildren();
    pending = [];
    fileInput.value = '';
    folderInput.value = '';
  }

  function showPreview(incoming, sourceLabel) {
    if (!incoming.length) { setStatus('No songs found in those files.', 'error'); return; }
    const existing = new Set(library.list().map((s) => normalizeTitle(s.title)));
    pending = incoming.map((song) => {
      const exists = existing.has(normalizeTitle(song.title));
      return { ...song, exists, selected: !exists };
    });
    const newCount = pending.filter((s) => !s.exists).length;
    title.textContent = 'Import preview - ' + sourceLabel;
    hint.textContent = pending.length + ' found, ' + newCount + ' new, ' + (pending.length - newCount) + ' already exist';
    listEl.replaceChildren(...pending.map((song, idx) => {
      const li = document.createElement('li');
      li.className = song.exists ? 'conflict' : '';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'isc-' + idx;
      box.checked = song.selected;
      box.addEventListener('change', () => {
        pending = pending.map((s, i) => (i === idx ? { ...s, selected: box.checked } : s));
      });
      const label = document.createElement('label');
      label.htmlFor = box.id;
      const name = document.createElement('span');
      name.className = 'isc-title';
      name.textContent = song.title;
      const meta = document.createElement('span');
      meta.className = 'isc-meta';
      meta.textContent = song.slides.length + ' slides' + (song.exists ? ' - already exists' : '');
      label.append(name, meta);
      li.append(box, label);
      return li;
    }));
    panel.classList.remove('hidden');
  }

  async function processFiles(files, sourceLabel) {
    const all = [];
    const failed = [];
    for (const file of files) {
      try {
        all.push(...parseSongFile(file.name, await readFileAsText(file)));
      } catch (err) {
        report(err);
        failed.push(file.name);
      }
    }
    const failedMessage = 'Could not read ' + failed.join(', ') + '.';
    if (all.length === 0 && failed.length) { setStatus(failedMessage, 'error'); return; }
    showPreview(all, sourceLabel);
    if (failed.length) setStatus(failedMessage, 'error');
  }

  async function confirmImport() {
    const chosen = pending.filter((s) => s.selected);
    if (!chosen.length) { setStatus('No songs selected.', 'error'); return; }
    const { added, replaced } = await library.upsertByTitle(
      chosen.map(({ title: t, altTitle, slides }) => ({ title: t, altTitle, slides })));
    close();
    onImported();
    const parts = [];
    if (added) parts.push(added + ' added');
    if (replaced) parts.push(replaced + ' updated');
    setStatus(parts.join(', ') + '.', 'success');
  }

  $('btn-import-file').addEventListener('click', () => fileInput.click());
  $('tool-import-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length) await processFiles(files, files.length === 1 ? files[0].name : files.length + ' files');
  });
  folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter((f) => SONG_FILE.test(f.name));
    if (!files.length) { setStatus('No compatible files in that folder.', 'error'); return; }
    const folderName = files[0].webkitRelativePath.split('/')[0] || 'folder';
    await processFiles(files, folderName + ' (' + files.length + ' files)');
  });
  $('btn-import-confirm').addEventListener('click', confirmImport);
  $('btn-import-cancel').addEventListener('click', close);
  $('btn-import-close').addEventListener('click', close);

  return { close };
}
```
- [ ] **Step 4: Implement Library tools (menu, banner, folder, bulk actions)**

`src/dock/library-tools.js`:

```js
import { $ } from './util.js';
import { createSongFolder, ensurePermission, saveHandle, loadHandle } from '../songs/folder.js';
import { findDuplicateGroups, pickRemovals } from '../songs/duplicates.js';

const PICKER_ID = 'obs-songs';

export function initLibraryTools({ library, kv, setStatus, report, onChanged }) {
  const banner = $('library-banner'), btnTools = $('btn-tools'), menu = $('tools-menu'),
        statusLine = $('library-status'), toolChoose = $('tool-choose-folder'),
        toolReconnect = $('tool-reconnect'), toolRewrite = $('tool-rewrite-lyrics'), toolStop = $('tool-stop-folder');
  let pendingHandle = null;   // the stored folder, kept so Reconnect can ask for permission again

  function setMenu(open) {
    menu.classList.toggle('hidden', !open);
    btnTools.setAttribute('aria-expanded', String(open));
  }

  function render() {
    const mode = library.mode();
    banner.classList.toggle('hidden', mode === 'folder');
    banner.classList.toggle('is-lost', mode === 'folder-lost');
    banner.textContent = mode === 'folder-lost'
      ? 'Lost access to the song folder. Songs are safe in this browser. Open Library tools and choose Reconnect.'
      : 'Songs are saved in this browser only. Open Library tools and choose a library folder to keep them as files and a lyrics.txt.';
    statusLine.textContent = mode === 'folder'
      ? 'Folder: ' + (pendingHandle ? pendingHandle.name : 'connected')
      : mode === 'folder-lost' ? 'Folder not connected' : 'Songs stored in this browser only';
    toolReconnect.classList.toggle('hidden', mode !== 'folder-lost');
    toolStop.classList.toggle('hidden', mode !== 'folder');
    toolRewrite.disabled = mode !== 'folder';
    toolChoose.textContent = mode === 'folder' ? 'Change library folder' : 'Choose library folder';
    onChanged();
  }

  async function attach(handle, successMessage) {
    const result = await library.attachFolder(createSongFolder(handle));
    pendingHandle = handle;
    await saveHandle(kv, handle);
    result.errors.forEach((e) => report(new Error(e.file + ': ' + e.message)));
    const skipped = result.errors.length ? ' ' + result.errors.length + ' file(s) were skipped (see Diagnostics).' : '';
    setStatus(successMessage + ' ' + result.loaded + ' song(s) loaded, ' + result.carried + ' added.' + skipped, 'success');
    render();
  }

  async function chooseFolder() {
    if (!window.showDirectoryPicker) { setStatus('This browser cannot pick folders.', 'error'); return; }
    try {
      const handle = await window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' });
      await attach(handle, 'Song folder: ' + handle.name + '.');
    } catch (err) {
      if (err.name !== 'AbortError') { report(err); setStatus('Could not open that folder.', 'error'); }
    }
  }

  async function reconnect() {
    try {
      if (pendingHandle && await ensurePermission(pendingHandle, { request: true })) await attach(pendingHandle, 'Reconnected.');
      else await chooseFolder();
    } catch (err) { report(err); setStatus('Could not reconnect to the folder.', 'error'); }
  }

  function exportSongs() {
    const songs = library.list();
    if (!songs.length) { setStatus('No songs to export.', 'error'); return; }
    const blob = new Blob([JSON.stringify({ version: 1, songs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stage-songs-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Exported ' + songs.length + ' songs.', 'success');
  }

  async function removeDuplicates() {
    const groups = findDuplicateGroups(library.list());
    if (!groups.length) { setStatus('No duplicate songs found.', ''); return; }
    const extra = groups.reduce((n, g) => n + (g.length - 1), 0);
    if (!confirm('Found ' + groups.length + ' title' + (groups.length !== 1 ? 's' : '') +
      ' with duplicates (' + extra + ' extra cop' + (extra !== 1 ? 'ies' : 'y') + ').\n\n' +
      'For each, the version with the most slides will be kept and the rest deleted. This cannot be undone.')) return;
    const ids = pickRemovals(groups);
    await library.removeMany([...ids]);
    onChanged();
    setStatus('Removed ' + ids.size + ' duplicate song' + (ids.size !== 1 ? 's' : '') + '.', 'success');
  }

  async function clearLibrary() {
    const count = library.list().length;
    if (!count) { setStatus('Library is already empty.', ''); return; }
    const inFolder = library.mode() === 'folder';
    if (!confirm('Delete ALL ' + count + ' song' + (count !== 1 ? 's' : '') + ' from the library?\n\n' +
      (inFolder ? 'Their files in the library folder will be deleted too. ' : '') +
      'This cannot be undone. If you have not backed up, click Cancel, use Export all as JSON first, then come back.')) return;
    if (prompt('To confirm, type DELETE below:') !== 'DELETE') {
      setStatus('Clear cancelled. Nothing was deleted.', '');
      return;
    }
    await library.clearAll();
    onChanged();
    setStatus('Library cleared. Import your songs again to bring them back.', 'success');
  }

  async function restore() {
    render();
    try {
      const handle = await loadHandle(kv);
      if (!handle) return;
      pendingHandle = handle;
      if (await ensurePermission(handle)) await attach(handle, 'Song folder restored.');
      else { library.markLost(); render(); }
    } catch (err) {
      report(err);
      library.markLost();
      render();
    }
  }

  btnTools.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.classList.contains('hidden')); });
  menu.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== btnTools) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  toolChoose.addEventListener('click', chooseFolder);
  toolReconnect.addEventListener('click', reconnect);
  toolRewrite.addEventListener('click', async () => {
    await library.rewriteLyrics();
    const ok = library.mode() === 'folder';
    setStatus(ok ? 'lyrics.txt rewritten.' : 'Folder not connected.', ok ? 'success' : 'error');
    render();
  });
  toolStop.addEventListener('click', () => {
    library.detach();
    pendingHandle = null;
    setStatus('No longer using the folder. Songs stay in this browser.', '');
    render();
  });
  $('tool-export').addEventListener('click', exportSongs);
  $('tool-duplicates').addEventListener('click', removeDuplicates);
  $('tool-clear-all').addEventListener('click', clearLibrary);

  return { restore, render };
}
```
- [ ] **Step 5: Implement the Songs tab**

`src/dock/songs-tab.js` (part 1 of 2: state, list, cards):

```js
import { $ } from './util.js';
import { searchSongs, tokenize, markTokens } from '../songs/search.js';
import { findDuplicateGroups } from '../songs/duplicates.js';

export function initSongsTab({ session, library, setStatus, refresh }) {
  const search = $('song-search'), listEl = $('song-list'), view = $('song-view'), nameEl = $('song-name'),
        btnAll = $('btn-all-songs'), btnEdit = $('btn-edit-song'), cardsEl = $('slide-cards'),
        editor = $('song-editor'), titleInput = $('song-title-input'), slideList = $('slide-list'),
        slideText = $('slide-textarea'), btnAdd = $('btn-add-slide'), btnUpdate = $('btn-update-slide'),
        btnDelSlide = $('btn-delete-slide'), btnSave = $('btn-save-song'), btnDelete = $('btn-delete-song'),
        btnDone = $('btn-done-edit'), btnNew = $('btn-new-song');

  let activeSongId = null;
  let activeSlideIdx = null;   // the selected slide
  let shownIdx = -1;           // the slide last put on screen, -1 when none
  let editing = false;
  let listOpen = true;

  const getSong = () => library.get(activeSongId);

  function slideLines() {
    const song = getSong();
    if (song && activeSlideIdx !== null) return song.slides[activeSlideIdx] || '';
    return editing ? slideText.value.trim() : '';
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
      const li = document.createElement('li');
      li.className = 'song-item';
      li.textContent = query.trim() ? 'No songs match "' + query.trim() + '"' : 'No songs yet. Use + New or Import.';
      listEl.replaceChildren(li);
      return;
    }
    listEl.replaceChildren(...found.map(({ song, excerpt }) => {
      const li = document.createElement('li');
      li.className = 'song-item';
      const title = document.createElement('span');
      title.className = 'title';
      title.innerHTML = markTokens(song.title || 'Untitled', tokens);
      if (dupIds.has(song.id)) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'DUPLICATE';
        title.appendChild(badge);
      }
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = song.slides.length + (song.slides.length === 1 ? ' slide' : ' slides');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '\u2715';
      del.title = 'Delete this song';
      del.setAttribute('aria-label', 'Delete ' + song.title);
      del.addEventListener('click', (e) => { e.stopPropagation(); removeSong(song); });
      li.append(title, count, del);
      if (excerpt) {
        const note = document.createElement('span');
        note.className = 'excerpt';
        note.innerHTML = markTokens(excerpt, tokens);
        li.appendChild(note);
      }
      li.addEventListener('click', () => open(song.id));
      return li;
    }));
  }

  function renderCards(song) {
    if (!song.slides.length) {
      const hint = document.createElement('p');
      hint.className = 'faint';
      hint.textContent = 'This song has no slides yet. Press Edit to add some.';
      cardsEl.replaceChildren(hint);
      return;
    }
    cardsEl.replaceChildren(...song.slides.map((text, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card' + (i === activeSlideIdx ? ' cur' : '');
      const number = document.createElement('small');
      number.textContent = String(i + 1);
      card.append(number, document.createTextNode(text));
      card.addEventListener('click', () => showSlide(i));
      return card;
    }));
  }

  function renderChips() {
    const song = getSong();
    slideList.replaceChildren(...(song ? song.slides : []).map((text, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slide-chip' + (i === activeSlideIdx ? ' on' : '');
      chip.textContent = (text.split('\n')[0] || 'Slide ' + (i + 1)).slice(0, 30);
      chip.title = text;
      chip.addEventListener('click', () => selectSlide(i));
      return chip;
    }));
  }

  function render() {
    const song = getSong();
    const showList = !editing && (!song || listOpen);
    listEl.classList.toggle('hidden', !showList);
    search.classList.toggle('hidden', editing);
    view.classList.toggle('hidden', editing || !song || showList);
    editor.classList.toggle('hidden', !editing);
    if (showList) renderList();
    if (song && !editing) { nameEl.textContent = song.title; renderCards(song); }
    if (editing) renderChips();
    btnDelete.disabled = !song;
    refresh();
  }

  function open(id) {
    activeSongId = id;
    activeSlideIdx = null;
    shownIdx = -1;
    editing = false;
    listOpen = false;
    search.value = '';
    render();
  }

  function showSlide(i) {
    activeSlideIdx = i;
    shownIdx = i;
    renderCards(getSong());
    session.show();
    setStatus('Slide is live.', 'success');
  }

  function step(dir) {
    const song = getSong();
    if (!song || !song.slides.length) return;
    let target = shownIdx < 0 ? (dir > 0 ? 0 : song.slides.length - 1) : shownIdx + dir;
    target = Math.max(0, Math.min(song.slides.length - 1, target));
    activeSlideIdx = target;
    shownIdx = target;
    renderCards(song);
    session.show();
  }

  async function removeSong(song) {
    if (!confirm('Delete "' + (song.title || 'Untitled') + '"? This cannot be undone.')) return;
    await library.remove(song.id);
    if (song.id === activeSongId) resetSelection();
    render();
    setStatus('Deleted "' + (song.title || 'Untitled') + '".', '');
  }
```
`src/dock/songs-tab.js` (part 2 of 2, inside the same function: the editor, events and the registry object):

```js
  // ── Editor ────────────────────────────────────────────────────────────────

  function selectSlide(i) {
    const song = getSong();
    if (!song) return;
    activeSlideIdx = i;
    slideText.value = song.slides[i] || '';
    btnUpdate.disabled = false;
    btnDelSlide.disabled = false;
    renderChips();
    refresh();
  }

  function clearSlideEditor() {
    activeSlideIdx = null;
    slideText.value = '';
    btnUpdate.disabled = true;
    btnDelSlide.disabled = true;
  }

  function startEditing() {
    const song = getSong();
    editing = true;
    listOpen = false;
    titleInput.value = song ? song.title : '';
    clearSlideEditor();
    render();
  }

  function startNew() {
    activeSongId = null;
    shownIdx = -1;
    startEditing();
  }

  async function saveSong() {
    const title = titleInput.value.trim() || 'Untitled';
    const existing = getSong();
    const saved = await library.save({ ...(existing || { slides: [] }), id: existing ? existing.id : undefined, title });
    activeSongId = saved.id;
    btnDelete.disabled = false;
    setStatus('Song saved.', 'success');
    render();
  }

  async function addSlide() {
    const text = slideText.value;
    if (!text.trim()) { setStatus('Enter slide text first.', 'error'); return; }
    const existing = getSong();
    const saved = await library.save({
      ...(existing || { title: titleInput.value.trim() || 'Untitled' }),
      id: existing ? existing.id : undefined,
      slides: [...(existing ? existing.slides : []), text],
    });
    activeSongId = saved.id;
    activeSlideIdx = saved.slides.length - 1;
    slideText.value = '';
    btnUpdate.disabled = false;
    btnDelSlide.disabled = false;
    render();
    setStatus('Slide added.', 'success');
  }

  async function updateSlide() {
    const song = getSong();
    if (!song || activeSlideIdx === null) return;
    await library.save({ ...song, slides: song.slides.map((s, i) => (i === activeSlideIdx ? slideText.value : s)) });
    renderChips();
    if (session.isLive && session.liveTab === 'songs' && shownIdx === activeSlideIdx) session.resendIfLive();
    refresh();
    setStatus('Slide updated.', 'success');
  }

  async function deleteSlide() {
    const song = getSong();
    if (!song || activeSlideIdx === null) return;
    await library.save({ ...song, slides: song.slides.filter((_, i) => i !== activeSlideIdx) });
    if (shownIdx === activeSlideIdx) shownIdx = -1;
    clearSlideEditor();
    render();
    setStatus('Slide deleted.', '');
  }

  // ── Events ────────────────────────────────────────────────────────────────

  search.addEventListener('focus', () => { listOpen = true; render(); });
  search.addEventListener('input', () => { listOpen = true; render(); });
  btnAll.addEventListener('click', () => { listOpen = true; render(); });
  btnEdit.addEventListener('click', startEditing);
  btnNew.addEventListener('click', startNew);
  btnDone.addEventListener('click', () => { editing = false; listOpen = !getSong(); render(); });
  btnSave.addEventListener('click', saveSong);
  btnDelete.addEventListener('click', () => { const song = getSong(); if (song) removeSong(song); });
  btnAdd.addEventListener('click', addSlide);
  btnUpdate.addEventListener('click', updateSlide);
  btnDelSlide.addEventListener('click', deleteSlide);
  slideText.addEventListener('input', refresh);

  render();

  return {
    getContent() {
      const song = getSong();
      return { title: song ? song.title : (editing ? titleInput.value.trim() : ''), body: slideLines() };
    },
    preview() {
      const song = getSong();
      const lines = slideLines();
      const where = activeSlideIdx === null ? 'no slide picked' : 'slide ' + (activeSlideIdx + 1) + ' of ' + (song ? song.slides.length : 0);
      return {
        has: lines.length > 0,
        text: lines || (song ? 'Pick a slide' : 'Nothing loaded'),
        sub: song ? song.title + ' \u00b7 ' + where : 'Pick a song and a slide',
        canNav: !!(song && song.slides.length),
      };
    },
    step,
    markShown() { shownIdx = activeSlideIdx === null ? -1 : activeSlideIdx; },
    resetPosition() { shownIdx = -1; },
    /** Re-render after the library changed underneath us (bulk actions, folder attach). */
    refreshList() {
      if (activeSongId && !getSong()) resetSelection();
      render();
    },
  };
}
```

- [ ] **Step 6: Register the tab, the import panel and the tools in `src/dock/main.js`**

Add these imports below the existing `initScriptureTab` import:

```js
import { createLibrary } from '../songs/library.js';
import { createLocalSongStore } from '../songs/local-store.js';
import { initSongsTab } from './songs-tab.js';
import { initImportPanel } from './import-panel.js';
import { initLibraryTools } from './library-tools.js';
```

Add this directly after the `tabs.scripture = initScriptureTab({ ... });` statement:

```js
    let libraryTools = null;
    const library = createLibrary({
      local: createLocalSongStore(window.localStorage, report('songs')),
      onModeChange: () => { if (libraryTools) libraryTools.render(); },
      onError: report('library'),
    });
    tabs.songs = initSongsTab({
      session, library, setStatus: status.setStatus, refresh: () => liveBar.refresh(),
    });
    initImportPanel({
      library, setStatus: status.setStatus, report: report('songs'), onImported: () => tabs.songs.refreshList(),
    });
    libraryTools = initLibraryTools({
      library, kv: openKv('obs-stage-library'), setStatus: status.setStatus,
      report: report('library'), onChanged: () => tabs.songs.refreshList(),
    });
```

Add this as the last statement inside the `try` block, after `showView('scripture');`:

```js
    await libraryTools.restore();
```

- [ ] **Step 7: Build and run to verify pass**

Run: `npm run build && npx playwright test smoke/songs.spec.js smoke/scripture.spec.js smoke/shell.spec.js smoke/overlay.spec.js && npx vitest run`
Expected: PASS. Notes if something fails: if "find duplicates" finds nothing, check that `createSong` really creates a second song (the `+ New` button must clear `activeSongId`); if the narrow-dock test overflows, give the offending element `min-width: 0` and `overflow-wrap: anywhere` in `cards.css`.

- [ ] **Step 8: Commit**

```bash
git add src/dock smoke
git commit -m "feat: songs tab with universal search, slide cards, edit drawer, library tools and import"
```

---
### Task 9: Style tab (themes, animations, layout, colours, background, diagnostics)

**Files:**
- Create: `src/dock/segmented.js`, `src/dock/bg-image.js`, `src/dock/style-tab.js`, `smoke/style.spec.js`
- Modify: `src/dock/main.js` (init the tab and wire the Diagnostics panel)

**Interfaces:**
- Consumes: `createSettingsStore` (Task 5: `get()`, `update(patch)`); `defaultShowCard` (Task 2); `FONTS`; `session.resendIfLive()`; `createDiagnostics` (foundation).
- Produces (`segmented.js`): `bindSegmented(container, { get, set }) -> { paint() }`. The container holds `button[data-value]` children; the button whose value equals `get()` gets class `on` and `aria-pressed="true"`, the others `aria-pressed="false"`; clicking a button calls `set(value)` then repaints.
- Produces (`bg-image.js`): `readBackgroundImage(file) -> Promise<string>` (a JPEG data URL, downscaled to at most 1920 px wide so it cannot blow the localStorage quota; falls back to the original data URL if the canvas cannot encode; rejects with `That image could not be read.`).
- Produces (`style-tab.js`): `initStyleTab({ session, store, setStatus, report }) -> void`. Every change goes `store.update(patch)` then `session.resendIfLive()` then a repaint of all controls from `store.get()`. Choosing a theme also sets `showCard` to that theme's default (`defaultShowCard`), so Pure Type starts card-less and the others start with their card; the Show card checkbox can then override it. The custom-colour inputs are visible only while the Custom theme is selected.

- [ ] **Step 1: Write the failing browser tests**

`smoke/style.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { openPair, lookup, createSong, blockBibleApi } from './helpers.js';

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const swatch = (page, value) => page.locator(`#theme-swatches button[data-value="${value}"]`);

test.beforeEach(async ({ context }) => { await blockBibleApi(context); });

async function goLive(dock) {
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.click('#btn-show');
  await dock.click('#tab-style');
}

test('Frosted is selected by default and a new theme restyles the live overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await expect(swatch(dock, 'frosted')).toHaveAttribute('aria-pressed', 'true');
  await swatch(dock, 'frosted-light').click();
  await expect(swatch(dock, 'frosted-light')).toHaveClass(/on/);
  await expect(overlay.locator('#stage')).toHaveClass(/theme-frosted-light( |$)/);
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved');
});

test('Pure Type starts without a card and each theme resets the card default', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await swatch(dock, 'pure').click();
  await expect(dock.locator('#show-card-cb')).not.toBeChecked();
  await expect(overlay.locator('#stage')).toHaveClass(/no-card/);
  await dock.check('#show-card-cb');
  await expect(overlay.locator('#stage')).not.toHaveClass(/no-card/);
  await swatch(dock, 'frosted').click();
  await expect(dock.locator('#show-card-cb')).toBeChecked();
});

test('animation, position and size reach the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.click('#anim-seg button[data-value="lines"]');
  await expect(overlay.locator('#stage')).toHaveClass(/anim-lines( |$)/);
  await expect(overlay.locator('#ov-body .ln')).toHaveCount(4);
  await dock.click('#position-seg button[data-value="top"]');
  await expect(overlay.locator('#stage')).toHaveClass(/pos-top/);
  await dock.click('#size-seg button[data-value="xl"]');
  await expect(overlay.locator('#stage')).toHaveClass(/fs-xl/);
});

test('style changes keep the LIVE song on screen after switching to the Scripture tab', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Live Song', ['First slide']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.click('#tab-scripture');
  await dock.click('#tab-style');
  await swatch(dock, 'frosted-light').click();
  await expect(overlay.locator('#stage')).toHaveClass(/theme-frosted-light( |$)/);
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await expect(overlay.locator('#ov-title')).toHaveText('Live Song');
});

test('settings survive a reload', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-style');
  await swatch(dock, 'pure').click();
  await dock.click('#anim-seg button[data-value="wipe"]');
  await dock.click('#position-seg button[data-value="top"]');
  await dock.reload();
  await dock.click('#tab-style');
  await expect(swatch(dock, 'pure')).toHaveClass(/on/);
  await expect(dock.locator('#anim-seg button[data-value="wipe"]')).toHaveClass(/on/);
  await expect(dock.locator('#position-seg button[data-value="top"]')).toHaveClass(/on/);
});

for (const [saved, theme, animation] of [
  [{ theme: 'gold', animation: 'slide' }, 'frosted', 'rise'],
  [{ theme: 'white', animation: 'none' }, 'frosted-light', 'cut'],
  [{ theme: 'weird', animation: 'spin' }, 'frosted', 'rise'],
]) {
  test(`saved settings ${JSON.stringify(saved)} load as ${theme} / ${animation}`, async ({ page }) => {
    await page.addInitScript((value) => {
      if (!localStorage.getItem('obs-stage-display-settings')) localStorage.setItem('obs-stage-display-settings', JSON.stringify(value));
    }, saved);
    await page.goto('/dock.html');
    await page.click('#tab-style');
    await expect(swatch(page, theme)).toHaveClass(/on/);
    await expect(page.locator(`#anim-seg button[data-value="${animation}"]`)).toHaveClass(/on/);
  });
}
```
Append to `smoke/style.spec.js`:

```js
test('custom colours appear only for the Custom theme and reach the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await expect(dock.locator('#custom-colors-section')).toBeHidden();
  await swatch(dock, 'custom').click();
  await expect(dock.locator('#custom-colors-section')).toBeVisible();
  await dock.locator('#color-bg').fill('#112233');
  await expect(overlay.locator('#card')).toHaveCSS('background-color', /rgba\(17, 34, 51, 0\.88\d*\)/);
  await swatch(dock, 'frosted').click();
  await expect(dock.locator('#custom-colors-section')).toBeHidden();
});

test('the opacity slider updates its label and the glass alpha', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.locator('#opacity-slider').evaluate((el) => {
    el.value = '50';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(dock.locator('#opacity-value')).toHaveText('50%');
  await expect(overlay.locator('#card')).toHaveCSS('background-color', /rgba\(14, 18, 30, 0\.3\d*\)/);
});

test('italic and the reference toggle reach the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.click('#btn-italic');
  await expect(dock.locator('#btn-italic')).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay.locator('#ov-body')).toHaveCSS('font-style', 'italic');
  await expect(overlay.locator('#ov-ref')).toBeVisible();
  await dock.uncheck('#show-ref-cb');
  await expect(overlay.locator('#ov-ref')).toBeHidden();
});

test('a background image can be chosen and removed', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.setInputFiles('#bg-image-input', { name: 'bg.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(dock.locator('#bg-image-name')).toHaveText('Custom image in use');
  await expect(dock.locator('#btn-bg-clear')).toBeVisible();
  await expect(overlay.locator('#card')).toHaveCSS('background-image', /url\(/);
  await dock.click('#btn-bg-clear');
  await expect(dock.locator('#bg-image-name')).toContainText('None');
  await expect(dock.locator('#btn-bg-clear')).toBeHidden();
});

test('an unreadable background image is reported and changes nothing', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-style');
  await dock.setInputFiles('#bg-image-input', { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(dock.locator('#status-bar')).toContainText('That image could not be read.');
  await expect(dock.locator('#bg-image-name')).toContainText('None');
});

test('Diagnostics lists reported errors and can be cleared', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-songs');
  await dock.setInputFiles('#import-file-input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(dock.locator('#status-bar')).toContainText('Could not read bad.json');
  await dock.click('#tab-style');
  await expect(dock.locator('#diag-count')).toHaveText('(1)');
  await dock.click('#diagnostics summary');
  await expect(dock.locator('#diag-list li')).toHaveCount(1);
  await expect(dock.locator('#diag-list li')).toContainText('songs');
  await dock.click('#diag-clear');
  await expect(dock.locator('#diag-list li')).toHaveCount(0);
  await expect(dock.locator('#diag-count')).toHaveText('');
});

test('every style control is reachable at 380px without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 700 });
  await page.goto('/dock.html');
  await page.click('#tab-style');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  await swatchCheck(page);
});

async function swatchCheck(page) {
  for (const value of ['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom']) {
    const box = await swatch(page, value).boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(380);
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npx playwright test smoke/style.spec.js`
Expected: FAIL (nothing is wired to the Style panel yet).

- [ ] **Step 3: Implement the three small modules**

`src/dock/segmented.js`:

```js
/**
 * A row of exclusive buttons (data-value) bound to a value. The selected one
 * gets class "on" and aria-pressed; clicking a button calls set(value).
 */
export function bindSegmented(container, { get, set }) {
  const buttons = [...container.querySelectorAll('button[data-value]')];

  function paint() {
    const current = get();
    buttons.forEach((button) => {
      const on = button.dataset.value === current;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  buttons.forEach((button) => button.addEventListener('click', () => { set(button.dataset.value); paint(); }));
  paint();
  return { paint };
}
```

`src/dock/bg-image.js`:

```js
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.85;
const UNREADABLE = 'That image could not be read.';

/**
 * Background images are downscaled before storage. A full-size photo as a data
 * URL can exceed the localStorage quota on its own, which would stop every
 * later settings save, and that would only show up mid-service.
 */
export function readBackgroundImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(UNREADABLE));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(UNREADABLE));
      img.onload = () => {
        const ratio = Math.min(1, MAX_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY)); } catch { resolve(e.target.result); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
```
- [ ] **Step 4: Implement the Style tab**

`src/dock/style-tab.js`:

```js
import { $ } from './util.js';
import { FONTS } from '../core/fonts.js';
import { defaultShowCard } from '../overlay/style-math.js';
import { bindSegmented } from './segmented.js';
import { readBackgroundImage } from './bg-image.js';

export function initStyleTab({ session, store, setStatus, report }) {
  const fontSel = $('font-sel'), btnItalic = $('btn-italic'),
        opacitySlider = $('opacity-slider'), opacityValue = $('opacity-value'),
        scaleSlider = $('scale-slider'), scaleValue = $('scale-value'),
        showCardCb = $('show-card-cb'), showTitleCb = $('show-title-cb'), showRefCb = $('show-ref-cb'),
        customSection = $('custom-colors-section'), colorBg = $('color-bg'), colorText = $('color-text'),
        colorAccent = $('color-accent'), btnBgImage = $('btn-bg-image'), btnBgClear = $('btn-bg-clear'),
        bgName = $('bg-image-name'), bgInput = $('bg-image-input');

  FONTS.forEach((font) => {
    const option = document.createElement('option');
    option.value = font.value;
    option.textContent = font.label;
    fontSel.appendChild(option);
  });

  /** Paint every control from the store. */
  function sync() {
    const s = store.get();
    fontSel.value = s.font;
    btnItalic.setAttribute('aria-pressed', String(!!s.italic));
    btnItalic.classList.toggle('on', !!s.italic);
    opacitySlider.value = String(s.opacity);
    opacityValue.textContent = s.opacity + '%';
    scaleSlider.value = String(s.scale);
    scaleValue.textContent = s.scale + '%';
    showCardCb.checked = s.showCard !== false;
    showTitleCb.checked = s.showTitle !== false;
    showRefCb.checked = s.showReference !== false;
    customSection.classList.toggle('hidden', s.theme !== 'custom');
    colorBg.value = s.customColors.bg;
    colorText.value = s.customColors.text;
    colorAccent.value = s.customColors.accent;
    btnBgClear.classList.toggle('hidden', !s.bgImage);
    bgName.textContent = s.bgImage ? 'Custom image in use' : 'None, using the theme colour';
    segments.forEach((segment) => segment.paint());
  }

  function change(patch) {
    store.update(patch);
    session.resendIfLive();
    sync();
  }

  const segments = [
    bindSegmented($('theme-swatches'), {
      get: () => store.get().theme,
      set: (theme) => change({ theme, showCard: defaultShowCard(theme) }),
    }),
    bindSegmented($('anim-seg'), { get: () => store.get().animation, set: (animation) => change({ animation }) }),
    bindSegmented($('position-seg'), { get: () => store.get().position, set: (position) => change({ position }) }),
    bindSegmented($('size-seg'), { get: () => store.get().fontSize, set: (fontSize) => change({ fontSize }) }),
  ];

  fontSel.addEventListener('change', () => change({ font: fontSel.value }));
  btnItalic.addEventListener('click', () => change({ italic: !store.get().italic }));
  opacitySlider.addEventListener('input', () => change({ opacity: Number(opacitySlider.value) }));
  scaleSlider.addEventListener('input', () => change({ scale: Number(scaleSlider.value) }));
  showCardCb.addEventListener('change', () => change({ showCard: showCardCb.checked }));
  showTitleCb.addEventListener('change', () => change({ showTitle: showTitleCb.checked }));
  showRefCb.addEventListener('change', () => change({ showReference: showRefCb.checked }));
  [colorBg, colorText, colorAccent].forEach((input) => input.addEventListener('input', () => {
    change({ customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value } });
  }));

  btnBgImage.addEventListener('click', () => bgInput.click());
  bgInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    bgInput.value = '';
    if (!file) return;
    try {
      change({ bgImage: await readBackgroundImage(file) });
      setStatus('Background image set.', 'success');
    } catch (err) {
      report(err);
      setStatus(err.message, 'error');
    }
  });
  btnBgClear.addEventListener('click', () => {
    change({ bgImage: null });
    setStatus('Background image removed.', '');
  });

  sync();
}
```

- [ ] **Step 5: Wire the tab and the Diagnostics panel in `src/dock/main.js`**

Add this import below the existing `initLibraryTools` import:

```js
import { initStyleTab } from './style-tab.js';
```

Add this function at module level, directly above the `(async () => {` line:

```js
function wireDiagnosticsPanel() {
  const list = $('diag-list'), count = $('diag-count');
  diagnostics.subscribe((entries) => {
    count.textContent = entries.length ? '(' + entries.length + ')' : '';
    list.replaceChildren(...entries.slice().reverse().map((entry) => {
      const li = document.createElement('li');
      li.textContent = entry.at.slice(11, 19) + '  ' + entry.context + ': ' + entry.message;
      return li;
    }));
  });
  $('diag-clear').addEventListener('click', () => diagnostics.clear());
}
```

Add these two statements inside the `try` block, directly before the `transport.start();` line:

```js
    wireDiagnosticsPanel();
    initStyleTab({ session, store, setStatus: status.setStatus, report: report('settings') });
```

- [ ] **Step 6: Build and run to verify pass**

Run: `npm run build && npx playwright test smoke/style.spec.js smoke/songs.spec.js smoke/scripture.spec.js smoke/shell.spec.js smoke/overlay.spec.js && npx vitest run`
Expected: PASS for the whole browser suite and the unit suite.

- [ ] **Step 7: Commit**

```bash
git add src/dock smoke
git commit -m "feat: style tab with theme swatches, animations, colours, background image and diagnostics"
```

---
### Task 10: README, final verification and release

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README for the new dock**

Create a throwaway script `tmp-readme.mjs` in the repo root, run it, then delete it. It replaces everything from the `## Using it during a service` heading up to (not including) the `---` line before `## Troubleshooting`, and fixes two troubleshooting lines.

```js
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'README.md';
let text = readFileSync(file, 'utf8');

const NL = String.fromCharCode(10);
const start = text.indexOf('## Using it during a service');
const end = text.indexOf('---' + NL + NL + '## Troubleshooting');
if (start < 0 || end < 0) throw new Error('README markers not found');

const section = `## Using it during a service

The dock has a **live bar** pinned at the top of every tab: what is loaded, **Show**, **Hide** and previous / next. Under it are three tabs: **Scripture**, **Songs** and **Style**.

### Scripture tab

One box does everything. Type a reference and press **Enter**, type a book name to get suggestions, or type words from a verse to search for it. Reference entry is forgiving: \`Psalm 23:1\`, \`Ps 23:1\`, \`1st John 4:8\`, \`II Corinthians 5:17\` and \`Philipp 4:13\` all work. Ambiguous shorthand like \`Jo\` is rejected rather than guessed, so you never get the wrong verse by accident.

- **Quick books**: one-tap chips for the ten most-preached books
- **Ranges**: \`Romans 8:28-30\`, up to 20 verses at once
- **Edit before you show**: the verse text box is editable, so you can trim a long verse or fix spacing without affecting the lookup
- **Next / Previous**: step through consecutive verses, rolling over chapter and book boundaries. While something is live, stepping updates the screen immediately.
- **Word search**: type words you remember and pick the verse from the list
- **Random**: a small button, with a choice of the whole Bible, Old or New Testament, the Gospels, or Psalms and Proverbs
- **Auto Show**: send each verse to the stream the moment it is looked up
- **31 translations** in English, Portuguese, Russian and Chinese, filtered by the language dropdown. KJV and WEB work with no internet; any verse looked up before is remembered offline.

### Songs tab

- **One search box** for titles and lyrics. Type a song title or any part of a lyric: the words can be in any order, partial words work, and punctuation and accents are ignored. Title matches come first, and a lyric match shows the matching line with your words highlighted.
- **Slides are big cards.** Click a card to put that slide on screen, then use the left and right arrow keys to move through the song live. **Edit** opens the editor; **+ New** starts a song.
- **Import** reads \`.json\`, \`.txt\`, \`.csv\` or \`.tsv\` files, or \`lyrics.txt\`, with a preview of what is new and what already exists.
- **Library tools** holds import a folder, export as JSON, find duplicates, clear the library, and the library folder: choose it once and every song is saved there as its own \`.json\` file, plus a \`lyrics.txt\` holding every song in one text file. Back it up or sync it like any other folder.

Your existing Lyric Display library is picked up automatically the first time you open the plugin, so you do not need to re-import anything.

### Style tab

Five themes: **Frosted** (dark glass), **Frosted Light**, **Pure Type** (no card, text over the video), **Sacred Light** (image card) and **Custom** with your own background, text and accent colours. Four animations: **Soft rise** (default), **Glass wipe**, **Line by line** and **Instant cut**. Position, size, font, italic, background opacity, overlay scale and a background image are here too, and the Diagnostics list sits at the bottom.

Saved settings from earlier versions are converted automatically: Dark Stage, Classic Gold and Neon Live become Frosted, Clean White becomes Frosted Light, Fade and Slide become Soft rise, and None becomes Instant cut.

### Shared controls

| Key | Action |
|-----|--------|
| Left / Right arrow | Previous / next verse or slide |
| \`Space\` | Show / hide |
| \`Esc\` | Hide |

Settings are shared deliberately: theme, position, font, size, opacity, scale and background carry across both tabs so scripture and lyrics match on screen.

One deliberate behaviour worth knowing: if a song is live and you switch to the Scripture tab to prepare the next verse, changing a style setting keeps restyling the **song** that is on screen. Nothing swaps until you press **Show**.

`;
text = text.slice(0, start) + section + text.slice(end);

const fixes = [
  ['Use **↓ JSON** now and then for a backup copy.', 'Use **Export all as JSON** in Library tools now and then for a backup copy.'],
  ['Open **Diagnostics** at the bottom of the dock', 'Open **Diagnostics** at the bottom of the Style tab'],
];
for (const [from, to] of fixes) {
  if (!text.includes(from)) throw new Error('README text not found: ' + from);
  text = text.replace(from, to);
}
writeFileSync(file, text);
console.log('README updated');
```

```bash
node tmp-readme.mjs && rm tmp-readme.mjs
grep -n "dropdown pickers\|quick boxes\|Classic Gold, Dark Minimal" README.md || echo "no stale mentions"
```

Expected: `README updated`, then `no stale mentions` (the sentence in the Style tab that lists Classic Gold as a retired name is fine; it does not match these patterns).

- [ ] **Step 2: Full verification**

```bash
npm run build
git status --short dist
npx vitest run --coverage
npx playwright test
```

Expected: `git status --short dist` prints nothing after a second build (deterministic; if it shows changes, commit them); coverage thresholds hold (80% lines and functions on the listed logic modules); all browser specs pass.

- [ ] **Step 3: Check size, leftovers and the file:// load**

```bash
wc -l src/dock/*.js src/overlay/*.js src/css/*.css | sort -n | tail -6
grep -rn "theme-dark\|theme-gold\|theme-neon\|stream-controls\|display-settings\|library-ui\|StageApp" src smoke tests dist/*.html || echo "no leftovers"
grep -rn "console.log" src || echo "no console.log"
```

Expected: no file above about 400 lines (`songs-tab.js` is the largest, around 330); `no leftovers`; `no console.log` (only `console.error` is allowed in the two `main.js` files).

- [ ] **Step 4: Manual check in real OBS 28 or newer**

With the dock URL `file:///.../dist/dock.html` and the overlay as a browser source on `dist/overlay.html` (1920x1080, both "important" boxes unticked), over a real video scene:
1. Frosted shows its blur over moving video without dropping frames; Frosted Light stays readable over a dark scene; Pure Type is legible over a bright scene (turn Show card on if not).
2. Each animation looks right when showing, stepping to the next verse or slide, and hiding; rapid Next presses end on the right text.
3. The live bar stays pinned while scrolling each tab in the narrow dock; Show and Hide are easy to hit.
4. Type a title and then a lyric fragment in the Songs search; the right song appears; clicking a slide card puts it on screen.
5. Choose the library folder, restart OBS, check the folder reconnects (or Reconnect appears), and import `lyrics.txt` again.

- [ ] **Step 5: Commit, tag, push and open a draft pull request (do not merge)**

```bash
git add -A README.md dist
git commit -m "docs: README for the redesigned dock, universal song search and the new overlay look"
git tag redesign-v1
git push --follow-tags origin feat/redesign
gh pr create --draft --base main --head feat/redesign --title "Redesign: pinned live bar, universal song search, new overlay themes and animations" --body "Implements sub-project 2 (spec and plan in docs/superpowers). Dock rebuilt on a small design system with a pinned live bar and Scripture / Songs / Style tabs; one smart box for verses; slide cards and universal song search; overlay themes Frosted, Frosted Light, Pure Type, Sacred Light, Custom and animations Soft rise, Glass wipe, Line by line, Instant cut. Saved settings from earlier versions migrate automatically. Draft: manual OBS check still to do."
```

---

## Self-review

**Spec coverage**
- Dock layout (live bar, tabs, Scripture, Songs, Style): Tasks 6, 7, 8, 9. Live bar states, buttons and shortcuts: Task 6. Smart box rules and dropdown: Tasks 4 and 7. Songs slide cards, Edit drawer, Library tools, banners, import: Task 8. Style controls, swatches, segmented controls, custom colours, background image, Diagnostics: Task 9.
- Universal song search (added after the spec was drafted, and already in the spec): Tasks 5 and 8.
- Visual system tokens and sheets: Task 6. Overlay themes with alpha rule: Tasks 2 and 3. Animations, line splitting, change-while-visible: Tasks 2 and 3.
- State and migration: Task 1 (state, settings), covered again in the browser specs of Tasks 3 and 9.
- Behaviour preserved: shortcuts and live-content rule (Tasks 6, 8, 9 specs), library and folder (Task 8), offline scripture (Task 7 specs run with the Bible API blocked).
- Testing section: unit tests in Tasks 1, 2, 4, 5; browser tests in Tasks 3, 6, 7, 8, 9; coverage in Tasks 5 and 10; manual OBS check in Task 10.
- Out of scope items are not touched.

**Placeholder scan:** none. The only "apply this edit" steps (books.js, build.mjs, main.js) give the exact code and anchors.

**Type consistency:** `tabs.scripture` and `tabs.songs` expose `getContent`, `preview`, `step` (and `markShown`, `resetPosition` for songs) exactly as `live-bar.js` calls them. `store.update` and `store.styleState` are used the same way in `main.js`, `scripture-tab.js` and `style-tab.js`. `searchSongs`, `tokenize`, `markTokens` signatures match their use in `songs-tab.js`. DOM ids used in the specs match the markup in Task 6.

**Review Focus:** (1) interrupted animations: Task 3 specs (rapid Next, show then hide, hide then show). (2) pathological Line by line text: Task 2 unit tests and Task 3 empty-text spec. (3) odd smart-box input: Task 4 unit tests and Task 7 "odd input" spec. (4) old or hostile stored values: Task 1 unit tests, Task 3 legacy spec, Task 9 saved-settings specs. (5) narrow-dock overflow with real content: Task 8 narrow-dock spec and Task 9 swatch-width check.