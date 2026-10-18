import { mkdir, writeFile } from 'node:fs/promises';
import { BIBLE_BOOKS } from '../src/scripture/books.js';
import { buildDisplayText } from '../src/scripture/reference.js';

const API = 'https://bolls.life';
const IDS = ['KJV', 'WEB'];
const PAUSE_MS = 150;
const RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getChapter(id, bookId, chapter) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${API}/get-chapter/${id}/${bookId}/${chapter}/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error('empty chapter');
      return rows;
    } catch (err) {
      if (attempt === RETRIES) throw new Error(`${id} ${bookId}:${chapter} - ${err.message}`);
      await sleep(PAUSE_MS * attempt * 4);
    }
  }
}

await mkdir('data/bible', { recursive: true });
for (const id of IDS) {
  const out = {};
  for (let b = 0; b < BIBLE_BOOKS.length; b += 1) {
    const bookId = b + 1;
    out[bookId] = {};
    for (let c = 1; c <= BIBLE_BOOKS[b][2]; c += 1) {
      const rows = await getChapter(id, bookId, c);
      out[bookId][c] = Object.fromEntries(rows.map((r) => [r.verse, buildDisplayText(r.text)]));
      await sleep(PAUSE_MS);
    }
    console.log(`${id} ${BIBLE_BOOKS[b][0]} done`);
  }
  await writeFile(`data/bible/${id}.json`, JSON.stringify(out));
}
console.log('all done');
