# Lower thirds design

A name-and-title strip ("Pastor John / Guest speaker") for the OBS overlay. Feature base: the user's "Animated Lower Thirds v1.6" by NoeAL (folder `C:\Users\osaug\claude\lower thirds`: a browser source, a control panel and an OBS Lua hotkey script). That tool is third-party, has no licence file, and depends on shared CSS and jQuery files that are not in the folder, so this feature takes its feature set as a guide and is built fresh in this project's own design system. No code is copied from it.

## Goal

Let a volunteer put a lower third on screen as a plan item or with "Show now": a name line, an info line, an optional small picture, left / centre / right placement, and an optional automatic hide. The dock stays the only authority over what is on air.

## Decisions (from brainstorming)

- A lower third **takes turns with the card**. Showing one replaces the verse, song, announcement or timer card, and the reverse. No second layer, no showing it together with a card.
- Look: **the bar**. A frosted glass strip with a 6px accent edge, bold name above a smaller accent-coloured info line. Colours, font, size and opacity follow the Style tab.
- It **stays until Hide**, with an **optional "hide after N seconds"** per lower third. The dock times the hide.
- Content: name, info, **optional picture**, alignment left / centre / right.
- Pictures are **files in `logos/` inside the library folder**, referenced by file name. Pictures need a connected library folder; a missing file or no folder drops the picture and the text still shows.
- Approach: **reshape the existing card** (a new `lowerthird` kind restyles the same `#card`) rather than adding a second overlay element.
- Out of scope: four lower thirds at once; the Lua hotkey slots; per-lower-third fonts, colours, borders or shadows; a picture library screen (rename, delete); cycling lower thirds on a repeat.

## Global constraints

- OBS 28+ over `file:///`: classic IIFE bundle via esbuild, no ES-module script tags, no fetch of local files.
- Immutable updates: model and store functions return new copies.
- The dock is the only authority over state; the overlay only renders what it is told. The overlay never counts the hide-after time.
- State `kind` and plan item `type` stay open sets. `STATE_VERSION` stays 1.
- Existing behaviour and tests for verses, songs, announcements, timers and the plan stay unchanged.
- `dist/` is rebuilt (`npm run build`) and committed with any change under `src/`. Coverage stays at or above 80%.

## State and plan item shapes

- `KINDS` in `src/core/state.js` gains `lowerthird`.
- On-screen state: `title` = name line, `body` = info line (either may be empty, not both; a state with neither renders nothing). One new optional field `lowerthird`: `{ "align": "left", "logo": "data:image/png;base64,..." }`.
- Leniency: an unknown `align` becomes `left`; a `logo` that is not an `data:image/` data URL, or is over 300 KB, is dropped. The text still shows. Hide-after is not in the state.
- Plan item:
  `{ "id": "i_..", "type": "lowerthird", "name": "Pastor John", "info": "Guest speaker", "align": "left", "logo": "pastor-john.png", "hideAfter": 8 }`
  - `logo` is a plain file name (no folders, ends `.png`) or `null`. `hideAfter` is a whole number of seconds from 1 to 3600, or `null` for "stays until Hide".
  - Valid when at least one of `name` and `info` has text, `align` is left / center / right, `logo` and `hideAfter` as above. An invalid item loads as an unsupported row, is skipped by Next item, and is never rewritten.
  - A missing picture file is not invalid: the item still loads and shows its text; the row status reads "picture missing".
- Picture files: `logos/<safe-name>.png` inside the library folder, shrunk to about 160 pixels on the longest side when added; a name clash becomes `name (2).png`.

## Overlay

Changes in `src/overlay/render.js`, `src/css/overlay.css`, `src/html/overlay.html`.

- A `lowerthird` state puts `kind-lowerthird` and `lt-left` / `lt-center` / `lt-right` on the stage. The same `#card` shrinks to fit its content, sits left / centre / right with a margin, and lays out as a row (picture, then text). It always sits at the bottom, ignoring the Style tab's Position setting.
- A 6px edge in the theme accent runs down the card's left side; the name is bold, mixed case, larger; the info line is smaller in the accent colour; the decorative lines and the reference line are hidden. Pure Type (no card by default) shows the text with its shadow and no bar.
- `<img id="ov-logo">` sits before the text in the card, about two and a half text-lines tall with its proportions kept, hidden unless a valid picture is in the state, cleared whenever any other kind is shown.
- Themes frosted / frosted-light / sacred-light / custom and animations rise / wipe / cut apply as for any card; line-by-line just rises in. Switching between a lower third and any other kind resets the card's layout classes and inline sizes.
- Invalid states render nothing; a bad picture is dropped and the text shows.

## Dock

- `src/plan/logos.js` (pure): `isValidLogoName`, `logoFileName(title, taken)`, `fitSize(width, height, max = 160)`, `isLogoDataUrl`.
- `src/dock/plan/logo-store.js`: owns `logos/` inside the library folder, attached and released with the plan store through `onFolderChange`. `list()`, `add(file)` (shrinks via canvas, writes a PNG), `read(name)` (data URL or null), `available()`. Reads and writes reuse the atomic write in `src/core/record-folder.js`, which is exported for this.
- `session` learns the tab name `lowerthird` (kind `lowerthird`) and keeps the `lowerthird` field in the on-air snapshot.
- `tabs.lowerthird` (in `extras-tab.js`): `load(item)` reads the picture in the background; `getContent()` returns the cached data; `ready()` resolves when the picture read is done. The live bar's Show handler and Show now wait for `ready()`, so a lower third never goes on air before its picture is read.
- Auto-hide: when a lower third with `hideAfter` goes on air (`markShown()`), the dock sets a timer holding a token. When it fires it calls `session.hide()` only if the token is still current, `session.isLive` is true and `session.liveTab` is `lowerthird`. Hide, another Show, or Clear before then makes it do nothing.
- Editor (`extras-editor.js`): the add row gains **+ Lower third**; fields Name, Info, Left / Centre / Right, Hide after (seconds, blank = stays until Hide), a Picture drop-down ("No picture" plus the files in `logos/`) and **Add picture...**. With no library folder the picture controls are disabled with the hint "Choose a library folder in Songs > Library tools to use pictures". Add to plan, Show now, Cancel and the row Edit work as for announcements.
- Plan rows: icon, title (name, else info), status "stays", "hides after 8s", or "picture missing". The live bar reads "Lower third · Pastor John".

## Errors

- Bad editor input disables the buttons and shows a one-line hint.
- Hand-edited invalid items: unsupported rows, never rewritten.
- Missing picture or no folder: text still shows; row says "picture missing"; picture controls disabled with the hint.
- A picture that is too big or not an image is rejected when added, with a message; nothing is saved.
- Folder lost mid-service: a loaded lower third keeps its picture; a new one shows text only.
- Editing the lower third that is on air changes the plan, not the screen.
- A restyle while one is on air keeps the same picture and the same remaining hide time.

## Testing

- Vitest: state validation (empty text rejected; bad align and oversized or non-image picture dropped; valid accepted); plan item validation, title and status; picture helpers (file name safety, shrink size, data URL check); the auto-hide timer with fake timers (fires once; ignored after Hide, another Show, or Clear); session tab name and snapshot.
- Playwright: overlay left / centre / right placement; picture shown or dropped; always at the bottom even with Position top; switching to and from a verse card; all five themes with no page errors. Dock: Show now, Add to plan, Next item then Show, Edit via the row menu, hide-after really hiding, a picture added through the folder and shown, disabled picture controls with no folder, 380px layout.
- Coverage stays at or above 80%.

## Files

New: `src/plan/logos.js`, `src/dock/plan/logo-store.js`, tests. Changed: `src/core/state.js`, `src/overlay/render.js`, `src/css/overlay.css`, `src/html/overlay.html`, `src/core/record-folder.js`, `src/dock/live/session.js`, `src/dock/live/live-bar.js`, `src/dock/plan/extras-tab.js`, `src/dock/plan/extras-editor.js`, `src/dock/plan/plan-tab.js`, `src/dock/main.js`, `src/plan/model.js`, `src/plan/cursor.js`, `src/plan/extras.js`, `src/html/dock.html`, `src/css/dock/extras.css`, `README.md`, `dist/`.

## Build order

1. State validation and the pure picture helpers.
2. Overlay rendering.
3. Plan item and cursor additions.
4. The `logos/` folder store.
5. Session, the lower third tab and the automatic hide.
6. The editor, plan integration and Show now.
7. Browser tests, README and the final review.

## Risks

- The auto-hide timer must never hide something it did not show.
- Show must never go on air before the picture has been read.
- A deleted picture file must never stop the name appearing.
- Switching kinds must fully reset the card's lower-third layout so a verse never inherits the bar's shape.