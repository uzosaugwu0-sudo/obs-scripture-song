export const LYRICS_FILENAME = 'lyrics.txt';
export const LYRICS_HEADER   = '#OBS-LYRICS-V1';

const DELIMITER    = '='.repeat(10);
const DELIMITER_RE = /^={3,}\s*$/;
const BACKSLASH    = String.fromCharCode(92);

const oneLine = (text) => (text || '').replace(/\s+/g, ' ').trim();

// A line that is empty, starts with a backslash, or looks like the song
// separator is written with a leading backslash; the parser removes it.
const escapeLine = (line) =>
  (line === '' || line.startsWith(BACKSLASH) || DELIMITER_RE.test(line)) ? BACKSLASH + line : line;
const unescapeLine = (line) => (line.startsWith(BACKSLASH) ? line.slice(1) : line);

/** All songs in one readable text file. The per-song JSON files stay the source of truth. */
export function buildLyricsFile(songs) {
  const blocks = songs.map((song) => {
    const lines = [escapeLine(oneLine(song.title) || 'Untitled')];
    for (const slide of song.slides) {
      lines.push('');
      for (const line of slide.replace(/\r\n?/g, '\n').split('\n')) lines.push(escapeLine(line));
    }
    return lines.join('\n');
  });
  return `${LYRICS_HEADER}\n\n${blocks.join(`\n\n${DELIMITER}\n\n`)}\n`;
}

export function isLyricsFile(text) {
  const first = text.replace(/^﻿/, '').split(/\r?\n/).find((line) => line.trim() !== '');
  return first !== undefined && first.trim() === LYRICS_HEADER;
}

function parseBlock(lines) {
  let i = 0;
  while (i < lines.length && lines[i] === '') i += 1;
  if (i >= lines.length) return null;

  const title = unescapeLine(lines[i]);
  const slides = [];
  let current = null;
  for (i += 1; i < lines.length; i += 1) {
    if (lines[i] === '') {
      if (current) { slides.push(current.join('\n')); current = null; }
      continue;
    }
    (current ??= []).push(unescapeLine(lines[i]));
  }
  if (current) slides.push(current.join('\n'));
  return { title, altTitle: null, slides };
}

export function parseLyricsFile(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === LYRICS_HEADER) + 1;
  const songs = [];
  let block = [];
  const flush = () => {
    const song = parseBlock(block);
    if (song) songs.push(song);
    block = [];
  };
  for (const line of lines.slice(start)) {
    if (DELIMITER_RE.test(line)) flush(); else block.push(line);
  }
  flush();
  return songs;
}
