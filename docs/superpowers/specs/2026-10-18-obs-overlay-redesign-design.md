# OBS Scripture & Song - Redesign (Sub-project 2 of 3)

**Date:** 2026-10-18
**Repo:** https://github.com/uzosaugwu0-sudo/obs-scripture-song (foundation merged to main at f042669)
**Status:** Draft for review
**Builds on:** `docs/superpowers/specs/` in the claude repo, branch `worktree-overlay-foundation-spec` (foundation spec, 2026-10-18)

## Context and intent

The foundation phase made the dock and overlay tested modules with file-backed songs, offline scripture and a versioned state/transport layer. This phase redesigns what the operator and the viewers see. Sub-project 3 (run-order, lower-thirds, timer, reading queue, remote control) comes after and is out of scope here.

**What the owner said**
- The dock is hard to use live: it is cramped, and the Show / Hide / Prev / Next buttons sit about 800px down the page (below Verse Lookup and Search), so in an OBS panel they need scrolling.
- During a service the operator works with a mix of keyboard (verses) and mouse (songs and slides).
- The dock sits in a **narrow** column (about 380px wide).
- The overlay should get **a new look**, not only a polish: new themes and a new set of animations.

**Decisions made (with the mockups the owner chose from)**
- Live controls: a **pinned live bar** (option A) stays visible on every tab. Display settings move to a third **Style** tab.
- Verse lookup: **one smart box** (reference or words). The three quick boxes, the dropdown pickers and the separate Search section are removed. Quick-book chips and a small Random button stay.
- Songs tab: **slides first**: search, big tappable slide cards, an Edit drawer, and a Library tools menu.
- Overlay directions: **A (frosted lower third)** and **D (pure type)**.
- Animations: all four of **Soft rise (default), Glass wipe, Line by line, Instant cut**.
- Theme set: **Frosted, Frosted Light, Pure Type, Sacred Light, Custom**. Dark Stage, Classic Gold, Clean White and Neon Live are retired and mapped automatically.
- Approach: **rebuild the dock markup and CSS on a small design system**, keep the logic modules (session, library, transport, scripture API, parsers).

**Success criteria**
- At 380px width, the live bar is fully visible without scrolling on every tab, and nothing scrolls sideways.
- Show and Hide are large targets (at least 40px tall) with distinct colours.
- Every behaviour the dock has today still works, except the three removed lookup methods (see Behaviour preserved).
- Every theme and every animation renders correctly in the overlay, including change-while-visible.
- Existing saved settings and a stored overlay state load without errors after the upgrade.
- Still plain classic scripts over file:///, no new runtime dependency.

## 1. Dock layout (narrow, about 380px)

**Pinned live bar** (sticky at the top of the dock, above the tabs, on every tab). It replaces today's header and Stream Controls card:
- Status row: a dot and pill (`OFF`, `LIVE`, `HIDDEN`) plus what is live (`Verse` or `Song - <title>`).
- Preview: two lines of what is loaded in the active tab (what Show will send): the verse text and reference, or the current slide text.
- Buttons: `<` (prev), `Show` (green, widest), `Hide` (amber), `>` (next). The Clear action (today a small red X) moves into a small overflow button on the status row.
- Buttons keep today's enabled/disabled rules. Shortcuts are unchanged: Left/Right and Up/Down step, Space toggles show/hide, Escape hides (ignored while typing in an input).

**Tabs** under the bar: Scripture, Songs, Style.

**Scripture tab**
- The smart box (see section 2) with a dropdown of suggestions or search results.
- Quick-book chips (John, Romans, Psalms, Matthew, Genesis, Proverbs, Isaiah, Hebrews, Acts, Revelation).
- Editable verse text (edit before it goes live), then a compact row: language and translation selects, `Auto Show on lookup`, and a small `Random` button with its scope as a small select.

**Songs tab**
- The browser-only / folder-lost banner (as today) at the top.
- A search box: matches titles and lyrics; matching lyric excerpts are highlighted as today.
- The song list (compact, with slide counts and the DUPLICATE badge) shows while no song is open or while the search box is focused.
- An opened song shows its name, an `Edit` button, and its slides as two-column cards (number and text). Clicking a card makes it the current slide and puts it on screen. The current slide is outlined. Left/Right step through slides as today.
- `Edit` replaces the cards with the editor (title, slide list, slide textarea, add/update/delete slide, Save, Delete song) until `Done`.
- A footer row: `+ New`, `Import`, and a `Library tools` menu holding: import folder, export JSON, find duplicates, clear all, choose/change folder, reconnect, rewrite lyrics.txt, stop using folder, and the library folder status line.

**Style tab**
- Theme swatches (5), animation segmented control (4), position (Top/Mid/Low) and size (S/M/L/XL) as segmented controls, font select with italic toggle, background opacity and overlay scale sliders, toggles (Show card, Song title, Verse reference), background image chooser, and the custom colour inputs (shown only for the Custom theme).
- The Diagnostics panel sits at the bottom of this tab.

## 2. Smart box (Scripture)

One input handles a reference, a book name and a word search. The decision is a pure function in `src/scripture/smart-input.js`:

- `suggestBooks(text, limit = 5) -> string[]`: books whose name or abbreviation **starts with** the typed text (case-insensitive, ordinals and aliases handled by the existing `bookIndexOf` rules). Used for the autocomplete dropdown while the text has no digits.
- `classifyInput(text) -> { kind, ... }`, evaluated on Enter when no suggestion row is highlighted:
  - `{ kind: 'empty' }` for blank input.
  - `{ kind: 'reference', reference }` when `parseReference` succeeds and its book resolves (`John 3:16`, `Psalm 23`, `1 Cor 13:4-7`).
  - `{ kind: 'book', bookIndex }` when the text has no digits and resolves to exactly one book (`john`, `II Corinthians`): the book is selected and the box becomes `John ` ready for a chapter and verse.
  - `{ kind: 'search', query }` otherwise (`loved the world`, `hope`, `the`): runs the word search.
- Dropdown rows while typing: up to 5 book suggestions, then (once the text has 3 or more letters and is not a unique book) a final row `Search verses for "<text>"`. Up/Down move the highlight, Enter picks it, Escape closes.
- Word search results (up to 50, 8 visible with scroll) appear under the box with the matched words highlighted; clicking one looks the verse up. Search needs a connection (the Bible API); with none, the message is `Search is unavailable right now.` as today.
- After a lookup the box shows the normalised reference (`John 3:16`). Next/Prev stepping, ranges up to 20 verses, Auto Show, the 10 s timeout and all error messages are unchanged.

## 3. Visual system

`src/css/tokens.css` defines CSS custom properties; component sheets use only tokens. Values come from the approved mockup:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0e1218` | dock background |
| `--surface` / `--inset` | `#151b24` / `#0a0e13` | cards, inputs |
| `--border` / `--border-strong` | `#232c38` / `#2a3442` | outlines |
| `--text` / `--dim` / `--faint` | `#e6ebf2` / `#8793a3` / `#6f7c8d` | text levels |
| `--accent` / `--accent-bg` | `#6ea8ff` / `#243455` | focus, selected tab, sliders |
| `--show` / `--show-ink` | `#35c46a` / `#06210f` | Show button |
| `--hide` / `--hide-bg` | `#e0a93a` / `#2a2415` | Hide button |
| `--live-bg` / `--live-border` | `#101a17` / `#1f5a3b` | live bar when live |
| `--warn-bg` / `--warn-border` / `--warn-ink` | `#2a2415` / `#5b4a1f` / `#e6c76f` | browser-only banner |
| radius | 7 / 9 / 10 px | controls / fields / cards |
| type | Segoe UI, Helvetica, Arial, sans-serif; 12 px body, 13-14 px emphasis, 10 px uppercase labels | all dock text |

Component sheets (each under about 200 lines): `base.css`, `live-bar.css`, `tabs.css`, `fields.css` (inputs, selects, segmented controls, sliders, chips), `cards.css` (slide cards, song list, swatches), `banners.css`. The build concatenates them into `dist/css/dock.css`. The red folder-lost banner keeps its meaning and gets a token.

## 4. Overlay themes and animations

**Themes** (stored in `state.theme`): `frosted`, `frosted-light`, `pure`, `sacred-light`, `custom`.
- **Frosted:** card `rgba(14,18,30,.55)` with `backdrop-filter: blur(8px)`, 1px border `rgba(255,255,255,.14)`, radius 14px, white text, accent `#9ec1ff` for the reference or song title (uppercase, letter-spaced).
- **Frosted Light:** card `rgba(255,255,255,.7)`, text `#1a2233`, accent `#2f5fd0`, same blur.
- **Pure Type:** no card; large white bold text with a soft layered shadow; the reference is smaller, uppercase, 90% opacity. Turning `Show card` on adds a dark translucent card behind the text.
- **Sacred Light:** the image-backed card as today (`assets/bg1.png`), restyled to the new type and spacing.
- **Custom:** the owner's background, text and accent colours on the Frosted structure.
- The existing background-opacity slider scales the card alpha for card themes; overlay scale, position, size, font, italic, and Show card / Song title / Verse reference keep today's meaning. A background image still turns the card on.
- If `backdrop-filter` is unsupported the card alpha alone keeps text legible (no blur is required for correctness).

**Animations** (stored in `state.animation`): `rise` (default), `wipe`, `lines`, `cut`. All use opacity, transform and clip-path only.
- **Soft rise:** card fades in 0.5 s while moving up 14 px; hide fades out in 0.35 s. When content changes while visible, only the text crossfades (0.2 s out, 0.3 s in); the card stays put.
- **Glass wipe:** card reveals left to right with `clip-path` in 0.6 s, text fades in after 0.25 s; hide wipes out to the right in 0.4 s. Content change crossfades the text as in Soft rise.
- **Line by line:** the card fades in in 0.35 s; each line then fades in and rises 6 px over 0.45 s, staggered by 0.35 s (stagger shrinks so all lines finish within about 2.4 s). A content change re-staggers the new lines.
- **Instant cut:** no transition at all.
- `src/overlay/split-lines.js` exports `splitLines(text, kind) -> string[]` for Line by line: a song slide splits on line breaks (blank lines dropped); a verse splits after `, ; : . ? !` followed by a space, merging any piece shorter than 12 characters into the previous one and grouping evenly if there are more than 8 pieces. The unsplit text is kept for the accessible text content.

## 5. State and migration

The state shape and `STATE_VERSION` (1) do not change; only the allowed values of `theme` and `animation` do. `DEFAULTS.theme` becomes `frosted` and `DEFAULTS.animation` becomes `rise`.

`src/core/state.js` gains `migrateLegacy({ theme, animation }) -> { theme, animation }`, applied by `normalizeState` (so a stored or incoming old-format state still renders) and by `loadSettings` (so saved dock settings still load):

| Old | New |
|---|---|
| theme `dark`, `gold`, `neon` | `frosted` |
| theme `white` | `frosted-light` |
| theme `sacred-light`, `custom` | unchanged |
| animation `fade`, `slide` | `rise` |
| animation `none` | `cut` |
| any other unknown value | the default (`frosted` / `rise`) |

New values pass through unchanged. `localStorage` keys, the BroadcastChannel name and the song library format do not change.

## 6. Code structure

```
src/
  css/       tokens.css base.css live-bar.css tabs.css fields.css cards.css banners.css overlay.css
  scripture/ smart-input.js            (new: suggestBooks, classifyInput)
  overlay/   split-lines.js            (new)  render.js (animations, themes)  style-math.js (unchanged API)
  core/      state.js (migrateLegacy)  settings.js (migrates on load)
  dock/      live-bar.js               (new: replaces header + stream-controls markup/logic)
             smart-box.js              (new: replaces the lookup/quick-box/picker/search code in scripture-tab.js)
             scripture-tab.js          (slimmed: verse text, translation row, auto show, random, chips)
             songs-tab.js              (slide cards, edit drawer, library tools menu)
             style-tab.js              (replaces display-settings.js markup binding; same settings logic)
             session.js library-ui.js diagnostics.js main.js (rewired, logic unchanged)
  html/      dock.html (rewritten) overlay.html (markup for line spans)
```

`session`, `library`, the transport, the scripture API, the song parsers and the folder backend are not modified. Modules stay under about 400 lines each.

## 7. Behaviour preserved

Shortcuts; the live-content rule (style changes re-send the live tab's content after the operator switches tabs); Auto Show; verse stepping across chapter and book boundaries; ranges up to 20 verses; offline KJV/WEB, the verse cache and bundled fonts; the library folder, lyrics.txt, banners, Reconnect and Diagnostics; import (json/txt/csv/tsv, multi-song lyrics.txt) and export; duplicates and clear-all confirmations.

**Intentionally removed:** the three quick boxes, the book/chapter/verse dropdown pickers and the separate Search card (their jobs are covered by the smart box and quick-book chips). The `Dark Stage`, `Classic Gold`, `Clean White` and `Neon Live` themes and the `fade`/`slide`/`none` animation names are retired (mapped as in section 5).

## 8. Testing

- **Unit:** `suggestBooks` and `classifyInput` (references, ranges, numbered books, ambiguous `jo`, unique book, multi-word search, blank, digits-only); `splitLines` (song slides, verse clauses, short-piece merging, more than 8 pieces, empty); `migrateLegacy` and its use in `normalizeState` and `loadSettings` (every row of the table, unknown values, missing values); existing suites stay green.
- **Browser (Playwright, chromium):** the 13 existing tests updated for the new markup; at a 380x700 viewport, the live bar is fully visible with no scroll on each tab and `document.scrollWidth <= 380`; Show and Hide are at least 40px tall; each of the 5 themes and 4 animations renders on the overlay for a verse and a song, including a content change while visible; the smart box handles `joh` -> suggestion, `John 3:16` -> verse, `loved the world` -> search results (mocked API); slide cards put the clicked slide on screen; Edit drawer add/update/delete; Library tools menu actions; a pre-upgrade stored state and saved settings still load.
- **Manual in OBS 28+:** Frosted blur and Soft rise look right over real video; Pure Type legible over bright scenes; the narrow dock; folder reconnect still works.
- Coverage stays at or above 80% on the logic modules.

## Out of scope

Run-order or playlist, lower-thirds and announcements, timer, reading queue, remote control and the optional Node server (sub-project 3). No change to the song file format or the library semantics.

## Risks

- `backdrop-filter` can cost GPU in OBS on weak machines: mitigated by it being optional for legibility; the manual OBS check covers it.
- Replacing the lookup UI is the largest behaviour change: the smart box rules are specified as pure functions with tests, and the browser tests cover the paths the removed controls served.
- Frosted Light is hard to read over dark video if the opacity slider is low; the default opacity (88%) is kept and the Style tab shows the value.
- The dock markup rewrite touches most of the browser tests; they are updated in the same tasks that change the markup.
