import { BIBLE_BOOKS, BOOK_ALIASES, bookIndexOf, normalizeBookName } from './books.js';
import { parseReference } from './reference.js';

const MIN_SEARCH_LETTERS = 3;

/** Book names starting with the typed text (name, abbreviation or alias), in Bible order. */
export function suggestBooks(text, limit = 5) {
  const q = normalizeBookName(text);
  if (!q) return [];
  const matched = new Set();
  BIBLE_BOOKS.forEach(([name, abbr]) => {
    if (name.toLowerCase().startsWith(q) || abbr.toLowerCase().startsWith(q)) matched.add(name);
  });
  Object.entries(BOOK_ALIASES).forEach(([alias, name]) => {
    if (alias.startsWith(q)) matched.add(name);
  });
  return BIBLE_BOOKS.map((b) => b[0]).filter((name) => matched.has(name)).slice(0, limit);
}

function referenceBookResolves(text) {
  const parsed = parseReference(text);
  return parsed !== null && bookIndexOf(parsed.book) !== -1;
}

/** What Enter should do with the text in the smart box. */
export function classifyInput(text) {
  const t = (text || '').trim();
  if (!t) return { kind: 'empty' };
  if (referenceBookResolves(t)) return { kind: 'reference', reference: t };
  const bookIndex = bookIndexOf(t);
  if (bookIndex !== -1) return { kind: 'book', bookIndex };
  return { kind: 'search', query: t };
}

/** Rows for the dropdown under the smart box while typing. */
export function dropdownRows(text) {
  const t = (text || '').trim();
  if (!t) return [];
  const rows = suggestBooks(t).map((name) => ({ type: 'book', name }));
  const letters = (t.match(/[a-z]/gi) || []).length;
  if (letters >= MIN_SEARCH_LETTERS && !referenceBookResolves(t) && bookIndexOf(t) === -1) {
    rows.push({ type: 'search', query: t });
  }
  return rows;
}
