# Lower thirds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a volunteer put a lower third (a name line, an info line, an optional picture, left / centre / right placement, an optional automatic hide) on screen as a plan item or with "Show now".

**Architecture:** A new state kind `lowerthird` reuses the single overlay card, reshaped by CSS into a bar (so themes, animations and Show / Hide all apply unchanged). The dock keeps the picture as a file in `logos/` inside the library folder, reads it when the item is loaded, and sends it inline with the state; the dock also times the automatic hide. The editor, plan rows and live bar learn the new type the same way they learned announcements and timers.

**Tech Stack:** Vanilla JS modules bundled by esbuild into classic IIFE scripts, Vitest (unit), Playwright (browser, static server on :4173, needs `npm run build`).

**Spec:** `docs/superpowers/specs/2026-10-25-lower-thirds-design.md`

## Global Constraints

- OBS 28+ over `file:///`: classic IIFE bundle via esbuild, no ES-module script tags, no fetch of local files.
- Model and store functions return new copies; never mutate plans, items or state.
- The dock is the only authority over state; the overlay only renders what it is told. The overlay never counts the hide-after time.
- State `kind` and plan item `type` stay open sets. `STATE_VERSION` stays 1.
- A lower third takes turns with the card: showing one replaces whatever card is up. Always at the bottom, ignoring the Style tab's Position. No second overlay layer.
- Plan item: `{ id, type: 'lowerthird', name, info, align: 'left' | 'center' | 'right', logo: <plain file name ending .png> | null, hideAfter: <whole seconds 1 to 3600> | null }`. At least one of `name` and `info` has text.
- Pictures are PNG files in `logos/` inside the library folder, about 160 pixels on the longest side. Without a connected library folder the picture controls are disabled; a missing file drops the picture and the text still shows.
- A state `logo` is kept only if it is an `image` data URL of at most 300000 characters; otherwise it is dropped and the text still shows.
- Existing behaviour and tests for verses, songs, announcements, timers and the plan stay unchanged.
- Files are CRLF on disk via git (`core.autocrlf=true`); that is expected. `dist/` is rebuilt (`npm run build`) and committed with any change under `src/`. Coverage stays at or above 80%.
- Baseline before this plan: 356 Vitest tests, 122 Playwright specs, coverage 94% statements.

**Deviation from the spec (rule on it in the ledger):** the spec lists `isLogoDataUrl` under `src/plan/logos.js`. `src/core/state.js` needs it and core must not import from `plan/`, so it lives in `state.js` (exported) instead. `logos.js` keeps `isValidLogoName`, `logoFileName`, `fitSize`.

## Review Focus

Failure modes the spec implies that no single task's happy path exercises; each has a test in the named task.

1. The automatic hide never hides something it did not show: after Hide, after another Show, after Clear, and when a different lower third replaced it (Tasks 5 and 6).
2. Show never goes on air before the picture has been read, including Show now (Tasks 5 and 6).
3. A missing or deleted picture file, or no connected folder, still shows the name and info (Tasks 4 and 6).
4. Switching kinds fully resets the bar: a verse or announcement shown after a lower third has the normal wide centred card (Task 2).
5. Hostile or broken state: no text renders nothing, but a Hide with no text still hides; a bad `align`, `logo` or non-string text is neutralised (Tasks 1 and 2); and an invalid hand-edited plan item is an unsupported row, never rewritten (Task 3).

## File Structure

New:
- `src/plan/logos.js`: pure helpers: `LOGO_MAX_SIDE`, `isValidLogoName`, `logoFileName`, `fitSize`.
- `src/dock/plan/logo-store.js`: the `logos/` folder: list, has, add (shrink and save), read (data URL), plus the browser-side `encodeLogo`.
- Tests: `tests/core/state-lowerthird.test.js`, `tests/plan/logos.test.js`, `tests/plan/lowerthird.test.js`, `tests/dock/plan/logo-store.test.js`, `tests/dock/live/session-lowerthird.test.js`, `tests/dock/plan/lowerthird-tab.test.js`, `smoke/overlay-lowerthird.spec.js`, `smoke/lowerthird.spec.js`.

Modified: `src/core/state.js`, `src/core/record-folder.js`, `tests/helpers/fake-dir.js`, `src/overlay/render.js`, `src/css/overlay.css`, `src/html/overlay.html`, `src/plan/extras.js`, `src/plan/model.js`, `src/plan/cursor.js`, `src/dock/live/session.js`, `src/dock/live/live-bar.js`, `src/dock/plan/extras-tab.js`, `src/dock/plan/extras-editor.js`, `src/dock/plan/plan-tab.js`, `src/dock/main.js`, `src/html/dock.html`, `src/css/dock/extras.css`, `vitest.config.js`, `README.md`, `dist/`.

How to edit existing files: files are CRLF on disk. Use the Edit tool; if a multi-line match fails, apply the change with a small node script that reads the file, converts CRLF to LF, replaces the exact old text (asserting exactly one match), and writes it back (keeping CRLF).

---

### Task 1: State validation and the pure picture helpers

**Files:**
- Modify: `src/core/state.js`
- Create: `src/plan/logos.js`
- Test: `tests/core/state-lowerthird.test.js`, `tests/plan/logos.test.js`

**Interfaces:**
- Consumes: `safeFilename` from `src/core/record-folder.js`.
- Produces: in `src/core/state.js`, `KINDS` now includes `'lowerthird'`, `DEFAULTS.lowerthird = null`, `MAX_LOGO_DATA_URL = 300000`, `isLogoDataUrl(s): boolean`, and `normalizeState` handling for kind `lowerthird`: a `show` with no text in `title` and `body` returns `null`; otherwise `title` and `body` are forced to strings and `lowerthird` becomes `{ align: 'left' | 'center' | 'right', logo: <data URL> | null }` (unknown align becomes `'left'`, bad logo becomes `null`). In `src/plan/logos.js`: `LOGO_MAX_SIDE = 160`, `isValidLogoName(name): boolean`, `logoFileName(sourceName, taken: string[]): string` (always `.png`, never one of `taken`, case-insensitive), `fitSize(width, height, max = LOGO_MAX_SIDE): { width, height } | null`.

- [ ] **Step 1: Write the failing tests.** `tests/core/state-lowerthird.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { KINDS, DEFAULTS, normalizeState, isLogoDataUrl, MAX_LOGO_DATA_URL } from '../../src/core/state.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const show = (extra) => ({ action: 'show', kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', ...extra });

describe('lowerthird kind', () => {
  it('is a known kind and defaults its field to null', () => {
    expect(KINDS).toContain('lowerthird');
    expect(DEFAULTS.lowerthird).toBeNull();
  });

  it('accepts a name and info and fills the lowerthird field with defaults', () => {
    expect(normalizeState(show())).toMatchObject({ kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'left', logo: null } });
  });

  it('needs some text to show, but name alone or info alone is enough', () => {
    expect(normalizeState(show({ body: '' }))).not.toBeNull();
    expect(normalizeState(show({ title: '' }))).not.toBeNull();
    expect(normalizeState(show({ title: '  ', body: '' }))).toBeNull();
    expect(normalizeState(show({ title: '', body: '   ' }))).toBeNull();
    expect(normalizeState({ action: 'show', kind: 'lowerthird' })).toBeNull();
  });

  it('still lets Hide and Clear through with no text, so nothing can get stuck on air', () => {
    expect(normalizeState({ action: 'hide', kind: 'lowerthird', title: '', body: '' })).not.toBeNull();
    expect(normalizeState({ action: 'clear' })).not.toBeNull();
  });

  it('keeps a valid placement and replaces an unknown one with left', () => {
    expect(normalizeState(show({ lowerthird: { align: 'center' } })).lowerthird.align).toBe('center');
    expect(normalizeState(show({ lowerthird: { align: 'right' } })).lowerthird.align).toBe('right');
    expect(normalizeState(show({ lowerthird: { align: 'diagonal' } })).lowerthird.align).toBe('left');
    expect(normalizeState(show({ lowerthird: 'junk' })).lowerthird).toEqual({ align: 'left', logo: null });
  });

  it('keeps an image data URL and drops anything else, leaving the text', () => {
    expect(normalizeState(show({ lowerthird: { logo: PNG } })).lowerthird.logo).toBe(PNG);
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'http://example.com/a.png', '', 5, null, {}]) {
      const state = normalizeState(show({ lowerthird: { logo: bad } }));
      expect(state.lowerthird.logo).toBeNull();
      expect(state.title).toBe('Pastor John');
    }
  });

  it('drops a picture over the size limit', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_LOGO_DATA_URL);
    expect(isLogoDataUrl(huge)).toBe(false);
    expect(normalizeState(show({ lowerthird: { logo: huge } })).lowerthird.logo).toBeNull();
  });

  it('turns non-text title and body into empty text', () => {
    const state = normalizeState(show({ title: 5, body: { x: 1 } }));
    expect(state).toBeNull();
    expect(normalizeState(show({ title: 5, body: 'Info' }))).toMatchObject({ title: '', body: 'Info' });
  });

  it('does not touch other kinds', () => {
    expect(normalizeState({ action: 'show', kind: 'verse', body: 'x', lowerthird: 'junk' }).kind).toBe('verse');
  });
});

describe('isLogoDataUrl', () => {
  it('accepts png, jpeg, webp and gif data URLs only', () => {
    expect(isLogoDataUrl(PNG)).toBe(true);
    expect(isLogoDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isLogoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isLogoDataUrl('data:image/png;base64,not base64!')).toBe(false);
    expect(isLogoDataUrl(undefined)).toBe(false);
  });
});
```

`tests/plan/logos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isValidLogoName, logoFileName, fitSize, LOGO_MAX_SIDE } from '../../src/plan/logos.js';

describe('isValidLogoName', () => {
  it('accepts a plain .png file name', () => {
    ['a.png', 'pastor_john.png', 'pastor_john (2).png', 'Church Logo.PNG'].forEach((n) => expect(isValidLogoName(n)).toBe(true));
  });
  it('rejects folders, other types, hidden names and non-text', () => {
    ['a/b.png', 'a\\b.png', '../a.png', 'a..png', 'a.jpg', 'a.png.exe', '.png', '', 'x'.repeat(90) + '.png', null, undefined, 5].forEach((n) => expect(isValidLogoName(n)).toBe(false));
  });
});

describe('logoFileName', () => {
  it('makes a safe .png name from the source file name', () => {
    expect(logoFileName('Pastor John.jpg', [])).toBe('Pastor_John.png');
    expect(logoFileName('a/b:c.webp', [])).toBe('a_b_c.png');
    expect(logoFileName('', [])).toBe('logo.png');
    expect(logoFileName('???.png', [])).toBe('logo.png');
  });
  it('never reuses a taken name, ignoring case', () => {
    expect(logoFileName('logo.png', ['logo.png'])).toBe('logo (2).png');
    expect(logoFileName('Logo.png', ['logo.png', 'logo (2).png'])).toBe('Logo (3).png');
  });
});

describe('fitSize', () => {
  it('scales the longest side down to the limit and keeps the proportions', () => {
    expect(fitSize(400, 200)).toEqual({ width: LOGO_MAX_SIDE, height: 80 });
    expect(fitSize(200, 400)).toEqual({ width: 80, height: LOGO_MAX_SIDE });
    expect(fitSize(1000, 1000, 100)).toEqual({ width: 100, height: 100 });
  });
  it('never makes a picture bigger and never returns zero', () => {
    expect(fitSize(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitSize(1000, 1)).toEqual({ width: LOGO_MAX_SIDE, height: 1 });
  });
  it('returns null for a size that is not positive', () => {
    expect(fitSize(0, 10)).toBeNull();
    expect(fitSize(-5, 10)).toBeNull();
    expect(fitSize(NaN, 10)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/state-lowerthird.test.js tests/plan/logos.test.js`
Expected: FAIL (`logos.js` cannot be resolved; the state tests fail on the old `KINDS` and the missing exports).

- [ ] **Step 3: Write `src/plan/logos.js`**

```js
import { safeFilename } from '../core/record-folder.js';

export const LOGO_MAX_SIDE = 160;   // pictures are shrunk to this on their longest side

const LOGO_NAME = /^[^\\/:*?"<>|\x00-\x1f]{1,80}\.png$/i;

/** A plain file name ending .png: no folders, no dot-dot, not hidden. */
export const isValidLogoName = (name) =>
  typeof name === 'string' && LOGO_NAME.test(name) && !name.startsWith('.') && !name.includes('..');

/** A free "name.png": "Pastor John.jpg" becomes "Pastor_John.png", then "Pastor_John (2).png" if taken. */
export function logoFileName(sourceName, taken) {
  const stem = (sourceName || '').replace(/\.[^.]*$/, '');
  const base = stem.trim() ? safeFilename(stem, 'logo') : 'logo';
  const used = new Set(taken.map((n) => n.toLowerCase()));
  let name = base + '.png';
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = base + ' (' + n + ').png';
  return name;
}

/** The size to draw a picture at: longest side at most `max`, proportions kept, never zero. */
export function fitSize(width, height, max = LOGO_MAX_SIDE) {
  if (!(width > 0) || !(height > 0)) return null;
  const k = Math.max(width, height) > max ? max / Math.max(width, height) : 1;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
```

- [ ] **Step 4: Edit `src/core/state.js`.**

(a) Change `export const KINDS = Object.freeze(['verse', 'song', 'announcement', 'timer']);` to `export const KINDS = Object.freeze(['verse', 'song', 'announcement', 'timer', 'lowerthird']);`.
(b) In `DEFAULTS`, directly after the `timer:` line add `lowerthird:    null,      // lowerthird kind only: { align, logo }`.
(c) Directly above `/**\n * Turn anything that arrives over a transport` add:

```js
const LOWER_THIRD_ALIGNS = ['left', 'center', 'right'];
export const MAX_LOGO_DATA_URL = 300000;
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** A picture the overlay may show: a small base64 image data URL. Anything else is dropped. */
export const isLogoDataUrl = (s) => typeof s === 'string' && s.length <= MAX_LOGO_DATA_URL && LOGO_DATA_URL.test(s);

const textOf = (value) => (typeof value === 'string' ? value : '');

function cleanLowerThird(value) {
  const v = value && typeof value === 'object' ? value : {};
  return { align: LOWER_THIRD_ALIGNS.includes(v.align) ? v.align : 'left', logo: isLogoDataUrl(v.logo) ? v.logo : null };
}
```
(d) In `normalizeState`, directly after the line `if (merged.kind === 'timer' && ...` add:
```js
  if (merged.kind === 'lowerthird' && merged.action === 'show' && !textOf(merged.title).trim() && !textOf(merged.body).trim()) return null;
```
and replace the final line `return { ...merged, ...migrateLegacy(merged) };` with:
```js
  const result = { ...merged, ...migrateLegacy(merged) };
  if (merged.kind === 'lowerthird') {
    result.title = textOf(merged.title);
    result.body = textOf(merged.body);
    result.lowerthird = cleanLowerThird(merged.lowerthird);
  }
  return result;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/core tests/plan/logos.test.js`
Expected: PASS, including the existing state tests.

- [ ] **Step 6: Run the whole unit suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/core/state.js src/plan/logos.js tests/core/state-lowerthird.test.js tests/plan/logos.test.js
git commit -m "feat: lowerthird state kind and picture name helpers"
```

---

### Task 2: Overlay rendering

**Files:**
- Modify: `src/overlay/render.js`, `src/css/overlay.css`, `src/html/overlay.html`
- Test: `smoke/overlay-lowerthird.spec.js`

**Interfaces:**
- Consumes: `normalizeState` and its `lowerthird` field (Task 1); `setupOverlay` from `smoke/helpers.js`.
- Produces: the overlay renders `kind: 'lowerthird'`. Stage classes `kind-lowerthird`, `lt-left` / `lt-center` / `lt-right`, `has-logo`. Name in `#ov-title`, info in `#ov-body`, picture in `#ov-logo`.

- [ ] **Step 1: Write the failing browser specs.** Create `smoke/overlay-lowerthird.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { setupOverlay } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const THEMES = ['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom'];
const setup = (page) => setupOverlay(page, { title: '', body: '', reference: '', theme: 'frosted', animation: 'cut' });
const lt = (extra = {}, state = {}) => ({ kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'left', logo: null, ...extra }, ...state });

test.describe('overlay: lower third', () => {
  test('shows the name above the info, as a bar at the bottom left', async ({ page }) => {
    const { push, errors, stage, body, title } = await setup(page);
    await push(lt());
    await expect(stage).toHaveClass(/kind-lowerthird/);
    await expect(stage).toHaveClass(/lt-left/);
    await expect(title).toHaveText('Pastor John');
    await expect(body).toHaveText('Guest speaker');
    await expect(page.locator('#ov-ref')).toBeHidden();
    const box = await page.locator('#card').boundingBox();
    expect(box.x).toBeGreaterThan(20);
    expect(box.x).toBeLessThan(110);
    expect(box.width).toBeLessThan(700);
    expect(box.y + box.height).toBeGreaterThan(720 * 0.8);
    expect(errors).toEqual([]);
  });

  test('centres and right-aligns the bar', async ({ page }) => {
    const { push } = await setup(page);
    await push(lt({ align: 'center' }));
    let box = await page.locator('#card').boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(8);
    await push(lt({ align: 'right' }));
    await expect(page.locator('#stage.lt-right')).toHaveCount(1);
    box = await page.locator('#card').boundingBox();
    expect(1280 - (box.x + box.width)).toBeGreaterThan(20);
    expect(1280 - (box.x + box.width)).toBeLessThan(110);
  });

  test('always sits at the bottom, even when Position is top', async ({ page }) => {
    const { push } = await setup(page);
    await push(lt({}, { position: 'top' }));
    const box = await page.locator('#card').boundingBox();
    expect(box.y + box.height).toBeGreaterThan(720 * 0.8);
  });

  test('shows the picture beside the text, and drops a bad one but keeps the text', async ({ page }) => {
    const { push, body } = await setup(page);
    await push(lt({ logo: PNG }));
    await expect(page.locator('#stage.has-logo')).toHaveCount(1);
    await expect(page.locator('#ov-logo')).toBeVisible();
    await expect(page.locator('#ov-logo')).toHaveAttribute('src', PNG);
    await push(lt({ logo: 'javascript:alert(1)' }));
    await expect(page.locator('#stage.has-logo')).toHaveCount(0);
    await expect(page.locator('#ov-logo')).toBeHidden();
    await expect(body).toHaveText('Guest speaker');
  });

  test('name only and info only both work, and an empty one renders nothing', async ({ page }) => {
    const { push, stage, body, title } = await setup(page);
    await push(lt({}, { body: '' }));
    await expect(title).toHaveText('Pastor John');
    await expect(body).toBeHidden();
    await push(lt({}, { title: '', body: 'Just the info' }));
    await expect(title).toBeHidden();
    await expect(body).toHaveText('Just the info');
    await push({ action: 'hide', visible: false, kind: 'lowerthird', title: '', body: '', lowerthird: { align: 'left', logo: null } });
    await expect(stage).toHaveClass(/hidden/);
    await push(lt({}, { title: '   ', body: '' }));
    await page.waitForTimeout(300);
    await expect(stage).toHaveClass(/hidden/);
  });

  test('a Hide with no text still hides a lower third that is on air', async ({ page }) => {
    const { push, stage } = await setup(page);
    await push(lt());
    await expect(stage).not.toHaveClass(/hidden/);
    await push({ action: 'hide', visible: false, kind: 'lowerthird', title: '', body: '' });
    await expect(stage).toHaveClass(/hidden/);
  });

  test('a verse or announcement after a lower third has the normal wide card again', async ({ page }) => {
    const { push, stage } = await setup(page);
    await push(lt({ align: 'right', logo: PNG }));
    await expect(stage).toHaveClass(/lt-right/);
    await push({ kind: 'verse', body: 'For God so loved the world', reference: 'John 3:16' });
    await expect(stage).not.toHaveClass(/kind-lowerthird/);
    await expect(stage).not.toHaveClass(/lt-right/);
    await expect(stage).not.toHaveClass(/has-logo/);
    await expect(page.locator('#ov-logo')).toBeHidden();
    const wide = await page.locator('#card').boundingBox();
    expect(wide.width).toBeGreaterThan(1100);
    await push({ kind: 'announcement', title: 'Welcome', body: 'Hello' });
    const again = await page.locator('#card').boundingBox();
    expect(again.width).toBeGreaterThan(1100);
  });

  test('every theme renders a lower third without page errors', async ({ page }) => {
    const { push, errors, stage, title } = await setup(page);
    for (const theme of THEMES) {
      await push(lt({ logo: PNG }, { theme }));
      await expect(stage).toHaveClass(new RegExp('theme-' + theme + '( |$)'));
      await expect(title).toHaveText('Pastor John');
      await expect(page.locator('#ov-logo')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('Soft rise and Glass wipe still show it', async ({ page }) => {
    const { push, stage, title } = await setup(page);
    for (const animation of ['rise', 'wipe', 'lines']) {
      await push({ action: 'hide', visible: false, ...lt(), animation: 'cut' });
      await push(lt({}, { animation }));
      await expect(title).toHaveText('Pastor John');
      await expect(stage).not.toHaveClass(/hidden/);
    }
  });
});
```

- [ ] **Step 2: Build and run them to verify they fail**

Run: `npm run build; npx playwright test smoke/overlay-lowerthird.spec.js --timeout=4000 --reporter=list`
Expected: FAIL (no `kind-lowerthird` class, no `#ov-logo`).

- [ ] **Step 3: Edit `src/html/overlay.html`.** Replace
```html
    <div id="card">
      <div id="wrap">
```
with
```html
    <div id="card">
      <img id="ov-logo" alt="">
      <div id="wrap">
```

- [ ] **Step 4: Edit `src/css/overlay.css`.** After the line `.kind-timer #ov-body { ... }` add:

```css

/* Lower third: the same card, reshaped into a name-and-title bar at the bottom */
#ov-logo { display: none; width: auto; max-width: 220px; object-fit: contain; border-radius: 6px; flex: none; }
#stage.has-logo #ov-logo { display: block; }
#stage.kind-lowerthird { align-items: flex-start; padding-left: 4%; padding-right: 4%; }
#stage.kind-lowerthird.lt-center { align-items: center; }
#stage.kind-lowerthird.lt-right  { align-items: flex-end; }
#stage.kind-lowerthird.pos-bottom { padding-bottom: 7vh; }
#stage.kind-lowerthird #card { width: auto; max-width: 70%; min-height: 0 !important; flex-direction: row; justify-content: flex-start;
  gap: 18px; border-radius: 10px; border-left: 6px solid var(--accent); }
#stage.kind-lowerthird #wrap { width: auto; text-align: left; }
#stage.kind-lowerthird.lt-right #wrap { text-align: right; }
#stage.kind-lowerthird #ov-title { text-transform: none; font-variant: normal; letter-spacing: 0; margin: 0; line-height: 1.15; }
#stage.kind-lowerthird #ov-body { width: auto; max-width: none; margin: 0; line-height: 1.3; white-space: normal; }
#stage.kind-lowerthird #ov-body:empty { display: none; }
#stage.kind-lowerthird .accent { display: none; }
.kind-lowerthird.theme-frosted #ov-title, .kind-lowerthird.theme-pure #ov-title,
.kind-lowerthird.theme-sacred-light #ov-title { color: #ffffff; }
.kind-lowerthird.theme-frosted-light #ov-title { color: #1a2233; }
.kind-lowerthird.theme-frosted #ov-body { color: #9ec1ff; }
.kind-lowerthird.theme-frosted-light #ov-body { color: #2f5fd0; }
.kind-lowerthird.theme-sacred-light #ov-body { color: #e8c97a; }
.kind-lowerthird.theme-pure #ov-body { color: #ffffff; opacity: 0.9; }
```

- [ ] **Step 5: Edit `src/overlay/render.js`.**

(a) Replace `const KIND_CLASSES  = ['kind-verse', 'kind-song', 'kind-announcement', 'kind-timer'];` with `const KIND_CLASSES  = ['kind-verse', 'kind-song', 'kind-announcement', 'kind-timer', 'kind-lowerthird'];` and after the `POS_CLASSES` line add `const ALIGN_CLASSES = ['lt-left', 'lt-center', 'lt-right'];`.
(b) After `const TIMER_SCALE   = 1.6;   // ...` line add:
```js
const LT_NAME_SCALE = 0.9;    // lower third text sizes, as a fraction of the body size
const LT_INFO_SCALE = 0.56;
const LT_LOGO_SCALE = 1.2;    // picture height, as a multiple of the two text lines together
```
(c) After `const refEl   = doc.getElementById('ov-ref');` add `const logoEl  = doc.getElementById('ov-logo');`.
(d) In `applyStyles`, replace the line `setClass(POS_CLASSES,   'pos-' + (state.position || 'bottom'));` with:
```js
    setClass(POS_CLASSES,   'pos-' + (kind === 'lowerthird' ? 'bottom' : (state.position || 'bottom')));
    ALIGN_CLASSES.forEach((c) => stage.classList.remove(c));
    if (kind === 'lowerthird') stage.classList.add('lt-' + state.lowerthird.align);
```
(e) In the custom-theme branch replace
```js
      bodyEl.style.color  = colors.text || '#ffffff';
      titleEl.style.color = accent;
```
with
```js
      const swap = kind === 'lowerthird';   // a lower third puts the name in the text colour and the info in the accent
      bodyEl.style.color  = swap ? accent : (colors.text || '#ffffff');
      titleEl.style.color = swap ? (colors.text || '#ffffff') : accent;
```
(f) Directly after the line `card.style.paddingRight  = '52px';` add:
```js
    if (kind === 'lowerthird') {
      card.style.minHeight     = '';
      card.style.paddingTop    = Math.round(14 * scale) + 'px';
      card.style.paddingBottom = Math.round(14 * scale) + 'px';
      card.style.paddingLeft   = '20px';
      card.style.paddingRight  = '28px';
    }
```
(g) At the very start of `fillContent` (before `const titled = ...`) add:
```js
    const logo = state.kind === 'lowerthird' ? state.lowerthird.logo : null;
    if (logo) logoEl.src = logo; else logoEl.removeAttribute('src');
    stage.classList.toggle('has-logo', !!logo);
```
and directly before `if (state.kind === 'timer') {` add:
```js
    if (state.kind === 'lowerthird') {
      const base = computeBodyFontSize('', 'fs-' + (state.fontSize || 'md'), getScale(state));
      titleEl.style.fontSize = Math.round(base * LT_NAME_SCALE) + 'px';
      bodyEl.style.fontSize  = Math.round(base * LT_INFO_SCALE) + 'px';
      bodyEl.textContent = body;
      bodyEl.style.removeProperty('--stagger');
      logoEl.style.height = Math.round(base * (LT_NAME_SCALE + LT_INFO_SCALE) * LT_LOGO_SCALE) + 'px';
      return;
    }
```

- [ ] **Step 6: Build and run the overlay specs, then the older overlay specs**

Run: `npm run build; npx playwright test smoke/overlay-lowerthird.spec.js smoke/overlay.spec.js smoke/overlay-timer.spec.js --timeout=15000 --reporter=list`
Expected: PASS (the 9 new specs plus the existing ones). If the "normal wide card again" spec fails, a layout class or inline size leaked from the lower third: fix the reset in `applyStyles`, not the spec.

- [ ] **Step 7: Run both suites and commit**

Run: `npm test; npx playwright test --timeout=15000`
Expected: PASS everywhere.

```bash
git add src smoke dist
git commit -m "feat: overlay renders a lower third as a reshaped card"
```

---

### Task 3: Plan item, validation and cursor

**Files:**
- Modify: `src/plan/extras.js`, `src/plan/model.js`, `src/plan/cursor.js`
- Test: `tests/plan/lowerthird.test.js`

**Interfaces:**
- Consumes: `isValidLogoName` (Task 1); existing `itemStatus` / `itemTitle` / `planSummary`.
- Produces: in `src/plan/extras.js`, `MAX_HIDE_AFTER = 3600`, `isValidLowerThird(item): boolean`, `describeLowerThird(item): string` (`'stays'` or `'hides after 8s'`), `lowerThirdFromInputs({ name, info, align, logo, hideAfter }): { ok: true, draft } | { ok: false, hint }` where `draft = { type: 'lowerthird', name, info, align, logo: string | null, hideAfter: number | null }` and `hideAfter` is the raw field text. In `src/plan/model.js`, `lowerThirdItem({ name, info, align, logo, hideAfter }, uid?)`. In `src/plan/cursor.js`, `itemStatus` returns `'ok'` for a valid lower third and `'unsupported'` for an invalid one; `itemTitle` returns the name, else the info.

- [ ] **Step 1: Write the failing tests.** `tests/plan/lowerthird.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isValidLowerThird, describeLowerThird, lowerThirdFromInputs, MAX_HIDE_AFTER } from '../../src/plan/extras.js';
import { lowerThirdItem, isPlanRecord, replaceItem } from '../../src/plan/model.js';
import { itemStatus, itemTitle, nextLoadable, planSummary } from '../../src/plan/cursor.js';

const library = { get: () => null };
const ok = { id: 'a', type: 'lowerthird', name: 'Pastor John', info: 'Guest speaker', align: 'left', logo: null, hideAfter: null };

describe('isValidLowerThird', () => {
  it('accepts name and info, either one alone, and the optional parts', () => {
    expect(isValidLowerThird(ok)).toBe(true);
    expect(isValidLowerThird({ ...ok, info: '' })).toBe(true);
    expect(isValidLowerThird({ ...ok, name: '' })).toBe(true);
    expect(isValidLowerThird({ ...ok, align: 'right', logo: 'john.png', hideAfter: 8 })).toBe(true);
    expect(isValidLowerThird({ ...ok, hideAfter: MAX_HIDE_AFTER })).toBe(true);
  });
  it('accepts a hand-written item that leaves out the optional parts', () => {
    expect(isValidLowerThird({ id: 'x', type: 'lowerthird', name: 'A' })).toBe(true);
  });
  it('rejects no text, bad placement, bad picture names and bad hide times', () => {
    expect(isValidLowerThird({ ...ok, name: '  ', info: '' })).toBe(false);
    expect(isValidLowerThird({ ...ok, name: 5 })).toBe(false);
    expect(isValidLowerThird({ ...ok, info: true })).toBe(false);
    expect(isValidLowerThird({ ...ok, align: 'diagonal' })).toBe(false);
    for (const logo of ['a/b.png', '../a.png', 'a.jpg', '']) expect(isValidLowerThird({ ...ok, logo })).toBe(false);
    for (const hideAfter of [0, -1, 1.5, MAX_HIDE_AFTER + 1, '8']) expect(isValidLowerThird({ ...ok, hideAfter })).toBe(false);
    expect(isValidLowerThird(null)).toBe(false);
  });
});

describe('describeLowerThird', () => {
  it('says how it goes away', () => {
    expect(describeLowerThird(ok)).toBe('stays');
    expect(describeLowerThird({ ...ok, hideAfter: 8 })).toBe('hides after 8s');
  });
});

describe('lowerThirdFromInputs', () => {
  const base = { name: ' Pastor John ', info: ' Guest speaker ', align: 'center', logo: '', hideAfter: '' };
  it('builds a draft, trimming text and turning blanks into null', () => {
    expect(lowerThirdFromInputs(base)).toEqual({ ok: true, draft: { type: 'lowerthird', name: 'Pastor John', info: 'Guest speaker', align: 'center', logo: null, hideAfter: null } });
    expect(lowerThirdFromInputs({ ...base, logo: 'john.png', hideAfter: ' 8 ' }).draft).toMatchObject({ logo: 'john.png', hideAfter: 8 });
  });
  it('needs some text', () => {
    expect(lowerThirdFromInputs({ ...base, name: '  ', info: '' })).toEqual({ ok: false, hint: 'Enter a name or some info.' });
  });
  it('explains a bad hide time', () => {
    for (const hideAfter of ['0', '3601', '1.5', '-2', 'soon']) {
      expect(lowerThirdFromInputs({ ...base, hideAfter })).toEqual({ ok: false, hint: 'Hide after must be 1 to 3600 seconds.' });
    }
  });
  it('falls back to left for an unknown placement', () => {
    expect(lowerThirdFromInputs({ ...base, align: 'up' }).draft.align).toBe('left');
  });
});

describe('lowerThirdItem', () => {
  it('builds an item with a prefixed id that a plan record accepts', () => {
    const item = lowerThirdItem({ name: ' A ', info: ' B ', align: 'right', logo: 'a.png', hideAfter: 5 }, () => 'u1');
    expect(item).toEqual({ id: 'i_u1', type: 'lowerthird', name: 'A', info: 'B', align: 'right', logo: 'a.png', hideAfter: 5 });
    expect(isPlanRecord({ v: 1, id: 'p', name: 'P', items: [item] })).toBe(true);
  });
  it('defaults placement, picture and hide time', () => {
    expect(lowerThirdItem({ name: 'A' }, () => 'u2')).toMatchObject({ align: 'left', logo: null, hideAfter: null, info: '' });
  });
  it('can be swapped in place with replaceItem', () => {
    const plan = { v: 1, id: 'p', name: 'P', items: [ok] };
    const next = replaceItem(plan, 'a', lowerThirdItem({ name: 'New' }, () => 'zz'));
    expect(next.items[0]).toMatchObject({ id: 'a', type: 'lowerthird', name: 'New' });
  });
});

describe('cursor', () => {
  it('loads valid lower thirds and treats invalid ones as unsupported', () => {
    expect(itemStatus(ok, library)).toBe('ok');
    expect(itemStatus({ ...ok, hideAfter: 0 }, library)).toBe('unsupported');
    expect(itemStatus({ ...ok, logo: 'a/b.png' }, library)).toBe('unsupported');
    expect(itemStatus({ ...ok, name: '', info: '' }, library)).toBe('unsupported');
  });
  it('titles by name, else info, else a plain word', () => {
    expect(itemTitle(ok, library)).toBe('Pastor John');
    expect(itemTitle({ ...ok, name: '' }, library)).toBe('Guest speaker');
    expect(itemTitle({ ...ok, hideAfter: 0 }, library)).toBe('Unsupported item');
  });
  it('Next item skips a bad one and the summary names the next good one', () => {
    const plan = { v: 1, id: 'p', name: 'P', items: [{ ...ok, id: 'bad', hideAfter: -3 }, ok] };
    expect(nextLoadable(plan, null, library).id).toBe('a');
    expect(planSummary(plan, null, library)).toBe('2 items · Next: Pastor John');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/plan/lowerthird.test.js`
Expected: FAIL (`isValidLowerThird`, `lowerThirdItem` and the cursor handling do not exist).

- [ ] **Step 3: Edit `src/plan/extras.js`.** Change the top import to `import { formatClock } from '../overlay/timer-clock.js';\nimport { isValidLogoName } from './logos.js';` and append at the end of the file:

```js

export const MAX_HIDE_AFTER = 3600;   // seconds
const ALIGNS = ['left', 'center', 'right'];
const textOrEmpty = (v) => (typeof v === 'string' ? v.trim() : '');

/** Valid when some text is present (strings only), the placement is known, the picture is a plain .png name, and hideAfter is in range. */
export function isValidLowerThird(item) {
  if (!item || typeof item !== 'object') return false;
  if ((item.name !== undefined && typeof item.name !== 'string') || (item.info !== undefined && typeof item.info !== 'string')) return false;
  if (!textOrEmpty(item.name) && !textOrEmpty(item.info)) return false;
  if (item.align !== undefined && !ALIGNS.includes(item.align)) return false;
  if (item.logo != null && !isValidLogoName(item.logo)) return false;
  if (item.hideAfter != null && !(Number.isInteger(item.hideAfter) && item.hideAfter >= 1 && item.hideAfter <= MAX_HIDE_AFTER)) return false;
  return true;
}

export const describeLowerThird = (item) => (item.hideAfter ? 'hides after ' + item.hideAfter + 's' : 'stays');

/** Read the lower third editor. hideAfter is the raw field text; blank means it stays until Hide. */
export function lowerThirdFromInputs({ name = '', info = '', align = 'left', logo = '', hideAfter = '' }) {
  const n = name.trim();
  const i = info.trim();
  if (!n && !i) return { ok: false, hint: 'Enter a name or some info.' };
  const raw = hideAfter.trim();
  let seconds = null;
  if (raw !== '') {
    seconds = WHOLE_NUMBER.test(raw) ? Number(raw) : NaN;
    if (!(seconds >= 1 && seconds <= MAX_HIDE_AFTER)) return { ok: false, hint: 'Hide after must be 1 to 3600 seconds.' };
  }
  return {
    ok: true,
    draft: { type: 'lowerthird', name: n, info: i, align: ALIGNS.includes(align) ? align : 'left', logo: logo || null, hideAfter: seconds },
  };
}
```

- [ ] **Step 4: Append to `src/plan/model.js`**

```js

export const lowerThirdItem = ({ name = '', info = '', align = 'left', logo = null, hideAfter = null }, uid = defaultUid) =>
  ({ id: 'i_' + uid(), type: 'lowerthird', name: name.trim(), info: info.trim(), align, logo, hideAfter });
```

- [ ] **Step 5: Edit `src/plan/cursor.js`.** Change the import to `import { isValidTimerSpec, describeTimerSpec, isValidLowerThird } from './extras.js';`. In `itemStatus`, directly before the final `return 'unsupported';` add `  if (item.type === 'lowerthird') return isValidLowerThird(item) ? 'ok' : 'unsupported';`. In `itemTitle`, directly after the `announcement` line add `  if (item.type === 'lowerthird') return (item.name || '').trim() || (item.info || '').trim();`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/plan; npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/plan tests/plan
git commit -m "feat: plan item for lower thirds"
```

---

### Task 4: The `logos/` picture store

**Files:**
- Create: `src/dock/plan/logo-store.js`
- Modify: `src/core/record-folder.js`, `tests/helpers/fake-dir.js`
- Test: `tests/dock/plan/logo-store.test.js`

**Interfaces:**
- Consumes: `isValidLogoName`, `logoFileName`, `fitSize` (Task 1); `MAX_LOGO_DATA_URL` from `src/core/state.js` (Task 1).
- Produces: in `src/core/record-folder.js`, `writeFileAtomic(dirHandle, name, data)` (the same swap-file write the record folders use; `data` may be a string or bytes). In `src/dock/plan/logo-store.js`, `encodeLogo(file): Promise<Uint8Array>` (browser: shrinks to 160 pixels, PNG bytes; throws `Error` with a plain message for a non-picture, an oversized or undecodable picture) and `createLogoStore({ onError?, encode? })` returning `{ attach(dirHandle): Promise<void>, detach(), available(): boolean, list(): string[], has(name): boolean, add(file): Promise<string>, read(name): Promise<string | null> }`. `add` returns the saved file name; `read` returns a `data:image/png;base64,...` URL, or `null` for a missing, unreadable or invalidly named file (an unexpected error also calls `onError`). `encode` defaults to `encodeLogo` and is injectable for tests.

- [ ] **Step 1: Teach the fake directory about binary files.** Replace `tests/helpers/fake-dir.js` with:

```js
const err = (name) => Object.assign(new Error(name), { name });

const bytesOf = (value) => {
  if (value instanceof Uint8Array) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new TextEncoder().encode(String(value)).buffer;
};

export function createFakeDir(initial = {}) {
  const files = new Map(Object.entries(initial));
  const readable = (name) => ({ text: async () => String(files.get(name)), arrayBuffer: async () => bytesOf(files.get(name)) });
  const dir = {
    name: 'songs',
    files,
    subdirs: new Map(),
    denied: false,
    guard() { if (dir.denied) throw err('NotAllowedError'); },
    async getDirectoryHandle(name, { create = false } = {}) {
      dir.guard();
      if (!dir.subdirs.has(name)) {
        if (!create) throw err('NotFoundError');
        dir.subdirs.set(name, createFakeDir());
      }
      return dir.subdirs.get(name);
    },
    async getFileHandle(name, { create = false } = {}) {
      dir.guard();
      if (!files.has(name)) {
        if (!create) throw err('NotFoundError');
        files.set(name, '');
      }
      return {
        kind: 'file',
        name,
        async getFile() { return readable(name); },
        async createWritable() {
          dir.guard();
          let buffer = '';
          return {
            async write(data) { buffer = typeof data === 'string' ? buffer + data : data; },
            async close() { files.set(name, buffer); },
            async abort() {},
          };
        },
      };
    },
    async removeEntry(name) {
      dir.guard();
      if (!files.has(name)) throw err('NotFoundError');
      files.delete(name);
    },
    async *values() {
      dir.guard();
      for (const name of [...files.keys()]) yield { kind: 'file', name, getFile: async () => readable(name) };
      for (const name of dir.subdirs.keys()) yield { kind: 'directory', name };
    },
  };
  return dir;
}
```

Run: `npx vitest run tests/songs tests/core tests/plan`
Expected: PASS (the helper change is backwards compatible).

- [ ] **Step 2: Write the failing test.** `tests/dock/plan/logo-store.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createLogoStore } from '../../../src/dock/plan/logo-store.js';
import { createFakeDir } from '../../helpers/fake-dir.js';

const bytes = (...n) => new Uint8Array(n);
const file = (name) => ({ name, type: 'image/png', size: 10 });
const dataUrl = (...n) => 'data:image/png;base64,' + btoa(String.fromCharCode(...n));

async function setup(opts = {}) {
  const dir = createFakeDir();
  const sub = await dir.getDirectoryHandle('logos', { create: true });
  const errors = [];
  const store = createLogoStore({ onError: (e) => errors.push(e), encode: async () => bytes(1, 2, 3), ...opts });
  return { dir, sub, errors, store };
}

describe('attach, list and has', () => {
  it('creates logos/ when missing and lists only plain .png files', async () => {
    const dir = createFakeDir();
    const store = createLogoStore();
    expect(store.available()).toBe(false);
    await store.attach(dir);
    expect(store.available()).toBe(true);
    expect(dir.subdirs.has('logos')).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('lists existing pictures in order and ignores other files', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('b.png', bytes(1));
    sub.files.set('a.png', bytes(1));
    sub.files.set('notes.txt', 'x');
    sub.files.set('photo.jpg', bytes(1));
    await store.attach(dir);
    expect(store.list()).toEqual(['a.png', 'b.png']);
    expect(store.has('a.png')).toBe(true);
    expect(store.has('c.png')).toBe(false);
  });

  it('detach forgets the folder', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('a.png', bytes(1));
    await store.attach(dir);
    store.detach();
    expect(store.available()).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.has('a.png')).toBe(false);
    expect(await store.read('a.png')).toBeNull();
  });
});

describe('add', () => {
  it('saves the encoded bytes under a safe .png name and returns it', async () => {
    const { dir, sub, store } = await setup();
    await store.attach(dir);
    const name = await store.add(file('Church Logo.jpg'));
    expect(name).toBe('Church_Logo.png');
    expect(sub.files.get('Church_Logo.png')).toEqual(bytes(1, 2, 3));
    expect(store.list()).toEqual(['Church_Logo.png']);
    expect(store.has(name)).toBe(true);
  });

  it('never overwrites an existing picture', async () => {
    const { dir, store } = await setup();
    await store.attach(dir);
    expect(await store.add(file('logo.png'))).toBe('logo.png');
    expect(await store.add(file('logo.png'))).toBe('logo (2).png');
    expect(store.list()).toEqual(['logo (2).png', 'logo.png']);
  });

  it('refuses without a folder, and passes on an encoder error unchanged', async () => {
    const none = createLogoStore();
    await expect(none.add(file('a.png'))).rejects.toThrow('library folder');
    const { dir, sub, store } = await setup({ encode: async () => { throw new Error('That file is not a picture.'); } });
    await store.attach(dir);
    await expect(store.add(file('a.txt'))).rejects.toThrow('That file is not a picture.');
    expect(sub.files.size).toBe(0);
    expect(store.list()).toEqual([]);
  });
});

describe('read', () => {
  it('returns the picture as a PNG data URL', async () => {
    const { dir, sub, store } = await setup();
    sub.files.set('a.png', bytes(137, 80, 78, 71));
    await store.attach(dir);
    expect(await store.read('a.png')).toBe(dataUrl(137, 80, 78, 71));
  });

  it('returns null for a missing file without reporting an error', async () => {
    const { dir, errors, store } = await setup();
    await store.attach(dir);
    expect(await store.read('gone.png')).toBeNull();
    expect(errors).toEqual([]);
  });

  it('returns null for a bad name without touching the folder', async () => {
    const { dir, sub, store } = await setup();
    await store.attach(dir);
    sub.getFileHandle = vi.fn();
    for (const bad of ['../a.png', 'a/b.png', 'a.jpg', '', null]) expect(await store.read(bad)).toBeNull();
    expect(sub.getFileHandle).not.toHaveBeenCalled();
  });

  it('returns null and reports an unexpected error such as a lost folder', async () => {
    const { dir, sub, errors, store } = await setup();
    sub.files.set('a.png', bytes(1));
    await store.attach(dir);
    sub.denied = true;
    expect(await store.read('a.png')).toBeNull();
    expect(errors).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/dock/plan/logo-store.test.js`
Expected: FAIL (`logo-store.js` cannot be resolved).

- [ ] **Step 4: Edit `src/core/record-folder.js`.** Directly above the comment that starts `/**\n * One JSON file per record in a user-chosen directory.` add:

```js
/** Write a file through a swap file, so a crash mid-write leaves the previous version intact. */
export async function writeFileAtomic(dirHandle, name, data) {
  const handle   = await dirHandle.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (err) {
    try { await writable.abort(); } catch { /* stream already closed; surface the original error */ }
    throw err;
  }
}

```
Then replace the inner function in `createRecordFolder`:
```js
  async function writeText(name, text) {
    const handle   = await dirHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (err) {
      try { await writable.abort(); } catch { /* stream already closed; surface the original error */ }
      throw err;
    }
  }
```
with
```js
  const writeText = (name, text) => writeFileAtomic(dirHandle, name, text);
```

- [ ] **Step 5: Create `src/dock/plan/logo-store.js`**

```js
import { writeFileAtomic } from '../../core/record-folder.js';
import { MAX_LOGO_DATA_URL } from '../../core/state.js';
import { isValidLogoName, logoFileName, fitSize } from '../../plan/logos.js';

const LOGOS_DIR = 'logos';
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;   // refuse huge originals before decoding them

/** Shrink a picture file to the logo size and encode it as PNG bytes. Runs in the browser. */
export async function encodeLogo(file) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('That file is not a picture.');
  if (file.size > MAX_PICTURE_BYTES) throw new Error('That picture is too large.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('That picture could not be read.'); }
  const size = fitSize(bitmap.width, bitmap.height);
  if (!size) throw new Error('That picture could not be read.');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('That picture could not be converted.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (Math.ceil(bytes.length / 3) * 4 > MAX_LOGO_DATA_URL) throw new Error('That picture is too detailed. Try a simpler one.');
  return bytes;
}

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

async function listNames(dir) {
  const names = [];
  for await (const entry of dir.values()) if (entry.kind === 'file' && isValidLogoName(entry.name)) names.push(entry.name);
  return names.sort();
}

/**
 * The pictures for lower thirds: PNG files in logos/ inside the library folder.
 * The overlay cannot read the folder, so the dock reads a picture here and sends
 * it inline with the lower third.
 */
export function createLogoStore({ onError = () => {}, encode = encodeLogo } = {}) {
  let dir = null;
  let names = [];

  return {
    async attach(dirHandle) {
      const logos = await dirHandle.getDirectoryHandle(LOGOS_DIR, { create: true });
      names = await listNames(logos);
      dir = logos;
    },
    detach() { dir = null; names = []; },
    available: () => dir !== null,
    list: () => names.slice(),
    has: (name) => names.includes(name),
    async add(file) {
      if (!dir) throw new Error('Choose a library folder first.');
      const bytes = await encode(file);
      const name = logoFileName(file.name, names);
      await writeFileAtomic(dir, name, bytes);
      names = [...names, name].sort();
      return name;
    },
    async read(name) {
      if (!dir || !isValidLogoName(name)) return null;
      try {
        const handle = await dir.getFileHandle(name);
        const file = await handle.getFile();
        return 'data:image/png;base64,' + toBase64(new Uint8Array(await file.arrayBuffer()));
      } catch (err) {
        if (err.name !== 'NotFoundError') onError(err);
        return null;
      }
    },
  };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/dock/plan/logo-store.test.js; npm test`
Expected: PASS (the existing `tests/core/record-folder.test.js` and `tests/songs/folder.test.js` still pass through the refactor).

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: logos folder store for lower third pictures"
```

---

### Task 5: Session tab, the lower third tab and the automatic hide

**Files:**
- Modify: `src/dock/live/session.js`, `src/dock/live/live-bar.js`, `src/dock/plan/extras-tab.js`, `src/dock/main.js`
- Test: `tests/dock/live/session-lowerthird.test.js`, `tests/dock/plan/lowerthird-tab.test.js`

**Interfaces:**
- Consumes: `createLogoStore` (Task 4); `isValidLowerThird` is not needed here (the plan tab validates before loading).
- Produces: `createSession` accepts a provider for the tab name `lowerthird` (kind `lowerthird`) and keeps the `lowerthird` field in the on-air snapshot. `initExtrasTab` now also accepts `{ logoStore = null, setTimer = setTimeout, clearTimer = clearTimeout }` and returns `{ announcement, timer, lowerthird }`. `tabs.lowerthird` has `load(item): boolean` (item shape from Task 3; `false` when there is no text), `ready(): Promise<void>` (resolves when the picture read is done), `getContent(): { title, body, lowerthird: { align, logo } }`, `preview()`, `markShown()` (arms the automatic hide), `step()`. The live bar's Show waits for `tab.ready()` when the tab has one.

- [ ] **Step 1: Write the failing tests.** `tests/dock/live/session-lowerthird.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createSession } from '../../../src/dock/live/session.js';

function setup() {
  const sent = [];
  let content = { title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'center', logo: 'data:image/png;base64,AAAA' } };
  const session = createSession({
    transport: { send: (s) => { sent.push(s); return s; } },
    readSettings: () => ({ theme: 'frosted' }),
    providers: { lowerthird: () => content },
  });
  return { session, sent, setContent: (c) => { content = c; } };
}

describe('lowerthird tab', () => {
  it('is a known tab and sends the lowerthird kind with its field', () => {
    const { session, sent } = setup();
    session.setTab('lowerthird');
    expect(session.activeTab).toBe('lowerthird');
    session.show();
    expect(sent.at(-1)).toMatchObject({ action: 'show', kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'center', logo: 'data:image/png;base64,AAAA' } });
  });

  it('a restyle re-sends the same picture and placement, even if another one was loaded since', () => {
    const { session, sent, setContent } = setup();
    session.setTab('lowerthird');
    session.show();
    setContent({ title: 'Someone Else', body: '', lowerthird: { align: 'right', logo: null } });
    session.resendIfLive();
    expect(sent.at(-1)).toMatchObject({ title: 'Pastor John', lowerthird: { align: 'center', logo: 'data:image/png;base64,AAAA' } });
  });
});
```

`tests/dock/plan/lowerthird-tab.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { initExtrasTab } from '../../../src/dock/plan/extras-tab.js';

const LOGO = 'data:image/png;base64,AAAA';
const item = (extra = {}) => ({ id: 'i', type: 'lowerthird', name: ' Pastor John ', info: ' Guest speaker ', align: 'center', logo: null, hideAfter: null, ...extra });

function setup({ withStore = true } = {}) {
  const timers = [];
  const session = { isLive: false, liveTab: null, activeTab: 'lowerthird', hide: vi.fn(), updateLive: vi.fn() };
  const logoStore = withStore ? { read: vi.fn(async (name) => (name === 'john.png' ? LOGO : null)) } : null;
  const refresh = vi.fn();
  const tabs = initExtrasTab({
    session, refresh, startTicker: false, logoStore,
    setTimer: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimer: (handle) => { timers[handle].cleared = true; },
  });
  const fire = (index = timers.length - 1) => { if (!timers[index].cleared) timers[index].fn(); };
  return { tab: tabs.lowerthird, session, logoStore, timers, fire, refresh };
}

describe('loading and content', () => {
  it('loads trimmed text and reports whether there is any', () => {
    const { tab } = setup();
    expect(tab.preview().has).toBe(false);
    expect(tab.load(item())).toBe(true);
    expect(tab.getContent()).toEqual({ title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'center', logo: null } });
    expect(tab.preview()).toMatchObject({ has: true, text: 'Pastor John', sub: 'Lower third · Guest speaker', canNav: false });
    expect(tab.load(item({ name: '', info: '' }))).toBe(false);
  });

  it('previews with just the info when there is no name', () => {
    const { tab } = setup();
    tab.load(item({ name: '' }));
    expect(tab.preview()).toMatchObject({ has: true, text: 'Guest speaker', sub: 'Lower third' });
  });
});

describe('the picture', () => {
  it('is read in the background and ready() resolves once it has arrived', async () => {
    const { tab, logoStore } = setup();
    tab.load(item({ logo: 'john.png' }));
    expect(tab.getContent().lowerthird.logo).toBeNull();
    await tab.ready();
    expect(logoStore.read).toHaveBeenCalledWith('john.png');
    expect(tab.getContent().lowerthird.logo).toBe(LOGO);
  });

  it('a missing file leaves the text and no picture', async () => {
    const { tab } = setup();
    tab.load(item({ logo: 'gone.png' }));
    await tab.ready();
    expect(tab.getContent()).toMatchObject({ title: 'Pastor John', lowerthird: { logo: null } });
  });

  it('with no logo store the text still loads and ready() resolves', async () => {
    const { tab } = setup({ withStore: false });
    expect(tab.load(item({ logo: 'john.png' }))).toBe(true);
    await tab.ready();
    expect(tab.getContent().lowerthird.logo).toBeNull();
  });

  it('a slow read for an earlier item never lands on a later one', async () => {
    const { tab, logoStore } = setup();
    let release;
    logoStore.read.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(LOGO); }));
    tab.load(item({ logo: 'john.png' }));
    tab.load(item({ name: 'Someone Else', logo: null }));
    release();
    await tab.ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tab.getContent()).toMatchObject({ title: 'Someone Else', lowerthird: { logo: null } });
  });
});

describe('the automatic hide', () => {
  it('arms a timer at Show and hides once when it fires while that lower third is on air', () => {
    const { tab, session, timers, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(8000);
    session.isLive = true;
    session.liveTab = 'lowerthird';
    fire();
    expect(session.hide).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no hide time', () => {
    const { tab, timers } = setup();
    tab.load(item());
    tab.markShown();
    expect(timers).toHaveLength(0);
  });

  it('does nothing if Hide was pressed first', () => {
    const { tab, session, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    session.isLive = false;
    session.liveTab = 'lowerthird';
    fire();
    expect(session.hide).not.toHaveBeenCalled();
  });

  it('does nothing if something else is on air by then (another card, or Clear)', () => {
    const { tab, session, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    session.isLive = true;
    session.liveTab = 'announcement';
    fire();
    session.liveTab = null;
    fire();
    expect(session.hide).not.toHaveBeenCalled();
  });

  it('a newer Show cancels the older timer, so only the newest can hide', () => {
    const { tab, session, timers, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    tab.load(item({ name: 'Second', hideAfter: 20 }));
    tab.markShown();
    expect(timers[0].cleared).toBe(true);
    session.isLive = true;
    session.liveTab = 'lowerthird';
    timers[0].fn();
    expect(session.hide).not.toHaveBeenCalled();
    fire(1);
    expect(session.hide).toHaveBeenCalledTimes(1);
  });

  it('a newer Show with no hide time cancels the older timer', () => {
    const { tab, session, timers } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    tab.load(item({ name: 'Stays' }));
    tab.markShown();
    expect(timers[0].cleared).toBe(true);
    session.isLive = true;
    session.liveTab = 'lowerthird';
    timers[0].fn();
    expect(session.hide).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/dock/live/session-lowerthird.test.js tests/dock/plan/lowerthird-tab.test.js`
Expected: FAIL (`session` ignores the `lowerthird` tab name; `tabs.lowerthird` is undefined).

- [ ] **Step 3: Edit `src/dock/live/session.js`.**

(a) Replace `const KIND_OF = { scripture: 'verse', songs: 'song', announcement: 'announcement', timer: 'timer' };` with `const KIND_OF = { scripture: 'verse', songs: 'song', announcement: 'announcement', timer: 'timer', lowerthird: 'lowerthird' };`.
(b) Replace `s.liveContent = { kind: state.kind, title: state.title, reference: state.reference, body: state.body, timer: state.timer };` with `s.liveContent = { kind: state.kind, title: state.title, reference: state.reference, body: state.body, timer: state.timer, lowerthird: state.lowerthird };`.

- [ ] **Step 4: Edit `src/dock/plan/extras-tab.js`.**

(a) Replace the signature `export function initExtrasTab({ session, refresh, now = Date.now, startTicker = true }) {` with:
```js
export function initExtrasTab({
  session, refresh, now = Date.now, startTicker = true, logoStore = null, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
```
(b) Directly before the `// Display only: the dock's own digits follow the clock once a second.` comment add:

```js
  // ── Lower third ──────────────────────────────────────────────────────────
  let lowerThird = { name: '', info: '', align: 'left', logo: null, hideAfter: null };
  let logoData = null;                    // the picture as a data URL, once it has been read
  let logoPending = Promise.resolve();    // resolves when the picture read for the loaded item is done
  let hideToken = 0;                      // identifies the Show that armed the automatic hide
  let hideHandle = null;

  const lowerThirdTab = {
    load(item) {
      const wanted = item.logo || null;
      lowerThird = { name: (item.name || '').trim(), info: (item.info || '').trim(), align: item.align || 'left', logo: wanted, hideAfter: item.hideAfter || null };
      logoData = null;
      logoPending = wanted && logoStore
        ? logoStore.read(wanted).catch(() => null).then((data) => { if (lowerThird.logo === wanted) logoData = data; refresh(); })
        : Promise.resolve();
      refresh();
      return lowerThird.name.length > 0 || lowerThird.info.length > 0;
    },
    /** Show waits for this, so a lower third never goes on air before its picture has been read. */
    ready: () => logoPending,
    getContent: () => ({ title: lowerThird.name, body: lowerThird.info, lowerthird: { align: lowerThird.align, logo: logoData } }),
    preview() {
      const text = lowerThird.name || lowerThird.info;
      if (!text) return { ...NOTHING, sub: 'Lower third' };
      return { has: true, text, sub: 'Lower third' + (lowerThird.name && lowerThird.info ? ' · ' + lowerThird.info : ''), canNav: false };
    },
    /** Show arms the automatic hide. It only fires for this Show, and only while this lower third is still on air. */
    markShown() {
      hideToken += 1;
      const mine = hideToken;
      if (hideHandle !== null) { clearTimer(hideHandle); hideHandle = null; }
      if (!lowerThird.hideAfter) return;
      hideHandle = setTimer(() => {
        hideHandle = null;
        if (mine === hideToken && session.isLive && session.liveTab === 'lowerthird') session.hide();
      }, lowerThird.hideAfter * 1000);
    },
    step() {},
  };

```
(c) Replace `return { announcement: announcementTab, timer: timerTab };` with `return { announcement: announcementTab, timer: timerTab, lowerthird: lowerThirdTab };`.

- [ ] **Step 5: Edit `src/dock/live/live-bar.js`.**

(a) In `NEEDS`, after `  timer: 'Set up the timer first.',` add `  lowerthird: 'Write the lower third first.',`. In `LIVE_MSG`, after `  timer: 'Timer is running.',` add `  lowerthird: 'Lower third is live.',`. After the `LIVE_MSG` object add `const LIVE_NAME = { announcement: 'Announcement', timer: 'Timer', lowerthird: 'Lower third' };`.
(b) In `liveLabel`, replace
```js
    if (session.liveTab === 'announcement' || session.liveTab === 'timer') {
      const name = session.liveTab === 'timer' ? 'Timer' : 'Announcement';
```
with
```js
    if (LIVE_NAME[session.liveTab]) {
      const name = LIVE_NAME[session.liveTab];
```
(c) Replace the Show handler's opening
```js
  btnShow.addEventListener('click', () => {
    const tab = activeTab();
    if (!tab || !tab.preview().has) {
      setStatus(NEEDS[session.activeTab] || 'Nothing to show.', 'error');
      return;
    }
    if (tab.markShown) tab.markShown();
    session.show();
```
with
```js
  btnShow.addEventListener('click', async () => {
    const tab = activeTab();
    const name = session.activeTab;
    if (!tab || !tab.preview().has) {
      setStatus(NEEDS[name] || 'Nothing to show.', 'error');
      return;
    }
    if (tab.ready) {   // a lower third waits for its picture to be read
      await tab.ready();
      if (session.activeTab !== name) return;
    }
    if (tab.markShown) tab.markShown();
    session.show();
```

- [ ] **Step 6: Edit `src/dock/main.js`.**

(a) After `import { initExtrasTab } from './plan/extras-tab.js';` add `import { createLogoStore } from './plan/logo-store.js';`.
(b) In the providers, after the `timer:` provider line add:
```js
        lowerthird: () => (tabs.lowerthird ? tabs.lowerthird.getContent() : { ...EMPTY_SONG, lowerthird: { align: 'left', logo: null } }),
```
(c) Replace
```js
    const extras = initExtrasTab({ session, refresh: () => liveBar.refresh() });
    tabs.announcement = extras.announcement;
    tabs.timer = extras.timer;
```
with
```js
    const logoStore = createLogoStore({ onError: report('logos') });
    const extras = initExtrasTab({ session, refresh: () => liveBar.refresh(), logoStore });
    tabs.announcement = extras.announcement;
    tabs.timer = extras.timer;
    tabs.lowerthird = extras.lowerthird;
```
(d) Replace the `onFolderChange` body
```js
        if (handle) await planStore.attach(handle);
        else planStore.detach();
        tabs.plan.reload();
```
with
```js
        if (handle) {
          await planStore.attach(handle);
          try { await logoStore.attach(handle); } catch (err) { report('logos')(err); }
        } else {
          planStore.detach();
          logoStore.detach();
        }
        tabs.plan.reload();
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/dock; npm test`
Expected: PASS, including the older session and extras-tab tests.

- [ ] **Step 8: Build, check nothing regressed, commit**

Run: `npm run build; npx playwright test --timeout=15000 --reporter=list`
Expected: PASS (the existing suite plus the Task 2 specs; nothing in the browser uses the new tab yet).

```bash
git add src tests dist
git commit -m "feat: lower third tab with picture loading and automatic hide"
```

---

### Task 6: The editor, plan integration and Show now

**Files:**
- Modify: `src/html/dock.html`, `src/css/dock/extras.css`, `src/dock/plan/extras-editor.js`, `src/dock/plan/plan-tab.js`, `src/dock/main.js`
- Test: `smoke/lowerthird.spec.js`

**Interfaces:**
- Consumes: `lowerThirdFromInputs`, `describeLowerThird` (Task 3); `lowerThirdItem` (Task 3); `createLogoStore` API (Task 4); `tabs.lowerthird` with `load`, `ready`, `markShown` (Task 5).
- Produces: DOM ids `btn-plan-add-lowerthird`, `ed-title-field`, `ed-lowerthird-fields`, `ed-lt-name`, `ed-lt-info`, `ed-lt-align` (buttons with `data-value` left / center / right), `ed-lt-hide`, `ed-lt-logo`, `ed-lt-add-logo`, `ed-lt-file`, `ed-lt-logo-hint`. `initExtrasEditor({ logoStore, onAdd, onSave, onShowNow })` now also opens for `type: 'lowerthird'`. `initPlanTab` takes a `logoStore` option. Plan rows for lower thirds: icon ▭, title = name (else info), status `stays`, `hides after 8s` or `picture missing`.

- [ ] **Step 1: Write the failing browser specs.** Create `smoke/lowerthird.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { openPair } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const titles = (dock) => dock.locator('.plan-item .plan-title').allTextContents();

async function openEditor(dock) {
  await dock.click('#tab-plan');
  await dock.click('#btn-plan-add-lowerthird');
  await expect(dock.locator('#extras-editor')).toBeVisible();
}

async function fillLowerThird(dock, { name = '', info = '', hide = '' }) {
  await dock.fill('#ed-lt-name', name);
  await dock.fill('#ed-lt-info', info);
  await dock.fill('#ed-lt-hide', hide);
}

async function useFolder(context, dock) {
  await dock.click('#tab-songs');
  await dock.click('#btn-tools');
  await dock.click('#tool-choose-folder');
  await expect(dock.locator('#library-banner')).toBeHidden();
}

const folderInit = (context) => context.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });

async function addPicture(dock, name = 'Church Logo.png') {
  await dock.setInputFiles('#ed-lt-file', { name, mimeType: 'image/png', buffer: PNG });
}

test.describe('lower thirds: showing', () => {
  test('Show now puts a lower third on air at the bottom left without touching the plan', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await expect(dock.locator('#ed-show')).toBeDisabled();
    await expect(dock.locator('#ed-hint')).toHaveText('Enter a name or some info.');
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await expect(overlay.locator('#ov-body')).toHaveText('Guest speaker');
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    await expect(dock.locator('#status-what')).toHaveText('Lower third · Pastor John');
    await expect(dock.locator('#extras-editor')).toBeHidden();
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
    const box = await overlay.locator('#card').boundingBox();
    expect(box.x).toBeLessThan(110);
  });

  test('the placement switch moves the bar', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John' });
    await dock.click('#ed-lt-align button[data-value="center"]');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.lt-center')).toHaveCount(1);
  });

  test('Add to plan makes a row that Next item loads and Show puts on air', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-add');
    expect(await titles(dock)).toEqual(['Pastor John']);
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Pastor John');
    await expect(dock.locator('#preview-sub')).toHaveText('Lower third · Guest speaker');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
  });

  test('it replaces a card that was up, and a card replaces it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-plan');
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Welcome everyone');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-announcement')).toHaveCount(1);
    await dock.click('#btn-plan-add-lowerthird');
    await fillLowerThird(dock, { name: 'Pastor John' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(1);
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Welcome back');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-announcement')).toHaveCount(1);
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(0);
  });
});

test.describe('lower thirds: the automatic hide', () => {
  test('hides itself after the set time', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', hide: '2' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1, { timeout: 6000 });
    await expect(dock.locator('#status-pill')).toHaveText('HIDDEN');
  });

  test('stays put with no time set', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John' });
    await dock.click('#ed-show');
    await dock.waitForTimeout(3000);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
  });

  test('never hides a different card that replaced it, or one shown after Hide', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', hide: '2' });
    await dock.click('#ed-show');
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Stays up');
    await dock.click('#ed-show');
    await dock.waitForTimeout(3500);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#ov-body')).toHaveText('Stays up');
    await dock.click('#btn-plan-add-lowerthird');
    await fillLowerThird(dock, { name: 'Second', hide: '2' });
    await dock.click('#ed-show');
    await dock.click('#btn-hide');
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Also stays');
    await dock.click('#ed-show');
    await dock.waitForTimeout(3500);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#ov-body')).toHaveText('Also stays');
  });

  test('a bad hide time disables the buttons and says why', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', hide: '5000' });
    await expect(dock.locator('#ed-hint')).toHaveText('Hide after must be 1 to 3600 seconds.');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await dock.fill('#ed-lt-hide', '');
    await expect(dock.locator('#ed-add')).toBeEnabled();
  });
});

test.describe('lower thirds: pictures', () => {
  test('without a library folder the picture controls are disabled and say why', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-logo')).toBeDisabled();
    await expect(dock.locator('#ed-lt-add-logo')).toBeDisabled();
    await expect(dock.locator('#ed-lt-logo-hint')).toContainText('Choose a library folder');
  });

  test('a picture added through the folder is saved there and shown beside the text', async ({ context }) => {
    await folderInit(context);
    const { dock, overlay } = await openPair(context);
    await useFolder(context, dock);
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-logo')).toBeEnabled();
    await addPicture(dock);
    await expect(dock.locator('#ed-lt-logo option:checked')).toHaveText('Church_Logo.png');
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    await expect(overlay.locator('#ov-logo')).toBeVisible();
    expect(await overlay.locator('#ov-logo').getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    const saved = await dock.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('logos');
      const names = [];
      for await (const entry of dir.values()) names.push(entry.name);
      return names;
    });
    expect(saved).toEqual(['Church_Logo.png']);
  });

  test('a planned picture is read at Next item and is on air at Show, with no race', async ({ context }) => {
    await folderInit(context);
    const { dock, overlay } = await openPair(context);
    await useFolder(context, dock);
    await openEditor(dock);
    await addPicture(dock);
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
  });

  test('a missing picture file still shows the name and says so on the row', async ({ context }) => {
    const seeded = { v: 1, id: 'p_seed', name: 'Seeded', items: [
      { id: 'i_lt', type: 'lowerthird', name: 'Pastor John', info: 'Guest speaker', align: 'left', logo: 'gone.png', hideAfter: null },
    ] };
    await context.addInitScript(([key, lastKey, value]) => {
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify([value])); localStorage.setItem(lastKey, value.id); }
    }, ['obs-stage-plans', 'obs-stage-last-plan', seeded]);
    const { dock, overlay } = await openPair(context);
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('picture missing');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await expect(overlay.locator('#ov-body')).toHaveText('Guest speaker');
    await expect(overlay.locator('#ov-logo')).toBeHidden();
  });
});

test.describe('lower thirds: editing and layout', () => {
  test('Edit from the row menu is filled in, and Save updates the row', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock);
    await dock.click('#ed-lt-align button[data-value="right"]');
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker', hide: '8' });
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('hides after 8s');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await expect(dock.locator('#ed-heading')).toHaveText('Edit lower third');
    await expect(dock.locator('#ed-lt-name')).toHaveValue('Pastor John');
    await expect(dock.locator('#ed-lt-info')).toHaveValue('Guest speaker');
    await expect(dock.locator('#ed-lt-hide')).toHaveValue('8');
    await expect(dock.locator('#ed-lt-align button[data-value="right"]')).toHaveClass('on');
    await dock.fill('#ed-lt-hide', '');
    await dock.fill('#ed-lt-info', 'Visiting pastor');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-sub')).toHaveText('Lower third · Visiting pastor');
  });

  test('the five add buttons and the editor fit a 380px dock', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.setViewportSize({ width: 380, height: 720 });
    await dock.click('#tab-plan');
    for (const id of ['song', 'verse', 'announcement', 'timer', 'lowerthird']) await expect(dock.locator('#btn-plan-add-' + id)).toBeVisible();
    const sideways = () => dock.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    await dock.click('#btn-plan-add-lowerthird');
    await fillLowerThird(dock, { name: 'A very long name that keeps going and going on and on', info: 'And an equally long title line for the guest', hide: '8' });
    expect(await sideways()).toBe(false);
  });
});
```

- [ ] **Step 2: Build and run them to verify they fail**

Run: `npm run build; npx playwright test smoke/lowerthird.spec.js --timeout=5000 --max-failures=2 --reporter=list`
Expected: FAIL (`#btn-plan-add-lowerthird` does not exist).

- [ ] **Step 3: Edit `src/html/dock.html`.**

(a) After the line `<button id="btn-plan-add-timer" class="btn btn-ghost" type="button">+ Timer</button>` add (same indentation) `<button id="btn-plan-add-lowerthird" class="btn btn-ghost" type="button">+ Lower third</button>`.
(b) Replace the line `<label class="lbl" for="ed-title">Title <span class="faint">(optional)</span></label>` with `<div id="ed-title-field"><label class="lbl" for="ed-title">Title <span class="faint">(optional)</span></label>` and the line `<input id="ed-title" class="field" type="text" autocomplete="off" spellcheck="false">` with `<input id="ed-title" class="field" type="text" autocomplete="off" spellcheck="false"></div>`.
(c) Directly before the line `<p id="ed-hint" class="faint"></p>` insert:

```html
      <div id="ed-lowerthird-fields" class="hidden">
        <label class="lbl" for="ed-lt-name">Name</label>
        <input id="ed-lt-name" class="field" type="text" autocomplete="off" spellcheck="false" placeholder="Pastor John">
        <label class="lbl" for="ed-lt-info">Info</label>
        <input id="ed-lt-info" class="field" type="text" autocomplete="off" spellcheck="false" placeholder="Guest speaker">
        <div id="ed-lt-align" class="seg" role="group" aria-label="Placement">
          <button type="button" data-value="left">Left</button>
          <button type="button" data-value="center">Centre</button>
          <button type="button" data-value="right">Right</button>
        </div>
        <label class="lbl" for="ed-lt-hide">Hide after (seconds; blank stays until Hide)</label>
        <input id="ed-lt-hide" class="field" type="number" min="1" max="3600" inputmode="numeric">
        <label class="lbl" for="ed-lt-logo">Picture</label>
        <div class="row">
          <select id="ed-lt-logo" class="sel" aria-label="Picture"></select>
          <button id="ed-lt-add-logo" class="btn btn-ghost" type="button">Add picture...</button>
        </div>
        <input id="ed-lt-file" type="file" accept="image/*" class="hidden">
        <p id="ed-lt-logo-hint" class="faint"></p>
      </div>
```

- [ ] **Step 4: Append to `src/css/dock/extras.css`**

```css

#ed-lt-align { margin: 4px 0; }
#ed-lt-logo { min-width: 0; }
```

- [ ] **Step 5: Replace `src/dock/plan/extras-editor.js`** with:

```js
import { $ } from '../shared/util.js';
import { announcementFromInputs, timerFromInputs, lowerThirdFromInputs } from '../../plan/extras.js';

const NO_FOLDER_HINT = 'Choose a library folder in Songs > Library tools to use pictures.';
const NAMES = { announcement: 'announcement', timer: 'timer', lowerthird: 'lower third' };

/**
 * The inline editor for announcements, timers and lower thirds. It only reads
 * and validates the fields; what to do with a valid draft (add, save, show now)
 * is decided by the callbacks.
 */
export function initExtrasEditor({ logoStore, onAdd, onSave, onShowNow }) {
  const root = $('extras-editor'), heading = $('ed-heading'), titleField = $('ed-title-field'), title = $('ed-title'), text = $('ed-text'),
        announcementFields = $('ed-announcement-fields'), timerFields = $('ed-timer-fields'), lowerFields = $('ed-lowerthird-fields'),
        modeButtons = [...document.querySelectorAll('#ed-mode button')],
        durationFields = $('ed-duration-fields'), clockFields = $('ed-clock-fields'),
        minutes = $('ed-minutes'), seconds = $('ed-seconds'), clock = $('ed-clock'),
        ltName = $('ed-lt-name'), ltInfo = $('ed-lt-info'), ltHide = $('ed-lt-hide'), ltLogo = $('ed-lt-logo'),
        ltAddLogo = $('ed-lt-add-logo'), ltFile = $('ed-lt-file'), ltLogoHint = $('ed-lt-logo-hint'),
        alignButtons = [...document.querySelectorAll('#ed-lt-align button')],
        hint = $('ed-hint'), btnAdd = $('ed-add'), btnShow = $('ed-show'), btnCancel = $('ed-cancel');

  let type = 'announcement';
  let mode = 'duration';
  let align = 'left';
  let editingId = null;

  function read() {
    if (type === 'announcement') return announcementFromInputs({ title: title.value, body: text.value });
    if (type === 'timer') return timerFromInputs({ mode, title: title.value, minutes: minutes.value, seconds: seconds.value, clock: clock.value });
    return lowerThirdFromInputs({ name: ltName.value, info: ltInfo.value, align, logo: ltLogo.value, hideAfter: ltHide.value });
  }

  function setPressed(buttons, value) {
    buttons.forEach((button) => {
      const on = button.dataset.value === value;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function setMode(next) {
    mode = next;
    setPressed(modeButtons, mode);
    durationFields.classList.toggle('hidden', mode !== 'duration');
    clockFields.classList.toggle('hidden', mode !== 'clock');
  }

  function setAlign(next) {
    align = next;
    setPressed(alignButtons, align);
  }

  /** The picture drop-down: No picture, the files in logos/, and a missing one the item still points at. */
  function fillLogos(selected) {
    const names = logoStore.list();
    const choices = selected && !names.includes(selected) ? [...names, selected] : names;
    ltLogo.replaceChildren(...['', ...choices].map((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name === '' ? 'No picture' : (names.includes(name) ? name : name + ' (missing)');
      return option;
    }));
    ltLogo.value = selected || '';
    const usable = logoStore.available();
    ltLogo.disabled = !usable;
    ltAddLogo.disabled = !usable;
    ltLogoHint.textContent = usable ? '' : NO_FOLDER_HINT;
  }

  function update() {
    const result = read();
    hint.textContent = result.ok ? '' : result.hint;
    btnAdd.disabled = !result.ok;
    btnShow.disabled = !result.ok;
  }

  function close() {
    root.classList.add('hidden');
    editingId = null;
  }

  function open({ type: nextType, item = null }) {
    type = nextType;
    editingId = item ? item.id : null;
    heading.textContent = (item ? 'Edit ' : 'New ') + NAMES[type];
    titleField.classList.toggle('hidden', type === 'lowerthird');
    announcementFields.classList.toggle('hidden', type !== 'announcement');
    timerFields.classList.toggle('hidden', type !== 'timer');
    lowerFields.classList.toggle('hidden', type !== 'lowerthird');
    title.value = item && type !== 'lowerthird' ? (item.title || '') : '';
    text.value = item && type === 'announcement' ? (item.body || '') : '';
    setMode(item && item.mode === 'clock' ? 'clock' : 'duration');
    const total = item && item.mode === 'duration' && Number.isInteger(item.seconds) && item.seconds > 0 ? item.seconds : 0;
    minutes.value = total ? String(Math.floor(total / 60)) : '';
    seconds.value = total ? String(total % 60) : '';
    clock.value = item && item.mode === 'clock' ? (item.at || '') : '';
    ltName.value = item && type === 'lowerthird' ? (item.name || '') : '';
    ltInfo.value = item && type === 'lowerthird' ? (item.info || '') : '';
    ltHide.value = item && type === 'lowerthird' && item.hideAfter ? String(item.hideAfter) : '';
    setAlign(item && type === 'lowerthird' && item.align ? item.align : 'left');
    fillLogos(item && type === 'lowerthird' ? (item.logo || '') : '');
    btnAdd.textContent = item ? 'Save' : 'Add to plan';
    root.classList.remove('hidden');
    update();
    ({ announcement: text, timer: minutes, lowerthird: ltName })[type].focus();
  }

  [title, text, minutes, seconds, clock, ltName, ltInfo, ltHide].forEach((field) => field.addEventListener('input', update));
  ltLogo.addEventListener('change', update);
  modeButtons.forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.value); update(); }));
  alignButtons.forEach((button) => button.addEventListener('click', () => { setAlign(button.dataset.value); update(); }));

  ltAddLogo.addEventListener('click', () => ltFile.click());
  ltFile.addEventListener('change', async () => {
    const file = ltFile.files[0];
    ltFile.value = '';
    if (!file) return;
    try {
      const name = await logoStore.add(file);
      fillLogos(name);
      update();
    } catch (err) {
      ltLogoHint.textContent = err.message || 'That picture could not be added.';
    }
  });

  btnAdd.addEventListener('click', () => {
    const result = read();
    if (!result.ok) return;
    if (editingId) onSave(result.draft, editingId);
    else onAdd(result.draft);
    close();
  });
  btnShow.addEventListener('click', () => {
    const result = read();
    if (!result.ok) return;
    onShowNow(result.draft);
    close();
  });
  btnCancel.addEventListener('click', close);
  // Escape closes the editor and does not also reach the Hide shortcut.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });

  return { open, close, isOpen: () => !root.classList.contains('hidden') };
}
```

- [ ] **Step 6: Edit `src/dock/plan/plan-tab.js`.**

(a) Replace the model import's `announcementItem, timerItem,` with `announcementItem, timerItem, lowerThirdItem,` and the extras import `import { describeTimerSpec } from '../../plan/extras.js';` with `import { describeTimerSpec, describeLowerThird } from '../../plan/extras.js';`.
(b) Replace `const TYPE_ICON = { song: '♫', reading: '✝', announcement: '✎', timer: '⏱' };` with `const TYPE_ICON = { song: '♫', reading: '✝', announcement: '✎', timer: '⏱', lowerthird: '▭' };` and add below it:
```js
const SHOW_NOW_MESSAGE = { announcement: 'Announcement is live.', timer: 'Timer is running.', lowerthird: 'Lower third is live.' };
```
(c) Replace the signature `export function initPlanTab({ session, store, library, tabs, setStatus, showView, refresh, report }) {` with `export function initPlanTab({ session, store, library, tabs, logoStore, setStatus, showView, refresh, report }) {`.
(d) Replace
```js
  const draftItem = (draft) => (draft.type === 'announcement' ? announcementItem(draft) : timerItem(draft));
```
with
```js
  const DRAFT_ITEM = { announcement: announcementItem, timer: timerItem, lowerthird: lowerThirdItem };
  const draftItem = (draft) => DRAFT_ITEM[draft.type](draft);
```
(e) Replace the whole `showNow` function (from the comment `/** Put a draft on air right now. The plan is not touched. */` through its closing brace) with:
```js
  /** Put a draft on air right now. The plan is not touched. */
  async function showNow(draft) {
    const tab = tabs[draft.type];
    if (!tab.load(draftItem(draft))) { setStatus('That could not be loaded.', 'error'); return; }
    session.setTab(draft.type);
    if (tab.ready) await tab.ready();   // a lower third waits for its picture
    if (tab.markShown) tab.markShown();
    session.show();
    setStatus(SHOW_NOW_MESSAGE[draft.type], 'success');
  }
```
(f) Replace `const editor = initExtrasEditor({` with `const editor = initExtrasEditor({\n    logoStore,`.
(g) In `statusText`, directly before `if (item.type === 'announcement') return 'announcement';` add:
```js
    if (item.type === 'lowerthird') return item.logo && !logoStore.has(item.logo) ? 'picture missing' : describeLowerThird(item);
```
(h) In `loadItem`, replace `} else if (item.type === 'announcement' || item.type === 'timer') {` with `} else if (item.type === 'announcement' || item.type === 'timer' || item.type === 'lowerthird') {`.
(i) In `renderActions`, replace `const canEdit = item.type === 'announcement' || item.type === 'timer';` with `const canEdit = item.type in DRAFT_ITEM;`.
(j) After the line `$('btn-plan-add-timer').addEventListener('click', () => editor.open({ type: 'timer' }));` add:
```js
  $('btn-plan-add-lowerthird').addEventListener('click', () => editor.open({ type: 'lowerthird' }));
```

- [ ] **Step 7: Edit `src/dock/main.js`.** In the `initPlanTab({` call, replace `session, store: planStore, library, tabs, setStatus: status.setStatus, showView,` with `session, store: planStore, library, tabs, logoStore, setStatus: status.setStatus, showView,`.

- [ ] **Step 8: Build and run the new specs**

Run: `npm run build; npx playwright test smoke/lowerthird.spec.js --timeout=15000 --reporter=list`
Expected: PASS, 14 specs. If the "it replaces a card" spec fails at its first lines, the spec opens the editor, types, cancels and reopens another type on purpose: keep it. If the picture specs fail on `setInputFiles`, check that `#ed-lt-file` is the hidden file input and that its `change` handler is attached.

- [ ] **Step 9: Run both suites and commit**

Run: `npm test; npx playwright test --timeout=15000`
Expected: PASS everywhere (the existing suites plus the Task 2 and Task 6 specs).

```bash
git add src smoke dist
git commit -m "feat: lower third editor, plan rows and Show now"
```

---

### Task 7: Coverage, README and final verification

**Files:**
- Modify: `vitest.config.js`, `README.md`, `dist/` (rebuilt)

**Interfaces:**
- Consumes: everything above.
- Produces: coverage that includes the new dock module, user-facing docs.

- [ ] **Step 1: Include the new module in coverage.** In `vitest.config.js` replace `'src/dock/plan/extras-tab.js',` with `'src/dock/plan/extras-tab.js', 'src/dock/plan/logo-store.js',`.

Run: `npm run coverage`
Expected: PASS with thresholds met. `encodeLogo` needs a real browser and is covered by the Playwright picture specs, so expect `logo-store.js` to show that one function uncovered in the unit report.

- [ ] **Step 2: Update `README.md`.** Directly before the line `### Scripture tab` insert:

```
### Lower thirds

On the Plan tab, **+ Lower third** opens the same small editor as announcements and timers: a **name**, an **info** line (for example "Pastor John" over "Guest speaker"), a **Left / Centre / Right** placement, an optional **picture**, and an optional **Hide after (seconds)**. **Add to plan** puts it in the plan; **Show now** puts it on screen straight away without touching any plan. To change one later, open its row's **⋯** menu and choose **Edit**.

- **It looks like your other cards.** A frosted bar with an accent edge, always at the bottom, in the theme, font and size you chose on the Style tab. It takes turns with the verse, song, announcement or timer card: showing a lower third replaces the card, and showing a card replaces the lower third.
- **Hide after.** Leave it blank and the lower third stays until you press **Hide**. Fill in a number of seconds and it hides itself after that long. Pressing Hide or showing something else first cancels it, so it never hides the wrong thing.
- **Pictures** (a church logo, a speaker's headshot) are kept as small PNG files in a `logos` folder inside your library folder. Choose a library folder in Songs, Library tools first. **Add picture...** shrinks the picture and saves it once; any lower third can use it. If a picture file is moved or deleted, the lower third still shows its name and info and the row says "picture missing".
```

- [ ] **Step 3: Full verification**

Run, in order:
```bash
npm test
npm run coverage
npm run build
npx playwright test --timeout=15000
```
Expected: unit tests all pass (356 earlier plus about 70 new), coverage thresholds met, build prints `dist/ built`, Playwright passes (122 earlier plus 9 overlay specs and 14 lower third specs, 145 in total, no retries needed). Read the output of each; any failure is fixed before continuing.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.js README.md dist
git commit -m "docs: lower thirds in the README, logo store in coverage"
```

- [ ] **Step 5: Whole-branch review.** Build the diff from `git merge-base main HEAD` to `HEAD` (without `dist/`) and give it to a fresh reviewer on the most capable model with this plan's Review Focus section verbatim, the spec and plan paths, and the ledger's `Ruling:` lines. Fix Critical and Important findings test-first in one pass; ledger minors as deferred.

- [ ] **Step 6: Owner's manual check in real OBS 28+ (cannot be automated here).** Report these to the owner when the branch is ready: (1) a lower third looks right in the real browser source over live video, in each theme and each of the three placements; (2) a picture added from a real image file is shrunk, saved in `logos/`, and shown beside the text; (3) hide-after really slides it away at the set time and Hide first cancels it; (4) switching between a lower third and a verse, song, announcement or timer never leaves a stray bar shape behind; (5) Next item then Show with a picture never shows the lower third first without it; (6) moving or deleting a picture file leaves the name and info on screen.
