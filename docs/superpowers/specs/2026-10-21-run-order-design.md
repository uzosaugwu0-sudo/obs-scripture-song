# Run-order (service plan) design

Sub-project 3a of 3 (Features). Later cycles: 3b announcements + timer, 3c local server + phone remote.

## Goal

Let a volunteer prepare an ordered service plan of songs and Bible readings, run it live with a deliberate **Next item** action, and change it while it runs. The dock stays the only authority over what is on air; the plan only chooses what to load.

## Decisions (from brainstorming)

- Prepared ahead **and** edited as you go.
- Arrows step slides inside the current item. Moving between items is a separate deliberate action (Next item button, `PageDown`; `PageUp` goes back; tapping a row jumps).
- Layout **C, Plan first**: Plan is the first and default tab (Plan, Scripture, Songs, Style) with a large Next item button.
- Plans are named files, one per service (`plans/<safe-name>.json` in the library folder). No paste-a-list import this cycle.
- Item types this cycle: `song` and `reading` only. The type set is open for later `announcement`, `timer`, `note`.
- Approach: new `src/plan/` module plus a Plan tab in the existing tabs registry. Next item calls the Songs/Scripture tabs' existing "load content" path. The live path is not rewritten.

## Global constraints

- OBS 28+ over `file:///`: classic IIFE bundle via esbuild, no ES-module script tags, no fetch of local files.
- Immutable updates: model functions return new copies.
- Reuse the library's folder and local-storage backends, safe filenames, collision handling and dirty tracking.
- Nested `obs-scripture-song/obs-scripture-song/` copy is not touched. `dist/` is rebuilt and committed. Coverage stays at or above 80%.
- The overlay is unchanged this cycle.

## Data model

```json
{ "v": 1, "id": "p_k3f9a2", "name": "Sunday 26 Oct",
  "items": [
    { "id": "i_1", "type": "song",    "songId": "amazing-grace" },
    { "id": "i_2", "type": "reading", "ref": "John 3:16-17", "translation": "KJV" } ] }
```

- Song items store the song id only and resolve against the library at load time.
- Reading items store reference text and translation; loading uses the existing lookup, so ranges work as in the Scripture tab.
- Unknown item types load as a greyed "unsupported item" row and are skipped. A song id that no longer exists shows "Song missing" and is skipped. The plan file is never rewritten for either.
- Storage: `plans/<safe-name>.json` in the library folder; local-storage fallback with the same banner as songs. Duplicate names become `Name (2)`. The last-used plan id is remembered and reopened.

## Modules

- `src/plan/model.js`: create, add (after a given item id), move, remove, rename, validate. Returns new copies.
- `src/plan/store.js`: list, load, save, duplicate, delete over the library backends; bad files are listed as "Unreadable: name.json" and never overwritten or deleted.
- `src/plan/cursor.js`: current-item pointer that follows the item **by id**; `nextLoadable`, `prevLoadable` skipping missing/unsupported items; end-of-plan state.
- `src/dock/plan-tab.js`: Plan tab UI, row menu (Move up, Move down, Remove), plan menu (New, Load, Duplicate, Rename, Delete), drag handle.
- `src/css/plan.css`: concatenated into `dist/css/dock.css`.

## Plan tab behaviour

- Header: plan name, plan menu, item count. List rows: drag handle, type icon (♫ / ✝), title, status (`slide 2/4` on current, `done`, missing). States: upcoming, current (green outline), done (dimmed), missing (greyed).
- **Next item**: moves current to the next loadable item, loads its first slide/verse into the live bar and previews it. It does not put it on air; anything already live stays until Show. Last item: button becomes disabled "End of plan".
- Tapping a row loads it the same way and makes it current.
- Arrow keys never change the current item and stop at the item's last slide.
- Live bar shows `3 of 6 · Next: John 3:16`.
- Adding: `+ Song` / `+ Verse` open the Songs or Scripture tab in picker mode (banner "Adding to <plan>", an Add button on results). One add returns to Plan with the row inserted after the current item; Shift keeps adding. Songs and Scripture also get a `+ Plan` action on the loaded song/verse (as-you-go path).
- Reorder by drag, with Move up/Move down as keyboard and touch fallback.

## Live-edit rules

- Add inserts after the current item (end if none). The current item does not move.
- Remove the current item: content stays loaded and on air; current becomes the previous item, so Next item goes to the one after the removed one.
- Reorder: current follows the item id.
- Loading another plan while live is allowed; on-air content stays until Show; the new plan starts with nothing current.
- Deleting the open plan asks for confirmation, then opens an empty "Untitled plan".
- Edits save immediately through the dirty-tracking path.

## Errors

- Folder disconnected: same yellow/red banner as the library; edits kept in the browser copy and written on reconnect.
- Bad plan file, missing song, unsupported item: inline rows as above, never a crash.
- Reading lookup failure: item loads with the error in the live-bar status.

## Testing

- Vitest: model (add/move/remove/validate, immutability, unknown types), store (save, load, duplicate, bad files, collisions, fallback), cursor (skips, end of plan, current follows id after reorder and remove).
- Playwright (`smoke/plan.spec.mjs`): create plan; add song and verse by both paths; Next item loads preview; arrows do not change current; keyboard reorder; reload restores plan; 380px layout.
- `PageDown`/`PageUp`, Escape and arrow handling must not regress existing shortcuts.

## Files

New: `src/plan/{model,store,cursor}.js`, `src/dock/plan-tab.js`, `src/css/plan.css`, tests. Changed: `src/dock/main.js` (register tab, default, keys), `src/dock/live-bar.js`, `src/dock/songs-tab.js`, `src/dock/scripture-tab.js`, `src/html/dock.html`, `README.md`, `dist/`.

## Build order

1. Model, then cursor. 2. Store. 3. Plan tab with Next item and live-bar line. 4. Add paths (picker mode, `+ Plan`). 5. Reorder, row menu, plan menu. 6. Playwright flows, README, final whole-branch review.

## Out of scope

Announcements, timers, notes (3b); paste-a-list import; server and phone remote (3c); any overlay change.

## Risks

Drag-and-drop in the CEF dock needs a real-browser check, hence the row-menu fallback. New `PageDown`/`PageUp` keys must coexist with the redesign's Escape capture handler and arrow stepping.