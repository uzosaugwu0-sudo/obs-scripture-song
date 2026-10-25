# OBS Scripture & Song

### Put Bible verses and song lyrics on your church livestream, from one panel.

A free, open-source tool for OBS Studio. You get a control panel docked inside OBS with tabs for your **Plan**, **Scripture** and **Songs** — and a single overlay on your stream. Type a reference or pick a song slide, press **Show**, and it appears. No servers, no subscriptions, no setup beyond copying a folder.

This replaces the separate Bible Verse and Lyric Display plugins. One dock, one browser source, one set of display settings, so verses and lyrics always look like they belong to the same service.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)

---

## What you need

- **OBS Studio 28 or newer** ([free at obsproject.com](https://obsproject.com))
- **An internet connection** only for translations other than KJV and WEB. KJV and WEB are bundled and work offline, any verse you have looked up before is remembered, and song lyrics are stored on your computer.
- The plugin folder saved somewhere permanent

---

## Installation

### Step 1 — Download

1. Click the green **Code** button on the GitHub page, then **Download ZIP**
2. Extract it (right-click ▸ **Extract All** on Windows, or double-click on Mac)
3. Move the extracted folder somewhere permanent, such as **Documents**

> ⚠️ Keep the whole `dist` folder together. `dock.html` and `overlay.html` need the other files inside it (scripts, styles, fonts, Bible data).

### Step 2 — Add the control panel

1. In OBS: **Docks ▸ Custom Browser Docks…**
2. **Dock Name:** `Scripture & Song`
3. **URL:** the full path to `dock.html` (inside the `dist` folder), starting with `file:///`
   - **Windows:** Shift + right-click `dock.html` ▸ **Copy as path**, paste it, swap `\` for `/`, and put `file:///` on the front
     `file:///C:/Users/YourName/Documents/obs-scripture-song/dist/dock.html`
   - **Mac:** right-click `dock.html`, hold Option, **Copy "dock.html" as Pathname**, then add `file://`
     `file:///Users/YourName/Documents/obs-scripture-song/dist/dock.html`
4. Click **Apply**, then drag the panel wherever you like in your OBS layout

### Step 3 — Add the overlay

1. Select your scene, then **Sources ▸ + ▸ Browser**
2. Name it `Scripture & Song Overlay`, click **OK**
3. In the properties window:
   - Tick **Local file**
   - **Browse** to `dist/overlay.html`
   - **Width** `1920`, **Height** `1080`
   - Untick **Shutdown source when not visible** ← important
   - Untick **Refresh browser when scene becomes active** ← important
4. Click **OK**

That's it. One browser source handles both verses and lyrics.

---

## Using it during a service

The dock has a **live bar** pinned at the top of every tab: what is loaded, **Show**, **Hide** and previous / next. Under it are four tabs: **Plan**, **Scripture**, **Songs** and **Style**.

### Plan tab

Build the order of service ahead of time, or as you go. A plan is a named list of songs and Bible readings.

- **Add things** with **+ Song** and **+ Verse**. They open Songs or Scripture so you can pick; hold Shift to add several before going back. Or press **+ Plan** on a song or verse you already have open.
- **Next item** (or `PageDown`) loads the next song or reading into the live bar so you can check it. It does not go on screen until you press **Show**. The arrow keys still step through the slides of the current item and never change which item is current. `PageUp` goes back, and tapping a row jumps to it.
- **Change it live.** New items go in right after the current one. Drag the grip on a row, or open its **⋯** menu for Move up, Move down and Remove. Removing the item that is on screen does not take it off the screen.
- **Plans are files.** With a library folder chosen, each plan is saved as its own `.json` file in a `plans` folder inside it. Rename, duplicate and delete are in the **Plan** menu; pick another plan from the list. Plans point to songs, so editing a song updates every plan that uses it. A song that was removed from the library shows as "Song missing" and is skipped.

### Announcements and timers

On the Plan tab, **+ Announcement** and **+ Timer** open a small editor. Each has **Add to plan** and **Show now**; **Show now** puts it on screen straight away and does not touch any plan. To change one later, open its row's **⋯** menu and choose **Edit**.

- **Announcement.** An optional title and some text, shown in the same card as songs and verses, in your current theme and animation.
- **Timer.** A countdown by **duration** (minutes and seconds) or **to a clock time** such as 10:30. A duration timer starts when you press **Show**; **Pause** / **Resume** and **Reset** appear in the live bar while it is on screen. A clock-time timer just follows the clock. At zero it stays on screen showing 0:00 until you press **Hide**; a clock time that has already passed today shows 0:00.
- **Next item** loads announcements and timers like songs: into the live bar first, on screen only when you press **Show**. Loading the next item never changes a timer that is already on screen.

### Lower thirds

On the Plan tab, **+ Lower third** opens the same small editor as announcements and timers: a **name**, an **info** line (for example "Pastor John" over "Guest speaker"), a **Left / Centre / Right** placement, an optional **picture**, and an optional **Hide after (seconds)**. **Add to plan** puts it in the plan; **Show now** puts it on screen straight away without touching any plan. To change one later, open its row's **⋯** menu and choose **Edit**.

- **It looks like your other cards.** A frosted bar with an accent edge, always at the bottom, in the theme, font and size you chose on the Style tab. It takes turns with the verse, song, announcement or timer card: showing a lower third replaces the card, and showing a card replaces the lower third.
- **Hide after.** Leave it blank and the lower third stays until you press **Hide**. Fill in a number of seconds and it hides itself after that long. Pressing Hide or showing something else first cancels it, so it never hides the wrong thing.
- **Pictures** (a church logo, a speaker's headshot): press **Add picture...** and choose any image on this computer. It is shrunk to a small size first. With a library folder connected (Songs, Library tools) it is saved once as a PNG in a `logos` folder, so every lower third can reuse it. With no library folder it is kept inside that lower third and saved with the plan, so it works either way. If a saved picture file is moved or deleted, the lower third still shows its name and info and the row says "picture missing".

### Scripture tab

One box does everything. Type a reference and press **Enter**, type a book name to get suggestions, or type words from a verse to search for it. Reference entry is forgiving: `Psalm 23:1`, `Ps 23:1`, `1st John 4:8`, `II Corinthians 5:17` and `Philipp 4:13` all work. Ambiguous shorthand like `Jo` is rejected rather than guessed, so you never get the wrong verse by accident.

- **Quick books**: one-tap chips for the ten most-preached books
- **Ranges**: `Romans 8:28-30`, up to 20 verses at once
- **Edit before you show**: the verse text box is editable, so you can trim a long verse or fix spacing without affecting the lookup
- **Next / Previous**: step through consecutive verses, rolling over chapter and book boundaries. While something is live, stepping updates the screen immediately.
- **Word search**: type words you remember and pick the verse from the list
- **Random**: a small button, with a choice of the whole Bible, Old or New Testament, the Gospels, or Psalms and Proverbs
- **Auto Show**: send each verse to the stream the moment it is looked up
- **31 translations** in English, Portuguese, Russian and Chinese, filtered by the language dropdown. KJV and WEB work with no internet; any verse looked up before is remembered offline.

### Songs tab

- **One search box** for titles and lyrics. Type a song title or any part of a lyric: the words can be in any order, partial words work, and punctuation and accents are ignored. Title matches come first, and a lyric match shows the matching line with your words highlighted.
- **Slides are big cards.** Click a card to put that slide on screen, then use the left and right arrow keys to move through the song live. **Edit** opens the editor; **+ New** starts a song.
- **Import** reads `.json`, `.txt`, `.csv` or `.tsv` files, or `lyrics.txt`, with a preview of what is new and what already exists.
- **Library tools** holds import a folder, export as JSON, find duplicates, clear the library, and the library folder: choose it once and every song is saved there as its own `.json` file, plus a `lyrics.txt` holding every song in one text file. Back it up or sync it like any other folder.

Your existing Lyric Display library is picked up automatically the first time you open the plugin, so you do not need to re-import anything.

### Style tab

Five themes: **Frosted** (dark glass), **Frosted Light**, **Pure Type** (no card, text over the video), **Sacred Light** (image card) and **Custom** with your own background, text and accent colours. Four animations: **Soft rise** (default), **Glass wipe**, **Line by line** and **Instant cut**. Position, size, font, italic, background opacity, overlay scale and a background image are here too, and the Diagnostics list sits at the bottom.

Saved settings from earlier versions are converted automatically: Dark Stage, Classic Gold and Neon Live become Frosted, Clean White becomes Frosted Light, Fade and Slide become Soft rise, and None becomes Instant cut.

### Shared controls

| Key | Action |
|-----|--------|
| Left / Right arrow | Previous / next verse or slide |
| `Space` | Show / hide |
| `Esc` | Hide |
| PageDown / PageUp | Next / previous item in the plan |

Settings are shared deliberately: theme, position, font, size, opacity, scale and background carry across both tabs so scripture and lyrics match on screen.

One deliberate behaviour worth knowing: if a song is live and you switch to the Scripture tab to prepare the next verse, changing a style setting keeps restyling the **song** that is on screen. Nothing swaps until you press **Show**.

---

## Troubleshooting

**Nothing appears on stream.** Check that "Shutdown source when not visible" is unticked in the browser source properties. Then right-click the source and choose **Refresh**.

**The dock is blank.** The URL is probably wrong. It must start with `file:///` and use forward slashes.

**Verse lookups fail.** OBS needs internet access. Lookups time out after 10 seconds rather than hanging, so an error message means the request genuinely didn't come back.

**Sacred Light shows a plain card.** It needs `dist/assets/bg1.png`. Check the file is still there.

**Songs disappeared.** If the dock shows a yellow banner, songs are only in this browser: choose a library folder so they are kept as files. If it shows a red banner, OBS lost access to the folder; click **Reconnect**. Use **Export all as JSON** in Library tools now and then for a backup copy.

**A plan is missing or shows "Unreadable plan file".** Plans live in the `plans` folder inside your library folder. A file there that is not a plan (or comes from a newer version) is listed but never changed or deleted. If the yellow or red banner shows on the Plan tab, plans are only in this browser until you choose or reconnect the library folder.

**Something is not working and the message is unclear.** Open **Diagnostics** at the bottom of the Style tab and read the last few lines; it lists recent errors with the time.

---

## A note on song lyrics

This tool displays lyrics you type in or import; it doesn't fetch or supply any. Reproducing lyrics for a copyrighted worship song on a livestream normally requires a streaming licence — most churches cover this through CCLI. Public-domain hymns are fine without one.

---

## Development

The dock and overlay are built from the modules in `src/` into the `dist/` folder, which is committed so the GitHub ZIP works without any tools.

```
npm install
npm test            # unit tests
npm run build       # rebuild dist/
npm run e2e         # browser tests (builds first with npm run build)
```

Rebuild with `npm run build` and commit `dist/` together with any change to `src/`.

---

## Licence

MIT. See `LICENSE`.
