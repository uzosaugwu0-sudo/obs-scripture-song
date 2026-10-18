# OBS Scripture & Song

### Put Bible verses and song lyrics on your church livestream, from one panel.

A free, open-source tool for OBS Studio. You get a control panel docked inside OBS with two tabs — **Scripture** and **Songs** — and a single overlay on your stream. Type a reference or pick a song slide, press **Show**, and it appears. No servers, no subscriptions, no setup beyond copying a folder.

This replaces the separate Bible Verse and Lyric Display plugins. One dock, one browser source, one set of display settings, so verses and lyrics always look like they belong to the same service.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)

---

## What you need

- **OBS Studio 28 or newer** ([free at obsproject.com](https://obsproject.com))
- **An internet connection** when looking up verses. Song lyrics are stored on your computer and need no connection.
- The plugin folder saved somewhere permanent

---

## Installation

### Step 1 — Download

1. Click the green **Code** button on the GitHub page, then **Download ZIP**
2. Extract it (right-click ▸ **Extract All** on Windows, or double-click on Mac)
3. Move the extracted folder somewhere permanent, such as **Documents**

> ⚠️ Don't rename or move files inside the folder afterwards. `index.html` and `overlay.html` both need the `assets` folder sitting next to them.

### Step 2 — Add the control panel

1. In OBS: **Docks ▸ Custom Browser Docks…**
2. **Dock Name:** `Scripture & Song`
3. **URL:** the full path to `index.html`, starting with `file:///`
   - **Windows:** Shift + right-click `index.html` ▸ **Copy as path**, paste it, swap `\` for `/`, and put `file:///` on the front
     `file:///C:/Users/YourName/Documents/obs-scripture-song/index.html`
   - **Mac:** right-click `index.html`, hold Option, **Copy "index.html" as Pathname**, then add `file://`
     `file:///Users/YourName/Documents/obs-scripture-song/index.html`
4. Click **Apply**, then drag the panel wherever you like in your OBS layout

### Step 3 — Add the overlay

1. Select your scene, then **Sources ▸ + ▸ Browser**
2. Name it `Scripture & Song Overlay`, click **OK**
3. In the properties window:
   - Tick **Local file**
   - **Browse** to `overlay.html`
   - **Width** `1920`, **Height** `1080`
   - Untick **Shutdown source when not visible** ← important
   - Untick **Refresh browser when scene becomes active** ← important
4. Click **OK**

That's it. One browser source handles both verses and lyrics.

---

## Using it during a service

### Scripture tab

Type a reference and press **Enter**, or use the book / chapter / verse dropdowns. Reference entry is forgiving — `Psalm 23:1`, `Ps 23:1`, `1st John 4:8`, `II Corinthians 5:17` and `Philipp 4:13` all work. Ambiguous shorthand like `Jo` is rejected rather than guessed, so you never get the wrong verse by accident.

- **Quick books** — one-tap buttons for the ten most-preached books
- **Ranges** — `Romans 8:28-30`, up to 20 verses at once
- **Edit before you show** — the verse text box is editable, so you can trim a long verse or fix spacing without affecting the lookup
- **Next / Previous** — step through consecutive verses, rolling over chapter and book boundaries. While something is live, stepping updates the screen immediately.
- **Search** — find a verse by wording when you can't remember the reference
- **Random** — pick from the whole Bible, Old or New Testament, the Gospels, or Psalms and Proverbs
- **Auto Show** — send each verse to the stream the moment it's looked up
- **31 translations** in English, Portuguese, Russian and Chinese, filtered by the language dropdown

### Songs tab

- **Library** — search by title or by lyrics; matching words are highlighted
- **Slides** — one block of text per slide. Click a chip to edit it, then use ← / → to move through them live.
- **Import** — from `.json`, `.txt`, `.csv` or `.tsv`, one file or a whole folder at once, with a preview showing what's new and what already exists
- **Duplicates** — find songs with matching titles and keep the fullest copy
- **Output folder** — set one and every saved song is also written out as a `.txt` backup
- **Export** — save the whole library as JSON

Your existing Lyric Display library is picked up automatically the first time you open the plugin, so you don't need to re-import anything.

### Shared controls

Stream controls and display settings apply to whichever tab you're on:

| Key | Action |
|-----|--------|
| `←` `→` | Previous / next verse or slide |
| `Space` | Show / hide |
| `Esc` | Hide |

Settings are shared deliberately — theme, position, font, size, opacity, scale and background all carry across both tabs so scripture and lyrics match on screen. Six display themes: Classic Gold, Dark Minimal, Clean White, Neon Live, Sacred Light, and a Custom theme with your own background, text and accent colours. Add a background image, hide the card so text floats over your video, or scale the overlay's height without changing its width.

One deliberate behaviour worth knowing: if a song is live and you switch to the Scripture tab to prepare the next verse, adjusting a slider or theme keeps restyling the **song** that's on screen. Nothing swaps until you press **Show**.

---

## Troubleshooting

**Nothing appears on stream.** Check that "Shutdown source when not visible" is unticked in the browser source properties. Then right-click the source and choose **Refresh**.

**The dock is blank.** The URL is probably wrong. It must start with `file:///` and use forward slashes.

**Verse lookups fail.** OBS needs internet access. Lookups time out after 10 seconds rather than hanging, so an error message means the request genuinely didn't come back.

**Sacred Light shows a plain card.** It needs `assets/bg1.png`. Check the file is still there.

**Songs disappeared.** The library lives in the browser's local storage for this dock. Use **↓ JSON** regularly to keep a backup, and set an output folder so every save also writes a `.txt`.

---

## A note on song lyrics

This tool displays lyrics you type in or import; it doesn't fetch or supply any. Reproducing lyrics for a copyrighted worship song on a livestream normally requires a streaming licence — most churches cover this through CCLI. Public-domain hymns are fine without one.

---

## Licence

MIT. See `LICENSE`.
