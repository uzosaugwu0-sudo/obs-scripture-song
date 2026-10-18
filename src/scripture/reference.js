import { BIBLE_BOOKS, bookIndexOf } from './books.js';

/** Parse "John 3:16", "1 Corinthians 13:4-7", "John 3 16", "Psalm 23". */
export function parseReference(str) {
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

export function buildReference(book, chapter, verse, endVerse) {
  const range = endVerse && endVerse > verse ? `${verse}-${endVerse}` : `${verse}`;
  return `${book} ${chapter}:${range}`;
}

/** Strip Strong's numbers, markup and verse numbers from API text. */
export function buildDisplayText(raw) {
  if (!raw) return '';
  return raw
    .replace(/<S>\d+<\/S>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\d+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Step forward or back from a reference, rolling over chapter and book
 * boundaries. Returns a reference string, or null at the ends of the Bible.
 * `countFn(bookId, chapter)` resolves to the chapter's verse count, or 0 when
 * it is not known (stepping forward then simply adds one).
 */
export async function stepReference(reference, dir, countFn) {
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
    verse = (await countFn(bookId, chapter)) || 1;
  } else {
    const count = await countFn(bookId, chapter);
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
