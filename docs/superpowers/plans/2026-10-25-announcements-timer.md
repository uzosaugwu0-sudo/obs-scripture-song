# Announcements and timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a volunteer put an announcement (title + text) or a timer (countdown by duration or to a clock time) on screen, as plan items or with a "Show now" action, with the overlay doing the counting.

**Architecture:** Two new state kinds (`announcement`, `timer`) flow through the existing transport. The dock sends an absolute `endAt` (or a paused `remainingMs`) and a small pure module counts it down inside the overlay, updating only the digits. In the dock, `session` learns two more tab names; a new `extras-tab.js` registers `tabs.announcement` and `tabs.timer`; the Plan tab gains an inline editor and the live bar gains Pause / Resume / Reset for the running clock.

**Tech Stack:** Vanilla JS modules bundled by esbuild into classic IIFE scripts, Vitest (unit), Playwright (browser, static server on :4173, needs `npm run build`).

**Spec:** `docs/superpowers/specs/2026-10-25-announcements-timer-design.md`

## Global Constraints

- OBS 28+ over `file:///`: classic IIFE bundle via esbuild, no ES-module script tags, no fetch of local files.
- Model and store functions return new copies; never mutate plans, items or state.
- The dock is the only authority over state; the overlay only renders what it is told.
- State `kind` and plan item `type` stay open sets (unknown values are rejected by the overlay / preserved and skipped in plans).
- `STATE_VERSION` stays 1. New kinds and the optional `timer` field are backward compatible.
- Timer limits: a duration is a whole number of seconds from 1 to 359999; a clock time is a real 24-hour `HH:MM`.
- A clock timer resolves "today's HH:MM" when Show is pressed; if that time has passed today it shows `0:00` and never rolls to tomorrow.
- A timer whose `endAt` is more than one hour in the past renders nothing on the overlay (stale restore).
- A duration timer starts when Show is pressed; at zero it stays on screen showing `0:00` until Hide.
- Existing behaviour and tests for verses, songs, the plan and the live content snapshot stay unchanged.
- The nested `obs-scripture-song/obs-scripture-song/` copy is not touched. `dist/` is rebuilt (`npm run build`) and committed with any change under `src/`. Coverage stays at or above 80%.
- Baseline before this plan: 299 Vitest tests, 93 Playwright specs, coverage 93.6% statements.
- Files are CRLF on disk via git (`core.autocrlf=true`); that is expected.

## Review Focus

Failure modes the spec implies that no single task's happy path exercises; each has a test in the named task.

1. A hidden, cleared or replaced card must never be repainted by a stale timer tick (Task 2).
2. Pressing Next item while a timer is on air must not change the live clock, and Pause / Reset must act on the running clock, not the loaded item (Task 6).
3. A style change while a timer is on air must keep the clock running with the same end time (Task 6).
4. A hand-edited plan with an invalid announcement or timer (`seconds: -5`, `at: "25:99"`, empty text) loads as an unsupported row, is skipped by Next item and is never rewritten (Task 3).
5. A clock timer whose time has already passed today shows `0:00` and does not roll over; a timer pressed Show on twice restarts a duration timer predictably (Tasks 3 and 6).

## File Structure

New:
- `src/overlay/timer-clock.js`: pure remaining-time, formatting and staleness helpers.
- `src/plan/extras.js`: pure validation, clock-time resolution and description of announcement / timer specs.
- `src/dock/timer-run.js`: the dock's running clock (start, pause, resume, reset) as a small pure-ish module with an injectable `now`.
- `src/dock/extras-tab.js`: `tabs.announcement` and `tabs.timer` registry entries.
- `src/css/extras.css`: editor, live timer controls.
- Tests: `tests/core/state-timer.test.js`, `tests/overlay/timer-clock.test.js`, `tests/plan/extras.test.js`, `tests/plan/model-extras.test.js`, `tests/plan/cursor-extras.test.js`, `tests/dock/timer-run.test.js`, `smoke/overlay-timer.spec.js`, `smoke/extras.spec.js`.

Modified: `src/core/state.js`, `src/overlay/render.js`, `src/css/overlay.css`, `src/plan/model.js`, `src/plan/cursor.js`, `src/dock/session.js`, `tests/dock/session.test.js`, `src/dock/live-bar.js`, `src/dock/plan-tab.js`, `src/dock/main.js`, `src/html/dock.html`, `build.mjs`, `vitest.config.js`, `README.md`, `dist/`.

How to edit existing files: files are CRLF on disk. Use the Edit tool; if a multi-line match fails, apply the change with a small node script that reads the file, converts CRLF to LF, replaces the exact old text (asserting exactly one match), and writes it back (keeping CRLF).

---

### Task 1: State validation and the pure timer clock

**Files:**
- Modify: `src/core/state.js`
- Create: `src/overlay/timer-clock.js`
- Test: `tests/core/state-timer.test.js`, `tests/overlay/timer-clock.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: in `src/core/state.js`, `KINDS` now `['verse', 'song', 'announcement', 'timer']`, `DEFAULTS.timer = null`, and `normalizeState` returns `null` for kind `timer` unless `timer` is an object with a finite number `endAt` or a finite number `remainingMs >= 0`. In `src/overlay/timer-clock.js`: `STALE_AFTER_MS = 3600000`, `remainingMs(timer, now): number` (never negative), `formatClock(ms): string` (`M:SS`, or `H:MM:SS` from one hour up, rounding up to whole seconds), `isStale(timer, now): boolean` (only a running timer with `endAt` more than `STALE_AFTER_MS` in the past), `isRunning(timer): boolean` (has `endAt`).

- [ ] **Step 1: Write the failing tests.** `tests/core/state-timer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { KINDS, DEFAULTS, normalizeState } from '../../src/core/state.js';

describe('announcement and timer kinds', () => {
  it('lists the new kinds and defaults the timer field to null', () => {
    expect(KINDS).toEqual(['verse', 'song', 'announcement', 'timer']);
    expect(DEFAULTS.timer).toBeNull();
  });

  it('accepts an announcement with a title and body', () => {
    const state = normalizeState({ action: 'show', kind: 'announcement', title: 'Welcome', body: 'Please silence phones' });
    expect(state).toMatchObject({ kind: 'announcement', title: 'Welcome', body: 'Please silence phones' });
  });

  it('accepts a running timer and a paused timer', () => {
    expect(normalizeState({ action: 'show', kind: 'timer', timer: { endAt: 1761389400000 } }).timer).toEqual({ endAt: 1761389400000 });
    expect(normalizeState({ action: 'show', kind: 'timer', timer: { remainingMs: 0 } }).timer).toEqual({ remainingMs: 0 });
  });

  it('rejects a timer state with a missing or unusable timer field', () => {
    const base = { action: 'show', kind: 'timer' };
    expect(normalizeState(base)).toBeNull();
    expect(normalizeState({ ...base, timer: null })).toBeNull();
    expect(normalizeState({ ...base, timer: {} })).toBeNull();
    expect(normalizeState({ ...base, timer: { endAt: 'soon' } })).toBeNull();
    expect(normalizeState({ ...base, timer: { endAt: Infinity } })).toBeNull();
    expect(normalizeState({ ...base, timer: { endAt: NaN } })).toBeNull();
    expect(normalizeState({ ...base, timer: { remainingMs: -1 } })).toBeNull();
    expect(normalizeState({ ...base, timer: 'ten' })).toBeNull();
  });

  it('does not care about the timer field for other kinds', () => {
    expect(normalizeState({ action: 'show', kind: 'verse', timer: 'junk' })).not.toBeNull();
  });

  it('still lets hide and clear through for a timer without a timer field only when the kind is valid', () => {
    expect(normalizeState({ action: 'clear' })).not.toBeNull();
    expect(normalizeState({ action: 'hide', kind: 'timer', timer: { remainingMs: 5000 } })).not.toBeNull();
  });
});
```

`tests/overlay/timer-clock.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { remainingMs, formatClock, isStale, isRunning, STALE_AFTER_MS } from '../../src/overlay/timer-clock.js';

describe('remainingMs', () => {
  it('counts down against the clock for a running timer and never goes negative', () => {
    expect(remainingMs({ endAt: 10_000 }, 4_000)).toBe(6_000);
    expect(remainingMs({ endAt: 10_000 }, 10_000)).toBe(0);
    expect(remainingMs({ endAt: 10_000 }, 99_000)).toBe(0);
  });
  it('returns the frozen value for a paused timer', () => {
    expect(remainingMs({ remainingMs: 7_500 }, 123_456)).toBe(7_500);
    expect(remainingMs({ remainingMs: -5 }, 0)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(599_000)).toBe('9:59');
    expect(formatClock(3_599_000)).toBe('59:59');
  });
  it('switches to hours from one hour up', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
    expect(formatClock(359_999_000)).toBe('99:59:59');
  });
  it('rounds up to whole seconds so 0:00 only appears at real zero', () => {
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(999)).toBe('0:01');
    expect(formatClock(1_001)).toBe('0:02');
  });
  it('treats negative input as zero', () => {
    expect(formatClock(-50)).toBe('0:00');
  });
});

describe('isStale and isRunning', () => {
  it('only a running timer more than an hour past its end is stale', () => {
    const now = 10_000_000;
    expect(isStale({ endAt: now - STALE_AFTER_MS - 1 }, now)).toBe(true);
    expect(isStale({ endAt: now - STALE_AFTER_MS }, now)).toBe(false);
    expect(isStale({ endAt: now - 60_000 }, now)).toBe(false);
    expect(isStale({ endAt: now + 60_000 }, now)).toBe(false);
    expect(isStale({ remainingMs: 0 }, now)).toBe(false);
  });
  it('knows a running timer from a paused one', () => {
    expect(isRunning({ endAt: 5 })).toBe(true);
    expect(isRunning({ remainingMs: 5 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/state-timer.test.js tests/overlay/timer-clock.test.js`
Expected: FAIL (`timer-clock.js` cannot be resolved; the state tests fail on the old `KINDS`).

- [ ] **Step 3: Write `src/overlay/timer-clock.js`**

```js
export const STALE_AFTER_MS = 3600000;   // a restored timer this long past its end renders nothing

/** Milliseconds left: against the clock for a running timer, the frozen value for a paused one. Never negative. */
export function remainingMs(timer, now) {
  if (typeof timer.endAt === 'number') return Math.max(0, timer.endAt - now);
  return Math.max(0, timer.remainingMs || 0);
}

/** M:SS, or H:MM:SS from one hour up. Rounds up, so 0:00 only appears at real zero. */
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : minutes + ':' + pad(seconds);
}

export const isRunning = (timer) => typeof timer.endAt === 'number';

/** A running timer that ended more than STALE_AFTER_MS ago: a leftover from a restore, not worth showing. */
export function isStale(timer, now) {
  return isRunning(timer) && now - timer.endAt > STALE_AFTER_MS;
}
```

- [ ] **Step 4: Edit `src/core/state.js`.** Change `export const KINDS = Object.freeze(['verse', 'song']);` to `export const KINDS = Object.freeze(['verse', 'song', 'announcement', 'timer']);`. In `DEFAULTS`, after the `reference` line add `timer: null,        // timer kind only: { endAt } while running, { remainingMs } while paused`. Directly above `export function normalizeState` add:

```js
function validTimer(timer) {
  if (!timer || typeof timer !== 'object') return false;
  if (typeof timer.endAt === 'number') return Number.isFinite(timer.endAt);
  return typeof timer.remainingMs === 'number' && Number.isFinite(timer.remainingMs) && timer.remainingMs >= 0;
}
```
and in `normalizeState`, directly after `if (!KINDS.includes(merged.kind)) return null;` add `if (merged.kind === 'timer' && merged.action !== 'clear' && !validTimer(merged.timer)) return null;`. (A `clear` action has no kind or timer to check.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/core tests/overlay`
Expected: PASS, including the existing state tests (the `accepts clear without a kind` test still passes because `clear` skips the timer check).

- [ ] **Step 6: Run the whole unit suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/core/state.js src/overlay/timer-clock.js tests/core/state-timer.test.js tests/overlay/timer-clock.test.js
git commit -m "feat: announcement and timer state kinds, pure timer clock"
```

---

### Task 2: Overlay rendering for both kinds

**Files:**
- Modify: `src/overlay/render.js`, `src/css/overlay.css`
- Test: `smoke/overlay-timer.spec.js`

**Interfaces:**
- Consumes: `remainingMs`, `formatClock`, `isStale`, `isRunning` (Task 1); `KINDS` / `normalizeState` (Task 1).
- Produces: the overlay renders `kind: 'announcement'` (title above, body below) and `kind: 'timer'` (title above, ticking digits). Stage class `kind-announcement` / `kind-timer`. Digits live in `#ov-body`. The overlay ignores a show command for a stale timer. Any command cancels the tick interval.

- [ ] **Step 1: Write the failing browser specs.** Create `smoke/overlay-timer.spec.js`. The overlay listens to localStorage under `obs-stage-display-state`, the same way `smoke/overlay.spec.js` drives it:

```js
import { test, expect } from '@playwright/test';

const KEY = 'obs-stage-display-state';

async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/overlay.html');
  let seq = Date.now();
  const push = (state) => page.evaluate(
    ([key, payload]) => localStorage.setItem(key, JSON.stringify(payload)),
    [KEY, { action: 'show', version: 1, visible: true, title: '', body: '', reference: '', theme: 'frosted', animation: 'cut', ...state, seq: (seq += 1) }],
  );
  return { push, errors, stage: page.locator('#stage'), body: page.locator('#ov-body'), title: page.locator('#ov-title') };
}

test.describe('overlay: announcement', () => {
  test('shows the title above the text and no reference', async ({ page }) => {
    const { push, errors, stage, body, title } = await setup(page);
    await push({ kind: 'announcement', title: 'Welcome', body: 'Please silence your phones.' });
    await expect(stage).toHaveClass(/kind-announcement/);
    await expect(title).toHaveText('Welcome');
    await expect(body).toHaveText('Please silence your phones.');
    await expect(page.locator('#ov-ref')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('hides the title line when the title is empty', async ({ page }) => {
    const { push, body, title } = await setup(page);
    await push({ kind: 'announcement', title: '', body: 'Offering' });
    await expect(body).toHaveText('Offering');
    await expect(title).toBeHidden();
  });
});

test.describe('overlay: timer', () => {
  test('counts down against the clock and keeps counting', async ({ page }) => {
    const { push, errors, stage, body, title } = await setup(page);
    await push({ kind: 'timer', title: 'Service starts in', timer: { endAt: Date.now() + 65_000 } });
    await expect(stage).toHaveClass(/kind-timer/);
    await expect(title).toHaveText('Service starts in');
    await expect(body).toHaveText(/^1:0[0-5]$/);
    const first = await body.textContent();
    await expect.poll(async () => body.textContent(), { timeout: 4000 }).not.toBe(first);
    expect(errors).toEqual([]);
  });

  test('shows hours from one hour up', async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() + 3_725_000 } });
    await expect(body).toHaveText(/^1:02:0[0-5]$/);
  });

  test('a paused timer is frozen', async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ kind: 'timer', timer: { remainingMs: 120_000 } });
    await expect(body).toHaveText('2:00');
    await page.waitForTimeout(1500);
    await expect(body).toHaveText('2:00');
  });

  test('an expired timer stays at 0:00 until it is hidden', async ({ page }) => {
    const { push, stage, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() - 60_000 } });
    await expect(body).toHaveText('0:00');
    await page.waitForTimeout(1200);
    await expect(body).toHaveText('0:00');
    await expect(stage).not.toHaveClass(/hidden/);
    await push({ action: 'hide', visible: false, kind: 'timer', timer: { endAt: Date.now() - 60_000 } });
    await expect(stage).toHaveClass(/hidden/);
  });

  test('a timer restored more than an hour after it ended renders nothing', async ({ page }) => {
    const { push, stage } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() - 2 * 3_600_000 } });
    await page.waitForTimeout(500);
    await expect(stage).toHaveClass(/hidden/);
  });

  test('an unusable timer field renders nothing and breaks nothing', async ({ page }) => {
    const { push, errors, stage } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: 'soon' } });
    await page.waitForTimeout(400);
    await expect(stage).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
  });

  test('a stale tick never repaints a hidden or replaced card', async ({ page }) => {
    const { push, stage, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() + 90_000 } });
    await expect(body).toHaveText(/^1:[23]\d$/);
    await push({ action: 'hide', visible: false, kind: 'timer', timer: { endAt: Date.now() + 90_000 } });
    await expect(stage).toHaveClass(/hidden/);
    const frozen = await body.textContent();
    await page.waitForTimeout(1500);
    expect(await body.textContent()).toBe(frozen);
    await push({ kind: 'announcement', title: 'Next', body: 'A different card' });
    await expect(body).toHaveText('A different card');
    await page.waitForTimeout(1200);
    await expect(body).toHaveText('A different card');
  });

  test('switching from a verse to a timer and back leaves the verse alone', async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() + 120_000 } });
    await expect(body).toHaveText(/^\d:\d\d$/);
    await push({ kind: 'verse', body: 'For God so loved the world', reference: 'John 3:16' });
    await expect(body).toHaveText('For God so loved the world');
    await page.waitForTimeout(1200);
    await expect(body).toHaveText('For God so loved the world');
  });
});
```

- [ ] **Step 2: Build and run them to verify they fail**

Run: `npm run build; npx playwright test smoke/overlay-timer.spec.js --timeout=8000 --reporter=list`
Expected: FAIL (the overlay rejects or mis-renders the new kinds; `kind-announcement` / `kind-timer` classes do not exist).

- [ ] **Step 3: Edit `src/overlay/render.js`.**

(a) Imports: add `import { remainingMs, formatClock, isStale } from './timer-clock.js';` after the `splitLines` import.
(b) Replace `const KIND_CLASSES  = ['kind-verse', 'kind-song'];` with `const KIND_CLASSES  = ['kind-verse', 'kind-song', 'kind-announcement', 'kind-timer'];`.
(c) After `const LINES_BUDGET_S = 2.4;` add:
```js
const TIMER_TICK_MS = 250;
const TIMER_SCALE   = 1.6;   // the digits are set a little larger than body text
```
(d) In `createRenderer`, after `let epoch = 0;` add `let tickHandle = null;   // the digits interval; any command cancels it`.
(e) Add these functions before `function applyStyles(state) {`:
```js
  function stopTick() {
    if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
  }

  function paintClock(timer) {
    bodyEl.textContent = formatClock(remainingMs(timer, Date.now()));
  }

  /** Update only the digits, every TIMER_TICK_MS. A paused timer is painted once and never ticks. */
  function startTick(timer) {
    stopTick();
    paintClock(timer);
    if (typeof timer.endAt !== 'number') return;
    tickHandle = setInterval(() => {
      paintClock(timer);
      if (remainingMs(timer, Date.now()) === 0) stopTick();
    }, TIMER_TICK_MS);
  }
```
(f) In `applyStyles`, replace `const kind       = state.kind === 'song' ? 'song' : 'verse';` with `const kind       = state.kind;`. Replace `const hideTitle = kind !== 'song'  || state.showTitle === false;` with `const hideTitle = kind === 'verse' || state.showTitle === false || (kind !== 'song' && !state.title);`. (An announcement or timer without a title hides its title line and the accent above it; songs behave exactly as before.) Leave the `hideRef` line as it is.
(g) In `fillContent`, replace the whole function with:
```js
  function fillContent(state) {
    const titled = state.kind !== 'verse';
    titleEl.textContent = titled ? (state.title || '') : '';
    refEl.textContent   = state.kind === 'verse' ? (state.reference || '') : '';
    const body = state.body || '';
    bodyEl.setAttribute('aria-label', state.kind === 'timer' ? (state.title || 'Timer') : body);

    if (state.kind === 'timer') {
      paintClock(state.timer);
      bodyEl.style.removeProperty('--stagger');
      bodyEl.style.fontSize = Math.round(computeBodyFontSize('', 'fs-' + (state.fontSize || 'md'), getScale(state)) * TIMER_SCALE) + 'px';
      return;
    }
    if (state.animation === 'lines') {
      const lines = splitLines(body, state.kind === 'verse' ? 'verse' : 'song');
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
```
(h) In `show`, in the `commit` arrow function, after `stage.classList.remove('hidden');` add `if (state.kind === 'timer') startTick(state.timer);`.
(i) In `hide` (the `finish` function) and `clear`, add `stopTick();` as the first statement of each (`finish` inside `hide` and the body of `clear`). In `handle`, replace
```js
      epoch += 1;
      const token = epoch;
```
with
```js
      if (state.action === 'show' && state.kind === 'timer' && isStale(state.timer, Date.now())) return;   // a restored leftover
      epoch += 1;
      stopTick();
      const token = epoch;
```

- [ ] **Step 4: Edit `src/css/overlay.css`.** Replace
```css
#stage.kind-verse .accent-top,
#stage.kind-song  .accent-bottom { display: none; }
```
with
```css
#stage.kind-verse .accent-top,
#stage.kind-song  .accent-bottom,
#stage.kind-announcement .accent-bottom,
#stage.kind-timer .accent-bottom { display: none; }
```
and add after the `.ln { display: block; }` rule:
```css
.kind-timer #ov-body { font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: 0.02em; line-height: 1.2; }
```

- [ ] **Step 5: Build and run the new specs, then the older overlay specs**

Run: `npm run build; npx playwright test smoke/overlay-timer.spec.js smoke/overlay.spec.js --timeout=15000 --reporter=list`
Expected: PASS (the new 9 specs plus the existing overlay specs unchanged). If the paused-timer or stale-tick spec fails, the culprit is a missing `stopTick()` on a code path; fix the code, not the spec.

- [ ] **Step 6: Run both suites and commit**

Run: `npm test; npx playwright test --timeout=15000`
Expected: PASS everywhere.

```bash
git add src smoke dist
git commit -m "feat: overlay renders announcements and a self-counting timer"
```

---

### Task 3: Plan model and cursor additions

**Files:**
- Create: `src/plan/extras.js`
- Modify: `src/plan/model.js`, `src/plan/cursor.js`
- Test: `tests/plan/extras.test.js`, `tests/plan/model-extras.test.js`, `tests/plan/cursor-extras.test.js`

**Interfaces:**
- Consumes: `formatClock` from `src/overlay/timer-clock.js` (Task 1); `uid` from `src/songs/model.js`; the plan item shape and `itemStatus` / `itemTitle` from Tasks 1-2 of the run-order plan.
- Produces, in `src/plan/extras.js`: `MAX_TIMER_SECONDS = 359999`, `isValidClockTime(at): boolean`, `isValidTimerSpec(spec): boolean` (`{ mode: 'duration', seconds }` or `{ mode: 'clock', at }`), `clockEndAt(at, now): number` (epoch ms of today's `at` in local time, possibly already past), `describeTimerSpec(spec): string` (`"5:00"` or `"at 10:30"`), `parseClockInput(text): string | null` (accepts `H:MM`, `HH:MM`, `HMM`, `HHMM`; returns zero-padded `HH:MM` or null). In `src/plan/model.js`: `announcementItem({ title, body }, uid?)`, `timerItem({ mode, seconds, at, title }, uid?)`, `updateItem(plan, id, patch)`. In `src/plan/cursor.js`: `itemStatus` / `itemTitle` handle `announcement` and `timer`.

- [ ] **Step 1: Write the failing tests.** `tests/plan/extras.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MAX_TIMER_SECONDS, isValidClockTime, isValidTimerSpec, clockEndAt, describeTimerSpec, parseClockInput,
} from '../../src/plan/extras.js';

describe('isValidClockTime', () => {
  it('accepts real 24-hour times only', () => {
    ['00:00', '09:05', '10:30', '23:59'].forEach((t) => expect(isValidClockTime(t)).toBe(true));
    ['24:00', '25:99', '10:60', '9:30', '10:3', '', '10-30', 'ten', null, undefined, 1030].forEach((t) => expect(isValidClockTime(t)).toBe(false));
  });
});

describe('isValidTimerSpec', () => {
  it('validates durations from 1 second to 99:59:59', () => {
    expect(isValidTimerSpec({ mode: 'duration', seconds: 1 })).toBe(true);
    expect(isValidTimerSpec({ mode: 'duration', seconds: MAX_TIMER_SECONDS })).toBe(true);
    expect(isValidTimerSpec({ mode: 'duration', seconds: 0 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: -5 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: 1.5 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: MAX_TIMER_SECONDS + 1 })).toBe(false);
    expect(isValidTimerSpec({ mode: 'duration', seconds: '300' })).toBe(false);
  });
  it('validates clock times and rejects unknown modes', () => {
    expect(isValidTimerSpec({ mode: 'clock', at: '10:30' })).toBe(true);
    expect(isValidTimerSpec({ mode: 'clock', at: '25:99' })).toBe(false);
    expect(isValidTimerSpec({ mode: 'stopwatch', seconds: 5 })).toBe(false);
    expect(isValidTimerSpec(null)).toBe(false);
  });
});

describe('clockEndAt', () => {
  it('is today at that local time, even if it has already passed', () => {
    const now = new Date(2026, 9, 25, 9, 0, 0).getTime();
    expect(clockEndAt('10:30', now)).toBe(new Date(2026, 9, 25, 10, 30, 0, 0).getTime());
    const late = new Date(2026, 9, 25, 11, 0, 0).getTime();
    expect(clockEndAt('10:30', late)).toBe(new Date(2026, 9, 25, 10, 30, 0, 0).getTime());
  });
});

describe('describeTimerSpec', () => {
  it('describes durations as M:SS and clock times as "at HH:MM"', () => {
    expect(describeTimerSpec({ mode: 'duration', seconds: 300 })).toBe('5:00');
    expect(describeTimerSpec({ mode: 'duration', seconds: 3725 })).toBe('1:02:05');
    expect(describeTimerSpec({ mode: 'clock', at: '10:30' })).toBe('at 10:30');
  });
});

describe('parseClockInput', () => {
  it('normalises friendly times to HH:MM', () => {
    expect(parseClockInput('10:30')).toBe('10:30');
    expect(parseClockInput('9:05')).toBe('09:05');
    expect(parseClockInput(' 0930 ')).toBe('09:30');
    expect(parseClockInput('930')).toBe('09:30');
  });
  it('returns null for anything that is not a real time', () => {
    ['', '25:00', '10:75', 'noon', '1', '12345', null].forEach((t) => expect(parseClockInput(t)).toBeNull());
  });
});
```

`tests/plan/model-extras.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { announcementItem, timerItem, updateItem, isPlanRecord } from '../../src/plan/model.js';

const counter = () => { let n = 0; return () => 'u' + (n += 1); };
const plan = { v: 1, id: 'p', name: 'P', items: [{ id: 'a', type: 'song', songId: 's' }, { id: 'b', type: 'announcement', title: 'Hi', body: 'x' }] };

describe('announcementItem and timerItem', () => {
  it('builds an announcement with a trimmed title and body', () => {
    expect(announcementItem({ title: '  Welcome ', body: ' Hello there ' }, counter())).toEqual({ id: 'i_u1', type: 'announcement', title: 'Welcome', body: 'Hello there' });
  });
  it('builds a duration timer and a clock timer', () => {
    expect(timerItem({ mode: 'duration', seconds: 300, title: ' Back in ' }, counter())).toEqual({ id: 'i_u1', type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' });
    expect(timerItem({ mode: 'clock', at: '10:30', title: '' }, counter())).toEqual({ id: 'i_u1', type: 'timer', mode: 'clock', at: '10:30', title: '' });
  });
  it('produces items a plan record accepts', () => {
    const next = { ...plan, items: [...plan.items, announcementItem({ title: '', body: 'x' }), timerItem({ mode: 'duration', seconds: 5, title: '' })] };
    expect(isPlanRecord(next)).toBe(true);
  });
});

describe('updateItem', () => {
  it('replaces fields of one item without touching the others and keeps its id and type', () => {
    const next = updateItem(plan, 'b', { title: 'New', body: 'y', id: 'hacked', type: 'song' });
    expect(next.items[1]).toEqual({ id: 'b', type: 'announcement', title: 'New', body: 'y' });
    expect(next.items[0]).toBe(plan.items[0]);
    expect(plan.items[1].title).toBe('Hi');
  });
  it('returns the same plan for an unknown id', () => {
    expect(updateItem(plan, 'zzz', { title: 'x' })).toBe(plan);
  });
});
```

`tests/plan/cursor-extras.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { itemStatus, itemTitle, nextLoadable, planSummary } from '../../src/plan/cursor.js';

const library = { get: () => null };
const ann = { id: 'a', type: 'announcement', title: 'Welcome', body: 'Please silence phones\nthanks' };
const annNoTitle = { id: 'b', type: 'announcement', title: '', body: 'Offering\nplease give' };
const annEmpty = { id: 'c', type: 'announcement', title: 'Empty', body: '   ' };
const dur = { id: 'd', type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' };
const durNoTitle = { id: 'e', type: 'timer', mode: 'duration', seconds: 90, title: '' };
const clock = { id: 'f', type: 'timer', mode: 'clock', at: '10:30', title: '' };
const badSeconds = { id: 'g', type: 'timer', mode: 'duration', seconds: -5, title: '' };
const badClock = { id: 'h', type: 'timer', mode: 'clock', at: '25:99', title: '' };

describe('announcement and timer items', () => {
  it('are loadable when valid and unsupported when not', () => {
    expect([ann, annNoTitle, dur, durNoTitle, clock].map((i) => itemStatus(i, library))).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect([annEmpty, badSeconds, badClock].map((i) => itemStatus(i, library))).toEqual(['unsupported', 'unsupported', 'unsupported']);
  });

  it('are titled by their title, else the first line or the time', () => {
    expect(itemTitle(ann, library)).toBe('Welcome');
    expect(itemTitle(annNoTitle, library)).toBe('Offering');
    expect(itemTitle(dur, library)).toBe('Back in');
    expect(itemTitle(durNoTitle, library)).toBe('1:30');
    expect(itemTitle(clock, library)).toBe('at 10:30');
    expect(itemTitle(badSeconds, library)).toBe('Unsupported item');
    expect(itemTitle(annEmpty, library)).toBe('Unsupported item');
  });

  it('Next item skips invalid ones and the summary names the next valid one', () => {
    const plan = { v: 1, id: 'p', name: 'P', items: [badSeconds, annEmpty, dur] };
    expect(nextLoadable(plan, null, library).id).toBe('d');
    expect(planSummary(plan, null, library)).toBe('3 items \u00b7 Next: Back in');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/plan/extras.test.js tests/plan/model-extras.test.js tests/plan/cursor-extras.test.js`
Expected: FAIL (`extras.js` does not exist; `announcementItem` etc. are not exported).

- [ ] **Step 3: Write `src/plan/extras.js`**

```js
import { formatClock } from '../overlay/timer-clock.js';

export const MAX_TIMER_SECONDS = 359999;   // 99:59:59

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidClockTime = (at) => typeof at === 'string' && CLOCK_TIME.test(at);

export function isValidTimerSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.mode === 'duration') {
    return Number.isInteger(spec.seconds) && spec.seconds >= 1 && spec.seconds <= MAX_TIMER_SECONDS;
  }
  if (spec.mode === 'clock') return isValidClockTime(spec.at);
  return false;
}

/** Epoch ms of today's HH:MM in local time. If that time has already passed it stays in the past: the timer shows 0:00. */
export function clockEndAt(at, now) {
  const [hours, minutes] = at.split(':').map(Number);
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
}

export function describeTimerSpec(spec) {
  return spec.mode === 'clock' ? 'at ' + spec.at : formatClock(spec.seconds * 1000);
}

/** "9:05", "0930" and "930" all become a zero-padded HH:MM; anything that is not a real time is null. */
export function parseClockInput(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw) || /^(\d{1,2})(\d{2})$/.exec(raw);
  if (!match) return null;
  const at = match[1].padStart(2, '0') + ':' + match[2];
  return isValidClockTime(at) ? at : null;
}
```

- [ ] **Step 4: Edit `src/plan/model.js`.** After the `readingItem` line add:

```js
export const announcementItem = ({ title = '', body = '' }, uid = defaultUid) =>
  ({ id: 'i_' + uid(), type: 'announcement', title: title.trim(), body: body.trim() });

export function timerItem({ mode, seconds, at, title = '' }, uid = defaultUid) {
  const base = { id: 'i_' + uid(), type: 'timer', mode };
  const spec = mode === 'clock' ? { at } : { seconds };
  return { ...base, ...spec, title: title.trim() };
}

/** Change fields of one item. Its id and type never change. */
export function updateItem(plan, id, patch) {
  if (!plan.items.some((i) => i.id === id)) return plan;
  return { ...plan, items: plan.items.map((i) => (i.id === id ? { ...i, ...patch, id: i.id, type: i.type } : i)) };
}
```

- [ ] **Step 5: Edit `src/plan/cursor.js`.** Add at the top `import { isValidTimerSpec, describeTimerSpec } from './extras.js';`. Replace `itemStatus` and `itemTitle` with:

```js
export function itemStatus(item, library) {
  if (item.type === 'song') return library.get(item.songId) ? 'ok' : 'missing';
  if (item.type === 'reading') return typeof item.ref === 'string' && item.ref.trim() ? 'ok' : 'unsupported';
  if (item.type === 'announcement') return typeof item.body === 'string' && item.body.trim() ? 'ok' : 'unsupported';
  if (item.type === 'timer') return isValidTimerSpec(item) ? 'ok' : 'unsupported';
  return 'unsupported';
}

export function itemTitle(item, library) {
  const status = itemStatus(item, library);
  if (item.type === 'song') return status === 'ok' ? (library.get(item.songId).title || 'Untitled') : 'Song missing';
  if (status !== 'ok') return 'Unsupported item';
  if (item.type === 'reading') return item.ref;
  if (item.type === 'announcement') return (item.title || '').trim() || item.body.trim().split('\n')[0];
  return (item.title || '').trim() || describeTimerSpec(item);
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/plan`
Expected: PASS. The original cursor tests still pass: `{ type: 'timer', seconds: 60 }` in their fixture has no `mode`, so it stays `unsupported`.

- [ ] **Step 7: Run the whole unit suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/plan tests/plan
git commit -m "feat: plan items for announcements and timers"
```

---

### Task 4: Session tab names, the running clock and the extras tab

**Files:**
- Create: `src/dock/timer-run.js`, `src/dock/extras-tab.js`
- Modify: `src/dock/session.js`, `src/dock/live-bar.js`, `src/dock/main.js`
- Test: `tests/dock/session-extras.test.js`, `tests/dock/timer-run.test.js`, `tests/dock/extras-tab.test.js`

**Interfaces:**
- Consumes: `isValidTimerSpec`, `clockEndAt`, `describeTimerSpec` (Task 3); `remainingMs`, `formatClock` (Task 1).
- Produces:
  - `createSession` accepts providers for `announcement` and `timer`; tab names `announcement` and `timer` are valid for `setTab`; the on-air snapshot now includes the `timer` field; new `session.liveContent` getter and `session.updateLive(patch)` (merge the patch into the on-air snapshot and re-send it as a show, only while live).
  - `createTimerRun(now = Date.now)` returning `{ load(item): boolean, loaded(): { spec, title } | null, previewTimer(spec): timer, start(): timer | null, running(): { spec, title, timer } | null, pause(): boolean, resume(): boolean, reset(): boolean, canControl(): boolean, isPaused(): boolean, remainingNow(): number | null }`. `spec` is `{ mode: 'duration', seconds }` or `{ mode: 'clock', at }`.
  - `initExtrasTab({ session, refresh, now = Date.now, startTicker = true })` returning `{ announcement, timer }` tab objects. Both have `load(item): boolean`, `getContent()`, `preview()`, `step()`. The timer tab also has `markShown()` (starts the clock at Show), `live(): { text, title, paused, canControl } | null`, `pause()`, `resume()`, `reset()` (the last three act on the running clock only, through `session.updateLive`).

- [ ] **Step 1: Write the failing tests.** `tests/dock/session-extras.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createSession } from '../../src/dock/session.js';

function setup() {
  const sent = [];
  let timer = { endAt: 5000 };
  const providers = {
    scripture: () => ({ body: 'verse text', reference: 'John 3:16' }),
    songs: () => ({ title: 'Song', body: 'la la' }),
    announcement: () => ({ title: 'Welcome', body: 'Hello' }),
    timer: () => ({ title: 'Back in', body: '', timer }),
  };
  const session = createSession({
    transport: { send: (s) => { sent.push(s); return s; } },
    readSettings: () => ({ theme: 'frosted' }),
    providers,
  });
  return { session, sent, setTimer: (t) => { timer = t; } };
}

describe('announcement and timer tabs', () => {
  it('accepts the new tab names and sends the matching kinds', () => {
    const { session, sent } = setup();
    session.setTab('announcement');
    expect(session.activeTab).toBe('announcement');
    session.show();
    expect(sent.at(-1)).toMatchObject({ action: 'show', kind: 'announcement', title: 'Welcome', body: 'Hello' });
    session.setTab('timer');
    session.show();
    expect(sent.at(-1)).toMatchObject({ kind: 'timer', title: 'Back in', timer: { endAt: 5000 } });
  });

  it('still ignores unknown tabs', () => {
    const { session } = setup();
    session.setTab('nonsense');
    expect(session.activeTab).toBe('scripture');
  });

  it('keeps the timer field in the on-air snapshot, so a restyle keeps the same clock', () => {
    const { session, sent, setTimer } = setup();
    session.setTab('timer');
    session.show();
    setTimer({ endAt: 9999 });
    session.resendIfLive();
    expect(sent.at(-1).timer).toEqual({ endAt: 5000 });
  });
});

describe('updateLive and liveContent', () => {
  it('merges a patch into the on-air snapshot and re-sends it as a show', () => {
    const { session, sent } = setup();
    session.setTab('timer');
    session.show();
    session.updateLive({ timer: { remainingMs: 1000 } });
    expect(sent.at(-1)).toMatchObject({ action: 'show', visible: true, kind: 'timer', title: 'Back in', timer: { remainingMs: 1000 } });
    expect(session.liveContent.timer).toEqual({ remainingMs: 1000 });
    session.resendIfLive();
    expect(sent.at(-1).timer).toEqual({ remainingMs: 1000 });
  });

  it('does nothing when nothing is live or after Clear', () => {
    const { session, sent } = setup();
    session.updateLive({ timer: { remainingMs: 1 } });
    expect(sent).toHaveLength(0);
    session.setTab('timer');
    session.show();
    session.clear();
    const count = sent.length;
    session.updateLive({ timer: { remainingMs: 1 } });
    expect(sent).toHaveLength(count);
    expect(session.liveContent).toBeNull();
  });
});
```

`tests/dock/timer-run.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createTimerRun } from '../../src/dock/timer-run.js';

function setup() {
  const clock = { t: new Date(2026, 9, 25, 9, 0, 0).getTime() };
  const run = createTimerRun(() => clock.t);
  return { run, clock };
}
const duration = (seconds, title = '') => ({ id: 'i', type: 'timer', mode: 'duration', seconds, title });
const clockItem = (at, title = '') => ({ id: 'i', type: 'timer', mode: 'clock', at, title });

describe('loading', () => {
  it('accepts valid timers and refuses invalid ones without losing the loaded one', () => {
    const { run } = setup();
    expect(run.load(duration(300, ' Back in '))).toBe(true);
    expect(run.loaded().title).toBe('Back in');
    expect(run.load(duration(-5))).toBe(false);
    expect(run.load({ id: 'x', type: 'timer', mode: 'clock', at: '25:99' })).toBe(false);
    expect(run.loaded().spec).toEqual({ mode: 'duration', seconds: 300 });
  });
});

describe('a duration timer', () => {
  it('starts at Show with the full time and counts down', () => {
    const { run, clock } = setup();
    run.load(duration(300));
    expect(run.running()).toBeNull();
    const timer = run.start();
    expect(timer).toEqual({ endAt: clock.t + 300_000 });
    clock.t += 60_000;
    expect(run.remainingNow()).toBe(240_000);
  });

  it('pauses with the time left, resumes from it, and resets to the full time', () => {
    const { run, clock } = setup();
    run.load(duration(300));
    run.start();
    clock.t += 100_000;
    expect(run.pause()).toBe(true);
    expect(run.running().timer).toEqual({ remainingMs: 200_000 });
    expect(run.isPaused()).toBe(true);
    clock.t += 50_000;
    expect(run.remainingNow()).toBe(200_000);
    expect(run.resume()).toBe(true);
    expect(run.running().timer).toEqual({ endAt: clock.t + 200_000 });
    clock.t += 10_000;
    expect(run.reset()).toBe(true);
    expect(run.running().timer).toEqual({ endAt: clock.t + 300_000 });
    expect(run.isPaused()).toBe(false);
  });

  it('ignores pause when already paused and resume when running', () => {
    const { run } = setup();
    run.load(duration(60));
    run.start();
    expect(run.resume()).toBe(false);
    run.pause();
    expect(run.pause()).toBe(false);
  });

  it('pausing at zero keeps zero', () => {
    const { run, clock } = setup();
    run.load(duration(10));
    run.start();
    clock.t += 99_000;
    run.pause();
    expect(run.running().timer).toEqual({ remainingMs: 0 });
  });

  it('starting again restarts the full time', () => {
    const { run, clock } = setup();
    run.load(duration(300));
    run.start();
    clock.t += 120_000;
    run.start();
    expect(run.remainingNow()).toBe(300_000);
  });
});

describe('a clock timer', () => {
  it('counts to today at that time and has no pause or reset', () => {
    const { run, clock } = setup();
    run.load(clockItem('10:30'));
    const timer = run.start();
    expect(timer).toEqual({ endAt: new Date(2026, 9, 25, 10, 30, 0, 0).getTime() });
    expect(run.remainingNow()).toBe(90 * 60_000);
    expect(run.canControl()).toBe(false);
    expect(run.pause()).toBe(false);
    expect(run.reset()).toBe(false);
    clock.t = new Date(2026, 9, 25, 10, 31, 0).getTime();
    expect(run.remainingNow()).toBe(0);
  });

  it('a time that already passed today stays in the past and shows zero', () => {
    const { run, clock } = setup();
    clock.t = new Date(2026, 9, 25, 11, 0, 0).getTime();
    run.load(clockItem('10:30'));
    run.start();
    expect(run.remainingNow()).toBe(0);
  });
});

describe('previews and stopping', () => {
  it('previews a duration as the full time and a clock timer against the clock', () => {
    const { run, clock } = setup();
    expect(run.previewTimer({ mode: 'duration', seconds: 90 })).toEqual({ remainingMs: 90_000 });
    expect(run.previewTimer({ mode: 'clock', at: '09:30' })).toEqual({ endAt: new Date(2026, 9, 25, 9, 30, 0, 0).getTime() });
    expect(clock.t).toBeGreaterThan(0);
  });
  it('has no running clock before start', () => {
    const { run } = setup();
    expect(run.canControl()).toBe(false);
    expect(run.remainingNow()).toBeNull();
    expect(run.start()).toBeNull();
  });
});
```

`tests/dock/extras-tab.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { initExtrasTab } from '../../src/dock/extras-tab.js';

function setup() {
  const clock = { t: new Date(2026, 9, 25, 9, 0, 0).getTime() };
  const session = { isLive: false, liveTab: null, activeTab: 'timer', updateLive: vi.fn() };
  const refresh = vi.fn();
  const tabs = initExtrasTab({ session, refresh, now: () => clock.t, startTicker: false });
  return { tabs, session, refresh, clock };
}
const timerItem = (seconds, title = '') => ({ id: 'i', type: 'timer', mode: 'duration', seconds, title });

describe('announcement tab', () => {
  it('loads trimmed content and previews it', () => {
    const { tabs, refresh } = setup();
    expect(tabs.announcement.preview().has).toBe(false);
    expect(tabs.announcement.load({ title: ' Welcome ', body: ' Hello there ' })).toBe(true);
    expect(tabs.announcement.getContent()).toEqual({ title: 'Welcome', body: 'Hello there' });
    expect(tabs.announcement.preview()).toMatchObject({ has: true, text: 'Hello there', sub: 'Announcement · Welcome', canNav: false });
    expect(refresh).toHaveBeenCalled();
  });
  it('refuses an empty announcement', () => {
    const { tabs } = setup();
    expect(tabs.announcement.load({ title: 'x', body: '   ' })).toBe(false);
  });
});

describe('timer tab', () => {
  it('previews the full time before Show and returns it as the content', () => {
    const { tabs } = setup();
    expect(tabs.timer.preview().has).toBe(false);
    expect(tabs.timer.load(timerItem(300, 'Back in'))).toBe(true);
    expect(tabs.timer.preview()).toMatchObject({ has: true, text: '5:00', sub: 'Timer · Back in' });
    expect(tabs.timer.getContent()).toEqual({ title: 'Back in', body: '', timer: { remainingMs: 300_000 } });
  });

  it('starts the clock at Show and returns the running end time', () => {
    const { tabs, clock } = setup();
    tabs.timer.load(timerItem(300));
    tabs.timer.markShown();
    expect(tabs.timer.getContent().timer).toEqual({ endAt: clock.t + 300_000 });
    clock.t += 60_000;
    expect(tabs.timer.preview().text).toBe('4:00');
  });

  it('refuses an invalid timer and keeps the loaded one', () => {
    const { tabs } = setup();
    tabs.timer.load(timerItem(60));
    expect(tabs.timer.load(timerItem(-1))).toBe(false);
    expect(tabs.timer.preview().text).toBe('1:00');
  });

  it('reports a live clock only while a timer is on air', () => {
    const { tabs, session } = setup();
    tabs.timer.load(timerItem(300, 'Back in'));
    tabs.timer.markShown();
    expect(tabs.timer.live()).toBeNull();
    session.isLive = true;
    session.liveTab = 'timer';
    expect(tabs.timer.live()).toEqual({ text: '5:00', title: 'Back in', paused: false, canControl: true });
    session.liveTab = 'scripture';
    expect(tabs.timer.live()).toBeNull();
  });

  it('pause, resume and reset act on the running clock through session.updateLive', () => {
    const { tabs, session, clock } = setup();
    session.isLive = true;
    session.liveTab = 'timer';
    tabs.timer.load(timerItem(300));
    tabs.timer.markShown();
    clock.t += 100_000;
    tabs.timer.pause();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { remainingMs: 200_000 } });
    expect(tabs.timer.live().paused).toBe(true);
    tabs.timer.resume();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { endAt: clock.t + 200_000 } });
    tabs.timer.reset();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { endAt: clock.t + 300_000 } });
  });

  it('loading a different timer while one is on air leaves the live clock alone', () => {
    const { tabs, session, clock } = setup();
    session.isLive = true;
    session.liveTab = 'timer';
    tabs.timer.load(timerItem(300, 'Live one'));
    tabs.timer.markShown();
    clock.t += 30_000;
    tabs.timer.load(timerItem(900, 'Next one'));
    expect(tabs.timer.live()).toMatchObject({ title: 'Live one', text: '4:30' });
    tabs.timer.pause();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { remainingMs: 270_000 } });
    expect(tabs.timer.getContent().timer).toEqual({ remainingMs: 900_000 });
  });

  it('does nothing when Pause is pressed and no timer is on air', () => {
    const { tabs, session } = setup();
    tabs.timer.load(timerItem(300));
    tabs.timer.markShown();
    tabs.timer.pause();
    expect(session.updateLive).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/dock/session-extras.test.js tests/dock/timer-run.test.js tests/dock/extras-tab.test.js`
Expected: FAIL (`timer-run.js` and `extras-tab.js` do not exist; `session` rejects the new tab names).

- [ ] **Step 3: Write `src/dock/timer-run.js`**

```js
import { clockEndAt, isValidTimerSpec } from '../plan/extras.js';
import { remainingMs } from '../overlay/timer-clock.js';

const specOf = (item) => (item.mode === 'clock' ? { mode: 'clock', at: item.at } : { mode: 'duration', seconds: item.seconds });
const fullMs = (spec) => spec.seconds * 1000;

/**
 * The dock's timer clock. `loaded` is the timer you are looking at in the live
 * bar; `running` is the clock that was started at Show. They are separate on
 * purpose: loading the next plan item must never touch a clock that is on air.
 */
export function createTimerRun(now = Date.now) {
  let loaded = null;    // { spec, title }
  let running = null;   // { spec, title, timer }, timer is { endAt } or { remainingMs }

  const isPaused = () => !!running && typeof running.timer.endAt !== 'number';
  const canControl = () => !!running && running.spec.mode === 'duration';

  /** What the timer would show right now if it went on air: the full time, or the time left until the clock time. */
  function previewTimer(spec) {
    return spec.mode === 'clock' ? { endAt: clockEndAt(spec.at, now()) } : { remainingMs: fullMs(spec) };
  }

  return {
    load(item) {
      if (!isValidTimerSpec(item)) return false;
      loaded = { spec: specOf(item), title: (item.title || '').trim() };
      return true;
    },
    loaded: () => loaded,
    previewTimer,
    /** The loaded timer goes on air: a duration starts from the full time, a clock timer follows the clock. */
    start() {
      if (!loaded) return null;
      const { spec, title } = loaded;
      const timer = spec.mode === 'clock' ? { endAt: clockEndAt(spec.at, now()) } : { endAt: now() + fullMs(spec) };
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
    remainingNow: () => (running ? remainingMs(running.timer, now()) : null),
  };
}
```

- [ ] **Step 4: Write `src/dock/extras-tab.js`**

```js
import { createTimerRun } from './timer-run.js';
import { formatClock, remainingMs } from '../overlay/timer-clock.js';
import { describeTimerSpec } from '../plan/extras.js';

const DISPLAY_TICK_MS = 1000;
const NOTHING = { has: false, text: 'Nothing loaded', canNav: false };

/**
 * The announcement and timer "tabs": they have no panel of their own (the Plan
 * tab's editor and rows load them), but they register in the tabs registry so
 * the live bar can preview and Show them like a song or a verse.
 */
export function initExtrasTab({ session, refresh, now = Date.now, startTicker = true }) {
  const run = createTimerRun(now);
  let announcement = { title: '', body: '' };

  const announcementTab = {
    load(item) {
      announcement = { title: (item.title || '').trim(), body: (item.body || '').trim() };
      refresh();
      return announcement.body.length > 0;
    },
    getContent: () => ({ ...announcement }),
    preview() {
      if (!announcement.body) return { ...NOTHING, sub: 'Announcement' };
      return {
        has: true,
        text: announcement.body,
        sub: announcement.title ? 'Announcement · ' + announcement.title : 'Announcement',
        canNav: false,
      };
    },
    step() {},
  };

  function timerContent() {
    const loaded = run.loaded();
    if (!loaded) return { title: '', body: '', timer: { remainingMs: 0 } };
    const running = run.running();
    const timer = running && running.spec === loaded.spec ? running.timer : run.previewTimer(loaded.spec);
    return { title: loaded.title, body: '', timer };
  }

  const isLiveTimer = () => session.isLive && session.liveTab === 'timer' && !!run.running();

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
      if (!loaded) return { ...NOTHING, sub: 'Timer' };
      const { timer } = timerContent();
      return {
        has: true,
        text: formatClock(remainingMs(timer, now())),
        sub: 'Timer · ' + (loaded.title || describeTimerSpec(loaded.spec)),
        canNav: false,
      };
    },
    /** Show starts the loaded timer (a duration from its full time; pressing Show again restarts it). */
    markShown() { run.start(); },
    step() {},
    /** The clock that is on air, for the live bar's controls, or null. */
    live() {
      if (!isLiveTimer()) return null;
      const running = run.running();
      return { text: formatClock(run.remainingNow()), title: running.title, paused: run.isPaused(), canControl: run.canControl() };
    },
    pause()  { if (isLiveTimer() && run.pause())  pushLive(); },
    resume() { if (isLiveTimer() && run.resume()) pushLive(); },
    reset()  { if (isLiveTimer() && run.reset())  pushLive(); },
  };

  // Display only: the dock's own digits follow the clock once a second. The overlay counts by itself.
  if (startTicker) {
    setInterval(() => {
      if (session.activeTab === 'timer' || session.liveTab === 'timer') refresh();
    }, DISPLAY_TICK_MS);
  }

  return { announcement: announcementTab, timer: timerTab };
}
```

- [ ] **Step 5: Edit `src/dock/session.js`.**

(a) Replace `const TABS = ['scripture', 'songs'];` with:
```js
// Tab name to the kind of thing it puts on screen.
const KIND_OF = { scripture: 'verse', songs: 'song', announcement: 'announcement', timer: 'timer' };
const TABS = Object.keys(KIND_OF);
```
(b) Replace the whole `content` function with:
```js
  function content(tab) {
    const provided = providers[tab] ? providers[tab]() : {};
    return { kind: KIND_OF[tab], title: '', reference: '', body: '', ...provided };
  }
```
(c) In `show()`, replace `s.liveContent = { kind: state.kind, title: state.title, reference: state.reference, body: state.body };` with `s.liveContent = { kind: state.kind, title: state.title, reference: state.reference, body: state.body, timer: state.timer };`.
(d) Add a getter after `get phase()     { return s.phase; },`: `get liveContent() { return s.liveContent; },`.
(e) Add after `resendIfLive`:
```js
    /** Change part of what is on air (a paused or reset timer) and send it. Does nothing unless something is live. */
    updateLive(patch) {
      if (!s.isLive || !s.liveContent) return;
      s.liveContent = { ...s.liveContent, ...patch };
      transport.send({ ...readSettings(), action: 'show', visible: true, ...s.liveContent });
      notify();
    },
```

- [ ] **Step 6: Edit `src/dock/live-bar.js`.**

(a) After the `EMPTY_PREVIEW` line add:
```js
const NEEDS = {
  scripture: 'Look up a verse first.',
  songs: 'No slide text to display.',
  announcement: 'Write the announcement first.',
  timer: 'Set up the timer first.',
};
const LIVE_MSG = {
  scripture: 'Verse is live.',
  songs: 'Slide is live.',
  announcement: 'Announcement is live.',
  timer: 'Timer is running.',
};
```
(b) Replace the `liveLabel` function with:
```js
  function liveLabel() {
    if (session.phase !== 'live') return '';
    if (session.liveTab === 'scripture') return 'Verse';
    if (session.liveTab === 'announcement' || session.liveTab === 'timer') {
      const name = session.liveTab === 'timer' ? 'Timer' : 'Announcement';
      const title = session.liveContent ? session.liveContent.title : '';
      return title ? name + ' · ' + title : name;
    }
    const title = tabs.songs ? tabs.songs.getContent().title : '';
    return title ? 'Song · ' + title : 'Song';
  }
```
(c) Replace `setStatus(session.activeTab === 'scripture' ? 'Look up a verse first.' : 'No slide text to display.', 'error');` with `setStatus(NEEDS[session.activeTab] || 'Nothing to show.', 'error');` and `setStatus(session.activeTab === 'scripture' ? 'Verse is live.' : 'Slide is live.', 'success');` with `setStatus(LIVE_MSG[session.activeTab] || 'Live.', 'success');`.

- [ ] **Step 7: Edit `src/dock/main.js`.**

(a) Add `import { initExtrasTab } from './extras-tab.js';` after the `initPlanTab` import.
(b) Replace `        songs: () => (tabs.songs ? tabs.songs.getContent() : EMPTY_SONG),` with:
```js
        songs: () => (tabs.songs ? tabs.songs.getContent() : EMPTY_SONG),
        announcement: () => (tabs.announcement ? tabs.announcement.getContent() : EMPTY_SONG),
        timer: () => (tabs.timer ? tabs.timer.getContent() : { ...EMPTY_SONG, timer: { remainingMs: 0 } }),
```
(c) Directly after `liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });` add:
```js
    const extras = initExtrasTab({ session, refresh: () => liveBar.refresh() });
    tabs.announcement = extras.announcement;
    tabs.timer = extras.timer;
```

- [ ] **Step 8: Run the new tests, then everything**

Run: `npx vitest run tests/dock; npm test`
Expected: PASS, including the older `session.test.js` (its two-provider fixture still works because `content()` tolerates missing providers).

- [ ] **Step 9: Build, check nothing regressed, commit**

Run: `npm run build; npx playwright test --timeout=15000 --reporter=list`
Expected: PASS, 93 + 9 overlay specs from Task 2, no failures.

```bash
git add src tests dist
git commit -m "feat: session tabs for announcements and timers, running clock and extras tab"
```

---

### Task 5: The editor, plan integration and Show now

**Files:**
- Create: `src/dock/extras-editor.js`, `src/css/extras.css`, `smoke/extras.spec.js`, `tests/plan/extras-inputs.test.js`, `tests/plan/model-replace.test.js`
- Modify: `src/plan/extras.js`, `src/plan/model.js`, `src/dock/plan-tab.js`, `src/html/dock.html`, `build.mjs`

**Interfaces:**
- Consumes: `parseClockInput`, `MAX_TIMER_SECONDS` (Task 3); `announcementItem`, `timerItem` (Task 3); `tabs.announcement.load`, `tabs.timer.load`, `tabs.timer.markShown` and `session` (Task 4).
- Produces: in `src/plan/extras.js`, `announcementFromInputs({ title, body }): { ok: true, draft } | { ok: false, hint }` and `timerFromInputs({ mode, title, minutes, seconds, clock }): { ok: true, draft } | { ok: false, hint }`, where a draft is `{ type: 'announcement', title, body }` or `{ type: 'timer', mode: 'duration', seconds, title }` / `{ type: 'timer', mode: 'clock', at, title }`. In `src/plan/model.js`, `replaceItem(plan, id, item)`: swaps in a whole new item but keeps the old id. `initExtrasEditor({ onAdd(draft), onSave(draft, id), onShowNow(draft) })` returning `{ open({ type, item? }), close(), isOpen() }`. DOM ids: `btn-plan-add-announcement`, `btn-plan-add-timer`, `extras-editor`, `ed-heading`, `ed-title`, `ed-text`, `ed-announcement-fields`, `ed-timer-fields`, `ed-mode`, `ed-duration-fields`, `ed-clock-fields`, `ed-minutes`, `ed-seconds`, `ed-clock`, `ed-hint`, `ed-add`, `ed-show`, `ed-cancel`.

- [ ] **Step 1: Write the failing unit tests.** `tests/plan/extras-inputs.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { announcementFromInputs, timerFromInputs } from '../../src/plan/extras.js';

describe('announcementFromInputs', () => {
  it('needs text and trims both fields', () => {
    expect(announcementFromInputs({ title: ' Welcome ', body: ' Hello ' })).toEqual({ ok: true, draft: { type: 'announcement', title: 'Welcome', body: 'Hello' } });
    expect(announcementFromInputs({ title: 'x', body: '   ' })).toEqual({ ok: false, hint: 'Write the text to show.' });
    expect(announcementFromInputs({}).ok).toBe(false);
  });
});

describe('timerFromInputs: duration', () => {
  const base = { mode: 'duration', title: ' Back in ' };
  it('turns minutes and seconds into whole seconds', () => {
    expect(timerFromInputs({ ...base, minutes: '5', seconds: '0' })).toEqual({ ok: true, draft: { type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' } });
    expect(timerFromInputs({ ...base, minutes: '', seconds: '45' }).draft.seconds).toBe(45);
    expect(timerFromInputs({ ...base, minutes: '90', seconds: '' }).draft.seconds).toBe(5400);
    expect(timerFromInputs({ ...base, minutes: '5999', seconds: '59' }).draft.seconds).toBe(359999);
  });
  it('explains what is wrong', () => {
    expect(timerFromInputs({ ...base, minutes: '', seconds: '' })).toEqual({ ok: false, hint: 'Enter a time of at least 1 second.' });
    expect(timerFromInputs({ ...base, minutes: '0', seconds: '0' }).ok).toBe(false);
    expect(timerFromInputs({ ...base, minutes: '1.5', seconds: '0' }).hint).toBe('Use whole numbers for minutes and seconds.');
    expect(timerFromInputs({ ...base, minutes: '-1', seconds: '0' }).hint).toBe('Use whole numbers for minutes and seconds.');
    expect(timerFromInputs({ ...base, minutes: 'ten', seconds: '0' }).ok).toBe(false);
    expect(timerFromInputs({ ...base, minutes: '1', seconds: '75' }).hint).toBe('Seconds go up to 59.');
    expect(timerFromInputs({ ...base, minutes: '6000', seconds: '0' }).hint).toBe('The longest timer is 99:59:59.');
  });
});

describe('timerFromInputs: clock time', () => {
  it('accepts friendly times and rejects bad ones', () => {
    expect(timerFromInputs({ mode: 'clock', title: '', clock: '9:05' })).toEqual({ ok: true, draft: { type: 'timer', mode: 'clock', at: '09:05', title: '' } });
    expect(timerFromInputs({ mode: 'clock', title: '', clock: '25:99' })).toEqual({ ok: false, hint: 'Enter a 24-hour time such as 10:30.' });
    expect(timerFromInputs({ mode: 'clock', title: '', clock: '' }).ok).toBe(false);
  });
});
```

`tests/plan/model-replace.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { replaceItem, timerItem } from '../../src/plan/model.js';

const plan = { v: 1, id: 'p', name: 'P', items: [
  { id: 'a', type: 'song', songId: 's' },
  { id: 'b', type: 'timer', mode: 'duration', seconds: 300, title: 'Back in' },
] };

describe('replaceItem', () => {
  it('swaps in a whole new item, keeps the id, and drops fields the new item does not have', () => {
    const next = replaceItem(plan, 'b', timerItem({ mode: 'clock', at: '10:30', title: 'Start' }, () => 'zzz'));
    expect(next.items[1]).toEqual({ id: 'b', type: 'timer', mode: 'clock', at: '10:30', title: 'Start' });
    expect('seconds' in next.items[1]).toBe(false);
    expect(next.items[0]).toBe(plan.items[0]);
    expect(plan.items[1].seconds).toBe(300);
  });
  it('returns the same plan for an unknown id', () => {
    expect(replaceItem(plan, 'nope', plan.items[0])).toBe(plan);
  });
});
```

- [ ] **Step 2: Write the failing browser specs.** Create `smoke/extras.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { openPair } from './helpers.js';

const titles = (dock) => dock.locator('.plan-item .plan-title').allTextContents();
const bodyOf = (overlay) => overlay.locator('#ov-body');

async function openEditor(dock, which) {
  await dock.click('#tab-plan');
  await dock.click('#btn-plan-add-' + which);
  await expect(dock.locator('#extras-editor')).toBeVisible();
}

async function fillAnnouncement(dock, { title = '', text }) {
  await dock.fill('#ed-title', title);
  await dock.fill('#ed-text', text);
}

async function fillDuration(dock, { title = '', minutes = '', seconds = '' }) {
  await dock.fill('#ed-title', title);
  await dock.fill('#ed-minutes', minutes);
  await dock.fill('#ed-seconds', seconds);
}

const nearMidnight = () => new Date(Date.now() + 5 * 60_000).getDate() !== new Date().getDate();

test.describe('announcements', () => {
  test('Show now puts the announcement on air without touching the plan', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await expect(dock.locator('#ed-show')).toBeDisabled();
    await expect(dock.locator('#ed-hint')).toHaveText('Write the text to show.');
    await fillAnnouncement(dock, { title: 'Welcome', text: 'Please silence your phones.' });
    await expect(dock.locator('#ed-show')).toBeEnabled();
    await dock.click('#ed-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Welcome');
    await expect(bodyOf(overlay)).toHaveText('Please silence your phones.');
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    await expect(dock.locator('#status-what')).toHaveText('Announcement · Welcome');
    await expect(dock.locator('#extras-editor')).toBeHidden();
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
  });

  test('Add to plan creates a row that Next item loads and Show puts on air', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Offering', text: 'Please give generously.' });
    await dock.click('#ed-add');
    await expect(dock.locator('#extras-editor')).toBeHidden();
    expect(await titles(dock)).toEqual(['Offering']);
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Please give generously.');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText('Please give generously.');
  });

  test('Edit from the row menu changes the plan, not the screen', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Welcome', text: 'First version' });
    await dock.click('#ed-add');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText('First version');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await expect(dock.locator('#ed-heading')).toHaveText('Edit announcement');
    await expect(dock.locator('#ed-text')).toHaveValue('First version');
    await expect(dock.locator('#ed-add')).toHaveText('Save');
    await dock.fill('#ed-text', 'Second version');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item')).toHaveCount(1);
    await expect(bodyOf(overlay)).toHaveText('First version');
    await dock.locator('.plan-item .plan-title').click();
    await expect(dock.locator('#preview-text')).toHaveText('Second version');
  });
});

test.describe('timers', () => {
  test('Show now starts a duration timer that counts down on the overlay', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Back in', minutes: '5', seconds: '0' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Back in');
    await expect(bodyOf(overlay)).toHaveText(/^(5:00|4:5\d)$/);
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    await expect(dock.locator('#status-what')).toHaveText('Timer · Back in');
    const first = await bodyOf(overlay).textContent();
    await expect.poll(async () => bodyOf(overlay).textContent(), { timeout: 4000 }).not.toBe(first);
  });

  test('a clock-time timer counts down to that time today', async ({ context }) => {
    test.skip(nearMidnight(), 'the target time would fall on tomorrow');
    const { dock, overlay } = await openPair(context);
    const target = new Date(Date.now() + 5 * 60_000);
    const at = String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
    await openEditor(dock, 'timer');
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-title', 'Service starts in');
    await dock.fill('#ed-clock', at);
    await dock.click('#ed-show');
    await expect(bodyOf(overlay)).toHaveText(/^[3-5]:\d\d$/);
  });

  test('invalid timer input disables both buttons and says why', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock, 'timer');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await expect(dock.locator('#ed-hint')).toHaveText('Enter a time of at least 1 second.');
    await fillDuration(dock, { minutes: '0', seconds: '75' });
    await expect(dock.locator('#ed-hint')).toHaveText('Seconds go up to 59.');
    await expect(dock.locator('#ed-show')).toBeDisabled();
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-clock', '25:99');
    await expect(dock.locator('#ed-hint')).toHaveText('Enter a 24-hour time such as 10:30.');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await dock.fill('#ed-clock', '10:30');
    await expect(dock.locator('#ed-add')).toBeEnabled();
    await dock.click('#ed-cancel');
    await expect(dock.locator('#extras-editor')).toBeHidden();
  });

  test('a planned timer survives a reload, loads with its full time and starts at Show', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Prayer', minutes: '1', seconds: '30' });
    await dock.click('#ed-add');
    await dock.reload();
    expect(await titles(dock)).toEqual(['Prayer']);
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('1:30');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('1:30');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText(/^(1:30|1:2\d)$/);
  });

  test('editing a duration timer into a clock timer drops the old duration', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Prayer', minutes: '1', seconds: '30' });
    await dock.click('#ed-add');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-clock', '10:30');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('at 10:30');
    const stored = await dock.evaluate(() => localStorage.getItem('obs-stage-plans'));
    expect(stored).toContain('"at":"10:30"');
    expect(stored).not.toContain('"seconds"');
  });
});

test.describe('plan safety', () => {
  test('hand-edited invalid items are unsupported rows, skipped by Next item, and never rewritten', async ({ context }) => {
    const seeded = { v: 1, id: 'p_seed', name: 'Seeded', items: [
      { id: 'i_bad1', type: 'timer', mode: 'duration', seconds: -5, title: 'Bad' },
      { id: 'i_bad2', type: 'timer', mode: 'clock', at: '25:99', title: '' },
      { id: 'i_bad3', type: 'announcement', title: 'Empty', body: '  ' },
      { id: 'i_ok', type: 'announcement', title: 'Fine', body: 'Good text' },
    ] };
    await context.addInitScript(([key, lastKey, value]) => {
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify([value])); localStorage.setItem(lastKey, value.id); }
    }, ['obs-stage-plans', 'obs-stage-last-plan', seeded]);
    const { dock } = await openPair(context);
    const rows = dock.locator('.plan-item');
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 3; i += 1) await expect(rows.nth(i)).toHaveClass('plan-item missing');
    await dock.click('#btn-next-item');
    await expect(dock.locator('.plan-item.cur .plan-title')).toHaveText('Fine');
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Extra', text: 'Another' });
    await dock.click('#ed-add');
    await expect(rows).toHaveCount(5);
    const stored = await dock.evaluate(() => localStorage.getItem('obs-stage-plans'));
    expect(stored).toContain('"seconds":-5');
    expect(stored).toContain('"at":"25:99"');
  });
});

test.describe('layout', () => {
  test('the four add buttons and the timer editor fit a 380px dock', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.setViewportSize({ width: 380, height: 720 });
    await dock.click('#tab-plan');
    for (const id of ['song', 'verse', 'announcement', 'timer']) await expect(dock.locator('#btn-plan-add-' + id)).toBeVisible();
    const sideways = () => dock.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    await dock.click('#btn-plan-add-timer');
    await dock.click('#ed-mode button[data-value="clock"]');
    expect(await sideways()).toBe(false);
    await dock.click('#ed-mode button[data-value="duration"]');
    await fillDuration(dock, { title: 'A very long timer title that keeps going and going and going on', minutes: '5', seconds: '0' });
    expect(await sideways()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the unit tests to verify they fail**

Run: `npx vitest run tests/plan/extras-inputs.test.js tests/plan/model-replace.test.js`
Expected: FAIL (`announcementFromInputs`, `timerFromInputs` and `replaceItem` are not exported).

- [ ] **Step 4: Append to `src/plan/extras.js`**

```js

const WHOLE_NUMBER = /^\d+$/;

/** Read the announcement editor. { ok: true, draft } or { ok: false, hint }. */
export function announcementFromInputs({ title = '', body = '' }) {
  if (!body.trim()) return { ok: false, hint: 'Write the text to show.' };
  return { ok: true, draft: { type: 'announcement', title: title.trim(), body: body.trim() } };
}

/** Read the timer editor. minutes, seconds and clock are the raw field texts. */
export function timerFromInputs({ mode, title = '', minutes = '', seconds = '', clock = '' }) {
  const label = title.trim();
  if (mode === 'clock') {
    const at = parseClockInput(clock);
    return at
      ? { ok: true, draft: { type: 'timer', mode: 'clock', at, title: label } }
      : { ok: false, hint: 'Enter a 24-hour time such as 10:30.' };
  }
  const m = minutes.trim() || '0';
  const s = seconds.trim() || '0';
  if (!WHOLE_NUMBER.test(m) || !WHOLE_NUMBER.test(s)) return { ok: false, hint: 'Use whole numbers for minutes and seconds.' };
  if (Number(s) > 59) return { ok: false, hint: 'Seconds go up to 59.' };
  const total = Number(m) * 60 + Number(s);
  if (total < 1) return { ok: false, hint: 'Enter a time of at least 1 second.' };
  if (total > MAX_TIMER_SECONDS) return { ok: false, hint: 'The longest timer is 99:59:59.' };
  return { ok: true, draft: { type: 'timer', mode: 'duration', seconds: total, title: label } };
}
```

- [ ] **Step 5: Append to `src/plan/model.js`**

```js

/** Swap in a whole new item at the same place, keeping the old id (fields the new item lacks are dropped). */
export function replaceItem(plan, id, item) {
  if (!plan.items.some((i) => i.id === id)) return plan;
  return { ...plan, items: plan.items.map((i) => (i.id === id ? { ...item, id } : i)) };
}
```

- [ ] **Step 6: Run the unit tests**

Run: `npx vitest run tests/plan; npm test`
Expected: PASS.

- [ ] **Step 7: Edit `src/html/dock.html`.** Replace

```html
    <div class="row">
      <button id="btn-plan-add-song" class="btn btn-ghost grow" type="button">+ Song</button>
      <button id="btn-plan-add-verse" class="btn btn-ghost grow" type="button">+ Verse</button>
    </div>
```
with

```html
    <div class="row wrap add-row">
      <button id="btn-plan-add-song" class="btn btn-ghost" type="button">+ Song</button>
      <button id="btn-plan-add-verse" class="btn btn-ghost" type="button">+ Verse</button>
      <button id="btn-plan-add-announcement" class="btn btn-ghost" type="button">+ Announcement</button>
      <button id="btn-plan-add-timer" class="btn btn-ghost" type="button">+ Timer</button>
    </div>
    <div id="extras-editor" class="extras-editor hidden" role="group" aria-labelledby="ed-heading">
      <strong id="ed-heading">New announcement</strong>
      <label class="lbl" for="ed-title">Title <span class="faint">(optional)</span></label>
      <input id="ed-title" class="field" type="text" autocomplete="off" spellcheck="false">
      <div id="ed-announcement-fields">
        <label class="lbl" for="ed-text">Text</label>
        <textarea id="ed-text" class="area" placeholder="What should appear on screen?"></textarea>
      </div>
      <div id="ed-timer-fields" class="hidden">
        <div id="ed-mode" class="seg" role="group" aria-label="Timer type">
          <button type="button" data-value="duration">Duration</button>
          <button type="button" data-value="clock">Clock time</button>
        </div>
        <div id="ed-duration-fields" class="row">
          <label class="lbl">Minutes <input id="ed-minutes" class="field" type="number" min="0" max="5999" inputmode="numeric"></label>
          <label class="lbl">Seconds <input id="ed-seconds" class="field" type="number" min="0" max="59" inputmode="numeric"></label>
        </div>
        <div id="ed-clock-fields" class="hidden">
          <label class="lbl" for="ed-clock">Count down to (24-hour, such as 10:30)</label>
          <input id="ed-clock" class="field" type="text" inputmode="numeric" placeholder="10:30" autocomplete="off">
        </div>
      </div>
      <p id="ed-hint" class="faint"></p>
      <div class="row">
        <button id="ed-add" class="btn btn-primary grow" type="button">Add to plan</button>
        <button id="ed-show" class="btn btn-ghost" type="button">Show now</button>
        <button id="ed-cancel" class="btn btn-ghost" type="button">Cancel</button>
      </div>
    </div>
```

- [ ] **Step 8: Create `src/css/extras.css` and register it.**

```css
.add-row .btn { flex: 1 1 45%; }
.extras-editor { display: flex; flex-direction: column; gap: var(--space-2); padding: 10px; border: 1px solid var(--border-strong);
  border-radius: var(--r-card); background: var(--surface); min-width: 0; }
.extras-editor .row { align-items: flex-end; }
.extras-editor label.lbl { flex: 1; min-width: 0; }
.extras-editor input.field { margin-top: 4px; }
.extras-editor .btn { min-height: 40px; }

.timer-controls { display: flex; align-items: center; gap: var(--space-2); }
.timer-live-text { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

In `build.mjs` change the `DOCK_SHEETS` list so it ends `'banners', 'plan', 'extras'];`.

- [ ] **Step 9: Create `src/dock/extras-editor.js`**

```js
import { $ } from './util.js';
import { announcementFromInputs, timerFromInputs } from '../plan/extras.js';

/**
 * The inline editor for announcements and timers. It only reads and validates
 * the fields; what to do with a valid draft (add, save, show now) is decided by
 * the callbacks.
 */
export function initExtrasEditor({ onAdd, onSave, onShowNow }) {
  const root = $('extras-editor'), heading = $('ed-heading'), title = $('ed-title'), text = $('ed-text'),
        announcementFields = $('ed-announcement-fields'), timerFields = $('ed-timer-fields'),
        modeButtons = [...document.querySelectorAll('#ed-mode button')],
        durationFields = $('ed-duration-fields'), clockFields = $('ed-clock-fields'),
        minutes = $('ed-minutes'), seconds = $('ed-seconds'), clock = $('ed-clock'), hint = $('ed-hint'),
        btnAdd = $('ed-add'), btnShow = $('ed-show'), btnCancel = $('ed-cancel');

  let type = 'announcement';
  let mode = 'duration';
  let editingId = null;

  function read() {
    return type === 'announcement'
      ? announcementFromInputs({ title: title.value, body: text.value })
      : timerFromInputs({ mode, title: title.value, minutes: minutes.value, seconds: seconds.value, clock: clock.value });
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach((button) => {
      const on = button.dataset.value === mode;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    durationFields.classList.toggle('hidden', mode !== 'duration');
    clockFields.classList.toggle('hidden', mode !== 'clock');
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
    heading.textContent = (item ? 'Edit ' : 'New ') + (type === 'announcement' ? 'announcement' : 'timer');
    announcementFields.classList.toggle('hidden', type !== 'announcement');
    timerFields.classList.toggle('hidden', type !== 'timer');
    title.value = item ? (item.title || '') : '';
    text.value = item && type === 'announcement' ? (item.body || '') : '';
    setMode(item && item.mode === 'clock' ? 'clock' : 'duration');
    const total = item && item.mode === 'duration' && Number.isInteger(item.seconds) && item.seconds > 0 ? item.seconds : 0;
    minutes.value = total ? String(Math.floor(total / 60)) : '';
    seconds.value = total ? String(total % 60) : '';
    clock.value = item && item.mode === 'clock' ? (item.at || '') : '';
    btnAdd.textContent = item ? 'Save' : 'Add to plan';
    root.classList.remove('hidden');
    update();
    (type === 'announcement' ? text : minutes).focus();
  }

  [title, text, minutes, seconds, clock].forEach((field) => field.addEventListener('input', update));
  modeButtons.forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.value); update(); }));

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

- [ ] **Step 10: Edit `src/dock/plan-tab.js`.**

(a) Replace the model import line with `import { createPlan, addItem, songItem, readingItem, announcementItem, timerItem, renamePlan, moveItem, moveItemTo, removeItem, replaceItem, DEFAULT_PLAN_NAME } from '../plan/model.js';` and add directly below the cursor import: `import { describeTimerSpec } from '../plan/extras.js';` and `import { initExtrasEditor } from './extras-editor.js';`.
(b) Replace `const TYPE_ICON = { song: '♫', reading: '✝' };` with `const TYPE_ICON = { song: '♫', reading: '✝', announcement: '✎', timer: '⏱' };`.
(c) In `statusText`, replace `    return item.translation || 'reading';` with:
```js
    if (item.type === 'announcement') return 'announcement';
    if (item.type === 'timer') return describeTimerSpec(item);
    return item.translation || 'reading';
```
(d) In `loadItem`, replace
```js
      } else {
        const ok = await tabs.scripture.loadReading(item.ref, item.translation);
```
with
```js
      } else if (item.type === 'announcement' || item.type === 'timer') {
        tabs[item.type].load(item);
        session.setTab(item.type);
      } else {
        const ok = await tabs.scripture.loadReading(item.ref, item.translation);
```
(e) Directly before `  function renderSelect() {` insert:
```js
  // ── Announcements and timers: the editor ──────────────────────────────────

  const draftItem = (draft) => (draft.type === 'announcement' ? announcementItem(draft) : timerItem(draft));

  /** Put a draft on air right now. The plan is not touched. */
  function showNow(draft) {
    const item = draftItem(draft);
    if (!tabs[draft.type].load(item)) { setStatus('That could not be loaded.', 'error'); return; }
    session.setTab(draft.type);
    if (tabs[draft.type].markShown) tabs[draft.type].markShown();
    session.show();
    setStatus(draft.type === 'timer' ? 'Timer is running.' : 'Announcement is live.', 'success');
  }

  const editor = initExtrasEditor({
    onAdd: (draft) => {
      edit((p) => addItem(p, draftItem(draft), currentId));
      setStatus('Added ' + (draft.title || draft.type) + ' to the plan.', 'success');
    },
    onSave: (draft, id) => {
      edit((p) => replaceItem(p, id, draftItem(draft)));
      setStatus('Saved.', 'success');
    },
    onShowNow: showNow,
  });

```
(f) In `renderActions`, replace `    actions.append(up, down, actionButton('btn btn-danger', 'Remove', () => removeRow(item.id)));` with:
```js
    const canEdit = item.type === 'announcement' || item.type === 'timer';
    const editButton = canEdit ? [actionButton('btn btn-ghost', 'Edit', () => editor.open({ type: item.type, item }))] : [];
    actions.append(...editButton, up, down, actionButton('btn btn-danger', 'Remove', () => removeRow(item.id)));
```
(g) Directly before `  btnNext.addEventListener('click', nextItem);` add:
```js
  $('btn-plan-add-announcement').addEventListener('click', () => editor.open({ type: 'announcement' }));
  $('btn-plan-add-timer').addEventListener('click', () => editor.open({ type: 'timer' }));
```

- [ ] **Step 11: Build and run the new browser specs**

Run: `npm run build; npx playwright test smoke/extras.spec.js --timeout=15000 --reporter=list`
Expected: PASS, 10 specs. If `Edit from the row menu changes the plan, not the screen` fails on the last preview assertion, check that `loadItem` re-reads the item from the current plan (it receives the item object from the last render, which `edit()` re-renders after saving).

- [ ] **Step 12: Run both suites and commit**

Run: `npm test; npx playwright test --timeout=15000`
Expected: PASS everywhere (existing 93 + 9 + 10 browser specs).

```bash
git add src tests smoke build.mjs dist
git commit -m "feat: announcement and timer editor in the Plan tab, Show now and Edit"
```

---

### Task 6: Live controls for a running timer

**Files:**
- Modify: `src/html/dock.html`, `src/dock/live-bar.js`, `smoke/extras.spec.js`

**Interfaces:**
- Consumes: `tabs.timer.live()`, `tabs.timer.pause()`, `tabs.timer.resume()`, `tabs.timer.reset()` (Task 4); the `.timer-controls` and `.timer-live-text` styles (Task 5); `openEditor`, `fillDuration`, `fillAnnouncement`, `bodyOf` helpers in `smoke/extras.spec.js` (Task 5).
- Produces: a controls row in the live bar (`#timer-controls`, `#timer-live-text`, `#btn-timer-pause`, `#btn-timer-reset`) that shows only while a timer is on air. The pause button reads Pause or Resume. A clock-time timer shows the digits but no buttons.

- [ ] **Step 1: Write the failing browser specs.** Append to `smoke/extras.spec.js`:

```js
async function showTimerNow(dock, { title = 'Back in', minutes = '5', seconds = '0' } = {}) {
  await openEditor(dock, 'timer');
  await fillDuration(dock, { title, minutes, seconds });
  await dock.click('#ed-show');
}

test.describe('timer controls while on air', () => {
  test('the dock shows the live time, counting, with its title', async ({ context }) => {
    const { dock } = await openPair(context);
    await showTimerNow(dock);
    await expect(dock.locator('#timer-controls')).toBeVisible();
    await expect(dock.locator('#timer-live-text')).toContainText('Back in');
    await expect(dock.locator('#timer-live-text')).toContainText(/(5:00|4:5\d)/);
    const first = await dock.locator('#timer-live-text').textContent();
    await expect.poll(async () => dock.locator('#timer-live-text').textContent(), { timeout: 4000 }).not.toBe(first);
  });

  test('Pause freezes the overlay clock and Resume continues it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await expect(bodyOf(overlay)).toHaveText(/^(5:00|4:5\d)$/);
    await dock.click('#btn-timer-pause');
    await expect(dock.locator('#btn-timer-pause')).toHaveText('Resume');
    await expect(dock.locator('#timer-live-text')).toContainText('(paused)');
    await dock.waitForTimeout(500);
    const frozen = await bodyOf(overlay).textContent();
    await dock.waitForTimeout(1600);
    expect(await bodyOf(overlay).textContent()).toBe(frozen);
    await dock.click('#btn-timer-pause');
    await expect(dock.locator('#btn-timer-pause')).toHaveText('Pause');
    await expect.poll(async () => bodyOf(overlay).textContent(), { timeout: 4000 }).not.toBe(frozen);
  });

  test('Reset restarts from the full time', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await dock.waitForTimeout(2300);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-7]$/);
    await dock.click('#btn-timer-reset');
    await expect(bodyOf(overlay)).toHaveText(/^(5:00|4:59)$/);
  });

  test('pressing Show again restarts a duration timer', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await dock.waitForTimeout(2300);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-7]$/);
    await dock.click('#btn-show');
    await expect.poll(async () => bodyOf(overlay).textContent(), { timeout: 3000 }).toMatch(/^(5:00|4:59)$/);
  });

  test('an expired duration timer stays at 0:00 until Hide, then the controls go away', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock, { minutes: '0', seconds: '2' });
    await dock.waitForTimeout(3000);
    await expect(bodyOf(overlay)).toHaveText('0:00');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(dock.locator('#timer-live-text')).toContainText('0:00');
    await dock.click('#btn-hide');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await expect(dock.locator('#timer-controls')).toBeHidden();
  });

  test('a clock-time timer shows its digits but has no Pause or Reset', async ({ context }) => {
    test.skip(nearMidnight(), 'the target time would fall on tomorrow');
    const { dock } = await openPair(context);
    const target = new Date(Date.now() + 5 * 60_000);
    const at = String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
    await openEditor(dock, 'timer');
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-clock', at);
    await dock.click('#ed-show');
    await expect(dock.locator('#timer-controls')).toBeVisible();
    await expect(dock.locator('#timer-live-text')).toContainText(/[3-5]:\d\d/);
    await expect(dock.locator('#btn-timer-pause')).toBeHidden();
    await expect(dock.locator('#btn-timer-reset')).toBeHidden();
  });

  test('Next item while a timer is on air leaves the live clock alone, and Pause still pauses the live one', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Live clock', minutes: '5', seconds: '0' });
    await dock.click('#ed-add');
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Later', text: 'Coming up next' });
    await dock.click('#ed-add');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Live clock');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Coming up next');
    await expect(overlay.locator('#ov-title')).toHaveText('Live clock');
    await expect(dock.locator('#timer-controls')).toBeVisible();
    await dock.click('#btn-timer-pause');
    await expect(dock.locator('#btn-timer-pause')).toHaveText('Resume');
    await expect(overlay.locator('#ov-title')).toHaveText('Live clock');
    await expect(bodyOf(overlay)).toHaveText(/^\d:\d\d$/);
    await expect(bodyOf(overlay)).not.toHaveText('Coming up next');
  });

  test('a style change keeps the clock running instead of restarting or swapping it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await dock.waitForTimeout(2300);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-7]$/);
    await dock.click('#tab-style');
    await dock.click('#position-seg button[data-value="top"]');
    await expect(overlay.locator('#stage.pos-top')).toHaveCount(1);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-6]$/);
    await expect(overlay.locator('#ov-title')).toHaveText('Back in');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run build; npx playwright test smoke/extras.spec.js -g "timer controls while on air" --timeout=6000 --reporter=list`
Expected: FAIL (`#timer-controls` does not exist).

- [ ] **Step 3: Edit `src/html/dock.html`.** In the live bar, directly before `<div id="plan-line" class="plan-line hidden"></div>` add:

```html
    <div id="timer-controls" class="timer-controls hidden">
      <span id="timer-live-text" class="timer-live-text"></span>
      <button id="btn-timer-pause" class="btn btn-ghost" type="button">Pause</button>
      <button id="btn-timer-reset" class="btn btn-ghost" type="button">Reset</button>
    </div>
```

- [ ] **Step 4: Edit `src/dock/live-bar.js`.**

(a) Replace `btnNext = $('btn-next'), btnClear = $('btn-clear');` with:
```js
btnNext = $('btn-next'), btnClear = $('btn-clear'),
        timerControls = $('timer-controls'), timerText = $('timer-live-text'),
        btnTimerPause = $('btn-timer-pause'), btnTimerReset = $('btn-timer-reset');
```
(b) In `refresh()`, directly after `planLine.classList.toggle('hidden', !planText);` add:
```js
    const live = tabs.timer ? tabs.timer.live() : null;
    timerControls.classList.toggle('hidden', !live);
    if (live) {
      timerText.textContent = live.text + (live.paused ? ' (paused)' : '') + (live.title ? ' \u00b7 ' + live.title : '');
      btnTimerPause.textContent = live.paused ? 'Resume' : 'Pause';
      btnTimerPause.classList.toggle('hidden', !live.canControl);
      btnTimerReset.classList.toggle('hidden', !live.canControl);
    }
```
(c) After `btnNext.addEventListener('click', () => step(1));` add:
```js
  btnTimerPause.addEventListener('click', () => {
    const live = tabs.timer.live();
    if (!live) return;
    if (live.paused) tabs.timer.resume(); else tabs.timer.pause();
  });
  btnTimerReset.addEventListener('click', () => tabs.timer.reset());
```

- [ ] **Step 5: Build and run the controls specs**

Run: `npm run build; npx playwright test smoke/extras.spec.js --timeout=15000 --reporter=list`
Expected: PASS (the 10 Task 5 specs plus 8 new). If the style-change spec shows `5:00`, the restyle re-read the timer instead of the on-air snapshot: check that `session.show()` stores `timer` in `liveContent` (Task 4).

- [ ] **Step 6: Run both suites and commit**

Run: `npm test; npx playwright test --timeout=15000`
Expected: PASS everywhere.

```bash
git add src smoke dist
git commit -m "feat: Pause, Resume and Reset for a timer on air"
```

---

### Task 7: Coverage, README and final verification

**Files:**
- Modify: `vitest.config.js`, `README.md`, `dist/` (rebuilt)

**Interfaces:**
- Consumes: everything above.
- Produces: coverage that includes the new pure modules, user-facing docs.

- [ ] **Step 1: Include the new modules in coverage.** In `vitest.config.js` replace `'src/dock/settings-store.js',` with:
```js
'src/dock/settings-store.js',
        'src/overlay/timer-clock.js', 'src/dock/timer-run.js', 'src/dock/extras-tab.js',
```

Run: `npm run coverage`
Expected: PASS with thresholds met; the three new modules should be close to 100%.

- [ ] **Step 2: Update `README.md`.** Directly before the line `### Scripture tab` insert:

```
### Announcements and timers

On the Plan tab, **+ Announcement** and **+ Timer** open a small editor. Each has **Add to plan** and **Show now**; **Show now** puts it on screen straight away and does not touch any plan. To change one later, open its row's **⋯** menu and choose **Edit**.

- **Announcement.** An optional title and some text, shown in the same card as songs and verses, in your current theme and animation.
- **Timer.** A countdown by **duration** (minutes and seconds) or **to a clock time** such as 10:30. A duration timer starts when you press **Show**; **Pause** / **Resume** and **Reset** appear in the live bar while it is on screen. A clock-time timer just follows the clock. At zero it stays on screen showing 0:00 until you press **Hide**; a clock time that has already passed today shows 0:00.
- **Next item** loads announcements and timers like songs: into the live bar first, on screen only when you press **Show**. Loading the next item never changes a timer that is already on screen.
```

- [ ] **Step 3: Full verification**

Run, in order:
```bash
npm test
npm run coverage
npm run build
npx playwright test --timeout=15000
```
Expected: unit tests all pass (299 earlier plus about 70 new), coverage thresholds met, build prints `dist/ built`, Playwright passes (93 earlier plus 9 overlay, 10 editor and 8 controls specs, 120 in total). Read the output of each; any failure is fixed before continuing.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.js README.md dist
git commit -m "docs: announcements and timers in the README, new modules in coverage"
```

- [ ] **Step 5: Whole-branch review.** Build the diff from `git merge-base main HEAD` to `HEAD` (without `dist/`) and give it to a fresh reviewer on the most capable model with this plan's Review Focus section verbatim, the spec and plan paths, and the ledger's `Ruling:` lines. Fix Critical and Important findings test-first in one pass; ledger minors as deferred.

- [ ] **Step 6: Owner's manual check in real OBS 28+ (cannot be automated here).** Report these to the owner when the branch is ready: (1) a Show now announcement looks right in the real browser source with the frosted blur over live video; (2) a timer counts down steadily and the digits do not jitter; (3) Pause, Resume and Reset from the dock change the on-screen clock at once; (4) a clock-time timer to a few minutes from now ends at 0:00 on time; (5) a timer looks right under all four animations and all five themes; (6) Next item while a timer is on screen leaves it untouched until Show.
