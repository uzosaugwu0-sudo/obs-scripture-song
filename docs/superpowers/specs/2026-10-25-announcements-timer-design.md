# Announcements and timer design

Sub-project 3b of 3 (Features). Done: 3a run-order. Later: 3c local server + phone remote.

## Goal

Let a volunteer put two more things on screen: an **announcement** (a title and text, in the same card as songs and verses) and a **timer** (a countdown by duration or to a clock time). Both can sit in a plan as items, or be shown on the spot with a "Show now" action. The dock stays the only authority over what is on air.

## Decisions (from brainstorming)

- Announcement look: the existing card, title above and text below, in the current theme, position, font and animation. No separate lower-third strip this cycle.
- Timer: a countdown from a **duration** or **to a clock time**, with an optional title. No stopwatch or count-up.
- Announcements and timers live **inside the plan** as items that carry their own content, plus a **Show now** action for the unplanned moment. No shared library.
- A duration timer **starts when Show is pressed**. Pause and Reset are available while it is on air. A clock-time timer just follows the clock.
- At zero a timer **stays on screen showing 0:00** until Hide.
- One small **editor in the Plan tab** with Add to plan, Show now and Cancel; existing items are edited from the row menu.
- Approach: the **overlay counts the time itself** from an absolute end time sent by the dock. The dock does not stream ticks.

## Global constraints

- OBS 28+ over `file:///`: classic IIFE bundle via esbuild, no ES-module script tags, no fetch of local files.
- Immutable updates: model and store functions return new copies.
- The dock is the only authority over state; the overlay only renders what it is told.
- State `kind` stays an open set; plan item `type` stays an open set (unknown types are preserved and skipped).
- The nested `obs-scripture-song/obs-scripture-song/` copy is not touched. `dist/` is rebuilt and committed. Coverage stays at or above 80%.
- Existing behaviour for verses, songs and the plan is unchanged; their tests stay as they are.

## State and plan item shapes

- `KINDS` in `src/core/state.js` gains `announcement` and `timer`. `STATE_VERSION` stays 1 (new kinds and optional fields are backward compatible); an older overlay rejects the unknown kind and renders nothing.
- **announcement** reuses `title` (optional) and `body`.
- **timer** reuses `title` and adds an optional field `timer`: `{ endAt: <epoch ms> }` while running, or `{ remainingMs: <ms> }` while paused. `normalizeState` requires `endAt` to be a finite number or `remainingMs` a non-negative finite number for kind `timer`; anything else returns null (nothing is rendered).
- Plan items:
  - `{ "id", "type": "announcement", "title": "Welcome", "body": "Please silence your phones." }`
  - `{ "id", "type": "timer", "mode": "duration", "seconds": 300, "title": "Back in" }`
  - `{ "id", "type": "timer", "mode": "clock", "at": "10:30", "title": "Service starts in" }`
- Validity: an announcement needs a non-empty `body`; a duration is a whole number of seconds from 1 to 359999; a clock time is a real 24-hour `HH:MM`. Invalid items load as unsupported rows (skipped by Next item, never rewritten).
- A clock timer resolves "today's next occurrence of `at`" when Show is pressed. If that time has already passed today it counts as zero (shows `0:00`); it does not roll to tomorrow.
- `note` is not part of this cycle.

## Overlay

Changes are in `src/overlay/` and `src/css/overlay.css`.

- **announcement** renders like a song slide (title above when non-empty, body below) with a new `kind-announcement` class. Line by line splits the body as for songs.
- **timer** renders the title above and the digits as the body, with tabular numerals at a size slightly above body text (one named constant). Format `M:SS`, `H:MM:SS` from one hour up. Display rounds up so `0:00` appears only at real zero. A timer ignores the line-by-line stagger and simply rises in.
- `src/overlay/timer-clock.js` (pure): `remainingMs(timer, now)`, `formatClock(ms)`, `isStale(timer, now)`.
- One interval (250 ms) updates only the digits' text node; nothing re-animates each second. With `endAt` it counts against the computer's clock; with `remainingMs` it shows a frozen value; at zero it stays `0:00`.
- Last command wins: any show, hide or clear cancels the interval through the existing epoch rule, so a stale tick can never repaint a hidden or replaced card.
- Stale restore: a timer state whose `endAt` is more than one hour in the past renders nothing (for example a restored state after OBS restarts). A timer that expired a minute ago keeps showing `0:00`.

## Dock

- `src/dock/extras-tab.js` is registered twice in the tabs registry, as `tabs.announcement` and `tabs.timer`. It has no panel of its own; it holds what is loaded and supplies `getContent()`, `preview()` and `markShown()` as Songs and Scripture do. `session` gains the tab names `announcement` and `timer` (kinds `announcement`, `timer`).
- **Running clock vs loaded timer.** The module keeps one running clock (`endAt` or `remainingMs`) separate from the loaded timer. Show (through `markShown()`) starts a duration timer. Loading another item while a timer is on air never touches the live clock.
- `session.updateLive(patch)` merges a patch into the on-air snapshot and re-sends it. Pause, Resume and Reset use it, so they act only on the running clock. The on-air snapshot includes the `timer` field, so a restyle keeps the clock running.
- **Live bar controls.** When a duration timer is on air the live bar shows Pause / Resume and Reset (restart from the full time). A clock-time timer has none. The live label reads "Timer · title" or "Announcement". The dock's own preview digits refresh once a second for display only.
- **Editor** (Plan tab). The add row becomes a two-by-two grid: `+ Song  + Verse  + Announcement  + Timer`.
  - Announcement: optional Title, Text.
  - Timer: optional Title, Duration / Clock time switch, minutes and seconds, or an `HH:MM` field.
  - Buttons: **Add to plan** (inserted after the current item), **Show now** (loads and shows at once, replaces whatever is live, touches no plan), **Cancel**. Add and Show now stay disabled until the input is valid, with a one-line hint.
  - A row's ⋯ menu gains **Edit**, which opens the same editor filled in; the button reads **Save** and replaces the item in place. Saving an edit to the item that is on air changes the plan, not the screen.
- **Plan integration.** Next item and tapping a row load these types into the live bar (never on air until Show). Rows get icons (✎ announcement, ⏱ timer), a title (the title, or the first line of text / the time), and a status ("5:00", "at 10:30").
- `src/plan/model.js` gains `announcementItem`, `timerItem`, `updateItem`; `src/plan/cursor.js` learns status, title and summary for the new types.

## Errors

- Bad editor input disables the buttons and shows a hint; nothing invalid reaches the plan or the screen.
- Hand-edited invalid items become unsupported rows and are never rewritten.
- A changed system clock (daylight saving, manual change) while a clock timer is on air: it follows the new clock.
- Restyle while a timer is on air keeps the clock running.

## Testing

- Vitest: state validation for the new kinds and the timer field; the pure timer clock (remaining, rounding up, `M:SS` and `H:MM:SS`, paused vs running, expired and stale); plan model additions; cursor status, title and summary; `session.updateLive` and the new tab names.
- Playwright: Show now for an announcement and a timer (overlay text); a timer counting down and pausing; Reset; a clock-time timer; plan round trip (add, Next item, Show, edit via row menu, reload); Next item while a timer is live leaves the live clock alone; a style change leaves the on-air content alone; the 380px layout with four add buttons and the editor.
- Coverage stays at or above 80%.

## Files

New: `src/overlay/timer-clock.js`, `src/dock/extras-tab.js`, `src/css/extras.css`, tests. Changed: `src/core/state.js`, `src/overlay/render.js`, `src/css/overlay.css`, `src/dock/session.js`, `src/dock/live-bar.js`, `src/dock/plan-tab.js`, `src/dock/main.js`, `src/plan/model.js`, `src/plan/cursor.js`, `src/html/dock.html`, `build.mjs`, `README.md`, `dist/`.

## Build order

1. State validation and the pure timer clock.
2. Overlay rendering for both kinds.
3. Plan model and cursor additions.
4. Session changes and the extras tab, with Show now.
5. The editor, plan integration and the Edit action.
6. Live controls, the live-bar label and the dock-side digits.
7. Browser tests, README and the final review.

## Out of scope

Stopwatch or count-up; an end message at zero; a lower-third strip style; a shared library of announcements; the private note item; phone remote and server (3c).

## Risks

- The overlay interval must never survive a hide or clear: a stale tick repainting a hidden card would show on stream.
- Pause and Reset must act only on the running clock, never on the item merely loaded.
- The new tab names must not disturb the existing Show, Hide and arrow-key behaviour in the live bar.