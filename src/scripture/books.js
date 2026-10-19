// ── Bible books: [fullName, abbreviation, chapterCount] ──────────────────
export const BIBLE_BOOKS = [
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

export const OT_END      = 39;   // book index 1–39 is the Old Testament
export const GOSPEL_IDS  = [40, 41, 42, 43];
export const WISDOM_IDS  = [19, 20];   // Psalms, Proverbs

// Forms people actually type that don't match a book name or the stored
// abbreviation. "Psalm 23" is the big one — almost nobody types "Psalms".
export const BOOK_ALIASES = {
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
export function bookIndexOf(name) {
  const n = normalizeBookName(name);
  if (!n) return -1;

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

/** Book names matching a typed prefix, for the autocomplete dropdown. */
export function searchBooks(query) {
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

/** Lower-case a typed book name and normalise ordinals: "II Cor." becomes "2 cor". */
export function normalizeBookName(name) {
  const n = (name || '').toLowerCase().trim().replace(/\.$/, '');
  return n
    .replace(/^(1st|first|i)\s+/,   '1 ')
    .replace(/^(2nd|second|ii)\s+/, '2 ')
    .replace(/^(3rd|third|iii)\s+/, '3 ')
    .replace(/\s+/g, ' ');
}
