import { escapeHtml } from '../core/html.js';
const CONTEXT = 30;
const NO_MATCH = Object.freeze({ matched: false, via: null, excerpt: null, score: 0 });

/** Lower-case, accent-free, apostrophe-free text where every other run of punctuation becomes one space. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(query) {
  const normalized = normalizeText(query);
  return normalized ? normalized.split(' ') : [];
}

function excerptFor(slides, tokens) {
  let best = '';
  let bestHits = -1;
  for (const slide of slides) {
    const normalized = normalizeText(slide);
    const hits = tokens.filter((t) => normalized.includes(t)).length;
    if (hits > bestHits) { best = slide; bestHits = hits; }
  }
  const lower = best.toLowerCase();
  const found = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const idx = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, idx - CONTEXT);
  const end = Math.min(best.length, idx + CONTEXT * 2);
  return (start > 0 ? '...' : '') + best.slice(start, end).trim() + (end < best.length ? '...' : '');
}

/** Does the song match, and how well? Every word of the query must appear in the title or the lyrics. */
export function songMatches(song, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return { matched: true, via: null, excerpt: null, score: 0 };

  const titleText = normalizeText([song.title, song.altTitle].filter((t) => typeof t === 'string').join(' '));
  const slides = (song.slides || []).filter((s) => typeof s === 'string');
  const lyricsText = normalizeText(slides.join(' '));

  let titleHits = 0;
  let lyricHits = 0;
  for (const token of tokens) {
    const inTitle = titleText.includes(token);
    const inLyrics = lyricsText.includes(token);
    if (!inTitle && !inLyrics) return NO_MATCH;
    if (inTitle) titleHits += 1;
    if (inLyrics) lyricHits += 1;
  }

  const phrase = tokens.join(' ');
  const allInTitle = titleHits === tokens.length;
  let score = titleHits * 50 + lyricHits * 10;
  if (allInTitle) score += 1000;
  if (titleText.startsWith(phrase)) score += 500;
  else if (titleText.includes(phrase)) score += 200;
  if (lyricsText.includes(phrase)) score += 100;

  return { matched: true, via: allInTitle ? 'title' : 'lyrics', excerpt: allInTitle ? null : excerptFor(slides, tokens), score };
}

/** Matching songs, best first; ties alphabetical. An empty query lists every song alphabetically. */
export function searchSongs(songs, query) {
  return songs
    .map((song) => ({ song, ...songMatches(song, query) }))
    .filter((result) => result.matched)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** HTML-safe text with every token occurrence wrapped in a mark element. */
export function markTokens(text, tokens) {
  const raw = String(text ?? '');
  const usable = (tokens || []).filter(Boolean).map(escapeRegExp);
  if (!usable.length) return escapeHtml(raw);
  const parts = raw.split(new RegExp('(' + usable.join('|') + ')', 'i'));
  return parts.map((part, i) => (i % 2 === 1 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part))).join('');
}
