/**
 * OBS Stage Display — Shared Communication Layer
 * ═══════════════════════════════════════════════════════════════════════════
 * One plugin for Bible verses AND song lyrics.
 *
 * Merged from the OBS Bible Verse Plugin and the OBS Lyric Display Plugin.
 * Both used the same transport (BroadcastChannel with a localStorage polling
 * fallback) on separate channels; here there is a single channel and a single
 * state object, with a `kind` field saying whether the payload is scripture
 * or a song slide.
 */

const StageApp = (() => {

  const CHANNEL_NAME = 'obs-stage-display';
  const STATE_KEY    = 'obs-stage-display-state';
  const SETTINGS_KEY = 'obs-stage-display-settings';
  const SONGS_KEY    = 'obs-stage-songs';
  const API_BASE     = 'https://bolls.life';
  const POLL_INTERVAL = 80;

  // Song libraries saved by the old standalone lyric plugin are imported
  // automatically the first time this plugin runs. See loadSongs().
  const LEGACY_SONGS_KEY = 'obs-lyric-songs';

  // ── Bible books: [fullName, abbreviation, chapterCount] ──────────────────
  const BIBLE_BOOKS = [
    ['Genesis','Gen',50],['Exodus','Exo',40],['Leviticus','Lev',27],
    ['Numbers','Num',36],['Deuteronomy','Deu',34],['Joshua','Jos',24],
    ['Judges','Jdg',21],['Ruth','Rut',4],['1 Samuel','1Sa',31],
    ['2 Samuel','2Sa',24],['1 Kings','1Ki',22],['2 Kings','2Ki',25],
    ['1 Chronicles','1Ch',29],['2 Chronicles','2Ch',36],['Ezra','Ezr',10],
    ['Nehemiah','Neh',13],['Esther','Est',10],['Job','Job',42],
    ['Psalms','Psa',150],['Proverbs','Pro',31],['Ecclesiastes','Ecc',12],
    ['Song of Solomon','Son',8],['Isaiah','Isa',66],['Jeremiah','Jer',52],
    ['Lamentations','Lam',5],['Ezekiel','Eze',48],['Daniel','Dan',12],
    ['Hosea','Hos',14],['Joel','Joe',3],['Amos','Amo',9],
    ['Obadiah','Oba',1],['Jonah','Jon',4],['Micah','Mic',7],
    ['Nahum','Nah',3],['Habakkuk','Hab',3],['Zephaniah','Zep',3],
    ['Haggai','Hag',2],['Zechariah','Zec',14],['Malachi','Mal',4],
    ['Matthew','Mat',28],['Mark','Mar',16],['Luke','Luk',24],
    ['John','Joh',21],['Acts','Act',28],['Romans','Rom',16],
    ['1 Corinthians','1Co',16],['2 Corinthians','2Co',13],['Galatians','Gal',6],
    ['Ephesians','Eph',6],['Philippians','Phi',4],['Colossians','Col',4],
    ['1 Thessalonians','1Th',5],['2 Thessalonians','2Th',3],['1 Timothy','1Ti',6],
    ['2 Timothy','2Ti',4],['Titus','Tit',3],['Philemon','Phm',1],
    ['Hebrews','Heb',13],['James','Jam',5],['1 Peter','1Pe',5],
    ['2 Peter','2Pe',3],['1 John','1Jo',5],['2 John','2Jo',1],
    ['3 John','3Jo',1],['Jude','Jud',1],['Revelation','Rev',22],
  ];

  const OT_END      = 39;   // book index 1–39 is the Old Testament
  const GOSPEL_IDS  = [40, 41, 42, 43];
  const WISDOM_IDS  = [19, 20];   // Psalms, Proverbs

  // ── Translations ─────────────────────────────────────────────────────────
  // `id` is the bolls.life API code. `key` is the short name shown in the
  // dropdown and appended to the on-screen reference.
  //
  // To add a translation, add a row here — nothing else needs changing. The
  // language dropdown is built from the `lang` values automatically. Check
  // the code exists at bolls.life first; an unknown code returns a 404 at
  // lookup time, which is not something to discover mid-service.
  const TRANSLATIONS = [
    { key: 'KJV',     id: 'KJV',     lang: 'English', label: 'King James Version' },
    { key: 'NKJV',    id: 'NKJV',    lang: 'English', label: 'New King James Version' },
    { key: 'NIV',     id: 'NIV',     lang: 'English', label: 'New International Version' },
    { key: 'NIV2011', id: 'NIV2011', lang: 'English', label: 'New International Version 2011' },
    { key: 'ESV',     id: 'ESV',     lang: 'English', label: 'English Standard Version' },
    { key: 'NLT',     id: 'NLT',     lang: 'English', label: 'New Living Translation' },
    { key: 'NASB',    id: 'NASB',    lang: 'English', label: 'New American Standard Bible' },
    { key: 'AMP',     id: 'AMP',     lang: 'English', label: 'Amplified Bible' },
    { key: 'MSG',     id: 'MSG',     lang: 'English', label: 'The Message' },
    { key: 'CSB',     id: 'CSB17',   lang: 'English', label: 'Christian Standard Bible' },
    { key: 'NET',     id: 'NET',     lang: 'English', label: 'New English Translation' },
    { key: 'RSV',     id: 'RSV',     lang: 'English', label: 'Revised Standard Version' },
    { key: 'ASV',     id: 'ASV',     lang: 'English', label: 'American Standard Version' },
    { key: 'WEB',     id: 'WEB',     lang: 'English', label: 'World English Bible' },
    { key: 'WEBBE',   id: 'WEBBE',   lang: 'English', label: 'World English Bible (British)' },
    { key: 'BSB',     id: 'BSB',     lang: 'English', label: 'Berean Study Bible' },
    { key: 'MEV',     id: 'MEV',     lang: 'English', label: 'Modern English Version' },
    { key: 'CEV',     id: 'CEVD',    lang: 'English', label: 'Contemporary English Version' },
    { key: 'ISV',     id: 'ISV',     lang: 'English', label: 'International Standard Version' },
    { key: 'ERV',     id: 'ERV',     lang: 'English', label: 'Easy-to-Read Version' },
    { key: 'NLV',     id: 'NLV',     lang: 'English', label: 'New Life Version' },
    { key: 'GNT',     id: 'GNT',     lang: 'English', label: 'Good News Translation' },
    { key: 'GNV',     id: 'GNV',     lang: 'English', label: 'Geneva Bible' },
    { key: 'LSV',     id: 'LSV',     lang: 'English', label: 'Literal Standard Version' },
    { key: 'BBE',     id: 'BBE',     lang: 'English', label: 'Bible in Basic English' },
    { key: 'DARBY',   id: 'DARBY',   lang: 'English', label: 'Darby Translation' },
    { key: 'YLT',     id: 'YLT',     lang: 'English', label: "Young's Literal Translation" },
    { key: 'DRB',     id: 'DRB',     lang: 'English', label: 'Douay-Rheims Bible' },
    { key: 'ALM21',   id: 'ALM21',   lang: 'Português', label: 'Almeida Século 21' },
    { key: 'SYNOD',   id: 'SYNOD',   lang: 'Русский',  label: 'Синодальный перевод' },
    { key: 'CUV',     id: 'CUV',     lang: '中文',      label: '和合本' },
  ];

  const LANGUAGES = TRANSLATIONS.reduce((acc, t) => {
    if (!acc.includes(t.lang)) acc.push(t.lang);
    return acc;
  }, []);

  function translationById(key) {
    return TRANSLATIONS.find(t => t.key === key || t.id === key) || TRANSLATIONS[0];
  }

  // ── Fonts ────────────────────────────────────────────────────────────────
  // The union of both plugins' font lists. `google` false means the font is
  // already on the system and must not be requested from Google Fonts.
  const FONTS = [
    { label: 'Open Sans (Default)',   value: 'Open Sans',            google: true  },
    { label: 'Atkinson Hyperlegible', value: 'Atkinson Hyperlegible', google: true  },
    { label: 'Lato',                  value: 'Lato',                 google: true  },
    { label: 'Montserrat',            value: 'Montserrat',           google: true  },
    { label: 'Raleway',               value: 'Raleway',              google: true  },
    { label: 'Lora',                  value: 'Lora',                 google: true  },
    { label: 'EB Garamond',           value: 'EB Garamond',          google: true  },
    { label: 'Cormorant Garamond',    value: 'Cormorant Garamond',   google: true  },
    { label: 'Crimson Text',          value: 'Crimson Text',         google: true  },
    { label: 'Playfair Display',      value: 'Playfair Display',     google: true  },
    { label: 'Cinzel',                value: 'Cinzel',               google: true  },
    { label: 'Georgia',               value: 'Georgia',              google: false },
  ];

  // ── Default state ────────────────────────────────────────────────────────
  const DEFAULTS = Object.freeze({
    action:        'show',
    kind:          'verse',   // 'verse' | 'song'
    title:         '',        // song title
    body:          '',        // verse text or slide lines
    reference:     '',        // scripture reference
    theme:         'dark',
    position:      'bottom',
    fontSize:      'md',
    animation:     'fade',
    visible:       false,
    timestamp:     0,
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

  // ── Transport ────────────────────────────────────────────────────────────

  let _channel       = null;
  let _lastTimestamp = 0;
  let _onMessage     = null;

  function initChannel(role, onMessage) {
    _onMessage = onMessage;

    try {
      _channel = new BroadcastChannel(CHANNEL_NAME);
      _channel.onmessage = (e) => {
        if (e.data && e.data.timestamp) _lastTimestamp = e.data.timestamp;
        _dispatch(e.data);
      };
    } catch (_) {
      _channel = null;
    }

    window.addEventListener('storage', (e) => {
      if (e.key !== STATE_KEY || !e.newValue) return;
      try {
        const state = JSON.parse(e.newValue);
        if (state.timestamp === _lastTimestamp) return;
        _lastTimestamp = state.timestamp;
        _dispatch(state);
      } catch (_) {}
    });

    // Polling safety net for OBS builds where BroadcastChannel and storage
    // events are unreliable between browser sources.
    setInterval(() => {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state.timestamp === _lastTimestamp) return;
        _lastTimestamp = state.timestamp;
        _dispatch(state);
      } catch (_) {}
    }, POLL_INTERVAL);

    // On load, the overlay restores whatever was last on screen, so an OBS
    // restart mid-service brings the verse or slide straight back.
    if (role === 'overlay') {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) {
          const state = JSON.parse(raw);
          if (state.visible) {
            _lastTimestamp = state.timestamp;
            _dispatch(state);
          }
        }
      } catch (_) {}
    }
  }

  function send(state) {
    const payload = { ...DEFAULTS, ...state, timestamp: Date.now() };
    if (state.customColors) {
      payload.customColors = { ...DEFAULTS.customColors, ...state.customColors };
    }
    if (_channel) { try { _channel.postMessage(payload); } catch (_) {} }
    try { localStorage.setItem(STATE_KEY, JSON.stringify(payload)); } catch (_) {}
    _lastTimestamp = payload.timestamp;
  }

  function _dispatch(state) {
    if (typeof _onMessage === 'function') { try { _onMessage(state); } catch (_) {} }
  }

  // ── Scripture lookup ─────────────────────────────────────────────────────

  const FETCH_TIMEOUT_MS = 10000;
  const MAX_RANGE_VERSES = 20;
  let _verseCountCache = {};
  let _searchCache     = {};

  // Hard timeout so OBS's browser can never hang the dock waiting on a
  // request that will not come back.
  async function _fetchWithTimeout(url) {
    const ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      return await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Forms people actually type that don't match a book name or the stored
  // abbreviation. "Psalm 23" is the big one — almost nobody types "Psalms".
  const BOOK_ALIASES = {
    'psalm': 'Psalms', 'ps': 'Psalms', 'psa': 'Psalms', 'pslm': 'Psalms',
    'song of songs': 'Song of Solomon', 'songs': 'Song of Solomon',
    'canticles': 'Song of Solomon', 'sos': 'Song of Solomon',
    'matt': 'Matthew', 'mt': 'Matthew', 'mk': 'Mark', 'lk': 'Luke',
    'jn': 'John', 'jhn': 'John', 'rom': 'Romans', 'phil': 'Philippians',
    'philem': 'Philemon', 'philm': 'Philemon', 'rev': 'Revelation',
    'eccl': 'Ecclesiastes', 'deut': 'Deuteronomy', 'josh': 'Joshua',
    'judg': 'Judges', 'neh': 'Nehemiah', 'prov': 'Proverbs',
    'isa': 'Isaiah', 'jer': 'Jeremiah', 'ezek': 'Ezekiel', 'dan': 'Daniel',
    'zech': 'Zechariah', 'mal': 'Malachi', 'heb': 'Hebrews',
    'gen': 'Genesis', 'ex': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers',
    'acts': 'Acts', 'gal': 'Galatians', 'eph': 'Ephesians', 'col': 'Colossians',
  };

  /**
   * Resolve a typed book name to its index. Tries, in order: exact name,
   * stored abbreviation, alias table, then a unique prefix match — so
   * "Psalm", "Ps", "1st John", "II Cor" and "Philipp" all land correctly.
   */
  function bookIndexOf(name) {
    let n = (name || '').toLowerCase().trim().replace(/\.$/, '');
    if (!n) return -1;

    // Normalise leading ordinals: "1st John" / "I John" / "First John" → "1 john"
    n = n
      .replace(/^(1st|first|i)\s+/,   '1 ')
      .replace(/^(2nd|second|ii)\s+/, '2 ')
      .replace(/^(3rd|third|iii)\s+/, '3 ')
      .replace(/\s+/g, ' ');

    let i = BIBLE_BOOKS.findIndex(b =>
      b[0].toLowerCase() === n || (b[1] && b[1].toLowerCase() === n));
    if (i !== -1) return i;

    const alias = BOOK_ALIASES[n];
    if (alias) {
      i = BIBLE_BOOKS.findIndex(b => b[0] === alias);
      if (i !== -1) return i;
    }

    // Unique prefix, e.g. "Philipp" → Philippians. Ambiguous prefixes such
    // as "Jo" (Job / Joel / John / Jonah / Joshua) are rejected rather than
    // guessed, so the operator gets a clear error instead of a wrong verse.
    const hits = [];
    BIBLE_BOOKS.forEach((b, idx) => {
      if (b[0].toLowerCase().startsWith(n)) hits.push(idx);
    });
    return hits.length === 1 ? hits[0] : -1;
  }

  /** Parse "John 3:16", "1 Corinthians 13:4-7", "John 3 16", "Psalm 23". */
  function parseReference(str) {
    const s = (str || '').trim();
    // Chapter and verse may be separated by ":", ".", or plain whitespace,
    // so "John 3:16", "John 3.16" and "John 3 16" all read the same.
    let m = s.match(/^(.+?)[\s]+(\d+)\s*[:.\s]\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (m) {
      return {
        book:     m[1].trim(),
        chapter:  parseInt(m[2], 10),
        verse:    parseInt(m[3], 10),
        endVerse: m[4] ? parseInt(m[4], 10) : null,
      };
    }
    // "Psalm 23" with no verse — treat as verse 1
    m = s.match(/^(.+?)\s+(\d+)$/);
    if (m) {
      return { book: m[1].trim(), chapter: parseInt(m[2], 10), verse: 1, endVerse: null };
    }
    return null;
  }

  function buildReference(book, chapter, verse, endVerse) {
    const range = endVerse && endVerse > verse ? `${verse}-${endVerse}` : `${verse}`;
    return `${book} ${chapter}:${range}`;
  }

  /** Strip Strong's numbers, markup and verse numbers from API text. */
  function buildDisplayText(raw) {
    if (!raw) return '';
    return raw
      .replace(/<S>\d+<\/S>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\d+\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function fetchVerse(reference, translationKey) {
    if (!reference || !reference.trim()) {
      return { error: 'Enter a verse reference first.' };
    }

    const parsed = parseReference(reference);
    if (!parsed) {
      return { error: 'Could not read that reference. Try "John 3:16".' };
    }

    const { book, chapter, verse, endVerse } = parsed;
    const idx = bookIndexOf(book);
    if (idx === -1) return { error: `No book called "${book}".` };

    const bookId = idx + 1;
    const tr     = translationById(translationKey);

    if (chapter < 1 || chapter > BIBLE_BOOKS[idx][2]) {
      return { error: `${BIBLE_BOOKS[idx][0]} has ${BIBLE_BOOKS[idx][2]} chapters.` };
    }

    const last = endVerse && endVerse > verse ? endVerse : verse;

    // Each verse in a range is a separate request. Without a cap, a typo like
    // "3:1-99" fires 99 sequential calls and stalls the dock mid-service.
    if (last - verse + 1 > MAX_RANGE_VERSES) {
      return { error: `That range is ${last - verse + 1} verses. Show at most ${MAX_RANGE_VERSES} at once.` };
    }

    try {
      const verses = [];

      for (let v = verse; v <= last; v++) {
        const res = await _fetchWithTimeout(
          `${API_BASE}/get-verse/${tr.id}/${bookId}/${chapter}/${v}/`
        );
        if (!res.ok) {
          if (res.status === 404) {
            return { error: `"${reference}" not found in ${tr.key}. Check the chapter and verse.` };
          }
          return { error: `Lookup failed (${res.status}). Try again.` };
        }
        verses.push(await res.json());
      }

      const displayRef = buildReference(BIBLE_BOOKS[idx][0], chapter, verse,
                                        endVerse && endVerse > verse ? endVerse : null);

      return {
        text:      verses.map(v => buildDisplayText(v.text)).join(' '),
        reference: `${displayRef} — ${tr.key}`,
        rawRef:    displayRef,
        bookId, chapter, verse,
        endVerse:  endVerse && endVerse > verse ? endVerse : null,
      };

    } catch (err) {
      console.error('[StageApp] fetchVerse failed:', err);
      if (err && err.name === 'AbortError') {
        return { error: 'Timed out after 10s. Check the connection, then try again.' };
      }
      if (err instanceof TypeError) {
        return { error: 'No connection. Check the internet, then try again.' };
      }
      return { error: 'Lookup failed: ' + (err && err.message ? err.message : err) };
    }
  }

  /** How many verses are in a chapter. Used for Next and Random. */
  async function fetchVerseCount(translationKey, bookId, chapter) {
    const tr  = translationById(translationKey);
    const key = `${tr.id}|${bookId}|${chapter}`;
    if (_verseCountCache[key] !== undefined) return _verseCountCache[key];
    try {
      const res = await _fetchWithTimeout(
        `${API_BASE}/get-chapter/${tr.id}/${bookId}/${chapter}/`
      );
      if (!res.ok) return 0;
      const data  = await res.json();
      const count = Array.isArray(data) ? data.length : 0;
      if (count) _verseCountCache[key] = count;
      return count;
    } catch (_) {
      return 0;
    }
  }

  async function searchScripture(translationKey, query) {
    const q = (query || '').trim();
    if (!q) return { error: 'Enter something to search for.' };
    const tr  = translationById(translationKey);
    const key = `${tr.id}|${q.toLowerCase()}`;
    if (_searchCache[key]) return _searchCache[key];

    try {
      const res = await _fetchWithTimeout(
        `${API_BASE}/search/${tr.id}/${encodeURIComponent(q)}/`
      );
      if (!res.ok) return { error: 'Search is unavailable right now.' };
      const data = await res.json();
      if (!Array.isArray(data)) return { error: 'Search returned something unexpected.' };

      const results = data.slice(0, 50).map(v => ({
        bookId:  v.book,
        chapter: v.chapter,
        verse:   v.verse,
        book:    (BIBLE_BOOKS[v.book - 1] || ['?'])[0],
        text:    buildDisplayText(v.text).replace(/([a-zA-Z])\d+/g, '$1'),
      }));
      _searchCache[key] = results;
      return results;
    } catch (_) {
      return { error: 'Search is unavailable right now.' };
    }
  }

  /** Book names matching a typed prefix, for the autocomplete dropdown. */
  function searchBooks(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    return BIBLE_BOOKS
      .filter(([name, abbr]) =>
        name.toLowerCase().startsWith(q) ||
        abbr.toLowerCase().startsWith(q) ||
        name.toLowerCase().includes(q))
      .map(([name]) => name)
      .slice(0, 8);
  }

  /** A random reference within a scope. Returns { reference } or { error }. */
  async function randomReference(translationKey, scope) {
    let pool;
    switch (scope) {
      case 'ot':      pool = range(1, OT_END); break;
      case 'nt':      pool = range(OT_END + 1, BIBLE_BOOKS.length); break;
      case 'gospels': pool = GOSPEL_IDS.slice(); break;
      case 'wisdom':  pool = WISDOM_IDS.slice(); break;
      default:        pool = range(1, BIBLE_BOOKS.length);
    }

    // A few attempts, in case a chapter lookup fails.
    for (let attempt = 0; attempt < 5; attempt++) {
      const bookId  = pool[Math.floor(Math.random() * pool.length)];
      const book    = BIBLE_BOOKS[bookId - 1];
      const chapter = 1 + Math.floor(Math.random() * book[2]);
      const count   = await fetchVerseCount(translationKey, bookId, chapter);
      if (!count) continue;
      const verse = 1 + Math.floor(Math.random() * count);
      return { reference: buildReference(book[0], chapter, verse) };
    }
    return { error: 'Could not pick a random verse. Check the connection.' };
  }

  function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }

  /**
   * Step forward or back from a reference, rolling over chapter and book
   * boundaries. Returns a reference string, or null at the ends of the Bible.
   */
  async function stepReference(reference, translationKey, dir) {
    const parsed = parseReference(reference);
    if (!parsed) return null;
    const idx = bookIndexOf(parsed.book);
    if (idx === -1) return null;

    let bookId  = idx + 1;
    let chapter = parsed.chapter;
    // A range steps from its last verse forward, its first verse back.
    let verse   = (dir > 0 && parsed.endVerse) ? parsed.endVerse : parsed.verse;

    verse += dir;

    if (verse < 1) {
      chapter -= 1;
      if (chapter < 1) {
        bookId -= 1;
        if (bookId < 1) return null;
        chapter = BIBLE_BOOKS[bookId - 1][2];
      }
      const count = await fetchVerseCount(translationKey, bookId, chapter);
      verse = count || 1;
    } else {
      const count = await fetchVerseCount(translationKey, bookId, chapter);
      if (count && verse > count) {
        verse = 1;
        chapter += 1;
        if (chapter > BIBLE_BOOKS[bookId - 1][2]) {
          bookId += 1;
          if (bookId > BIBLE_BOOKS.length) return null;
          chapter = 1;
        }
      }
    }

    return buildReference(BIBLE_BOOKS[bookId - 1][0], chapter, verse);
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  function saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULTS,
          ...parsed,
          customColors: { ...DEFAULTS.customColors, ...(parsed.customColors || {}) },
        };
      }
    } catch (_) {}
    return { ...DEFAULTS, customColors: { ...DEFAULTS.customColors } };
  }

  // ── Song library ─────────────────────────────────────────────────────────

  function saveSongs(songs) {
    try { localStorage.setItem(SONGS_KEY, JSON.stringify(songs)); } catch (_) {}
  }

  /**
   * Loads the song library. If this plugin has no library yet but the old
   * standalone lyric plugin does, its songs are carried over once. The old
   * key is left in place, so the previous plugin keeps working if it is
   * still installed.
   */
  function loadSongs() {
    try {
      const raw = localStorage.getItem(SONGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}

    try {
      const legacy = localStorage.getItem(LEGACY_SONGS_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length) {
          saveSongs(parsed);
          console.info('[StageApp] Imported ' + parsed.length +
                       ' songs from the previous lyric plugin.');
          return parsed;
        }
      }
    } catch (_) {}

    return [];
  }

  return {
    initChannel, send,
    fetchVerse, fetchVerseCount, searchScripture, randomReference, stepReference,
    parseReference, buildReference, buildDisplayText, searchBooks, bookIndexOf,
    translationById,
    saveSettings, loadSettings, saveSongs, loadSongs,
    DEFAULTS, BIBLE_BOOKS, TRANSLATIONS, LANGUAGES, FONTS,
  };
})();
