import { looksLikeSong } from './model.js';
import { isLyricsFile, parseLyricsFile } from './lyrics-file.js';

export function parseTxt(text, filename) {
  const filenameFallback = filename.replace(/\.txt$/i, '').replace(/_/g, ' ').trim() || 'Imported Song';
  const norm  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = norm.split('\n');
  const labelRe = /^(verse|chorus|bridge|pre-?chorus|outro|intro|tag|hook|refrain|repeat|interlude|coda|ending)\s*\d*\s*:?\s*$/i;
  const sepRe   = /^[-=]{3,}\s*$/;

  function slidesFromLines(bodyLines) {
    const slides = []; let current = [];
    bodyLines.forEach(line => {
      if (labelRe.test(line.trim())) { if (current.length) { slides.push(current.join('\n')); current = []; } }
      else if (line.trim() === '')   { if (current.length) { slides.push(current.join('\n')); current = []; } }
      else current.push(line);
    });
    if (current.length) slides.push(current.join('\n'));
    return slides.length ? slides : [''];
  }

  const headerRe = /^([a-zA-Z ]+)\s*:\s*(.+)$/;
  let headerTitle = null, headerEnd = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const m = lines[i].match(headerRe);
    if (m) { if (/^title$/i.test(m[1].trim())) headerTitle = m[2].trim(); headerEnd = i + 1; }
    else if (lines[i].trim() === '') break;
    else { headerEnd = 0; break; }
  }

  // The display title always comes from the filename. An embedded title is
  // kept as an alias so it still turns up in search.
  const title = filenameFallback;
  let altTitle = null, bodyLines;

  if (headerTitle) {
    altTitle  = filenameFallback.toLowerCase() !== headerTitle.toLowerCase() ? headerTitle : null;
    bodyLines = lines.slice(headerEnd);
  } else {
    const firstNonBlank = lines.findIndex(l => l.trim() !== '');
    const candidate     = firstNonBlank !== -1 ? lines[firstNonBlank].trim() : '';
    const nextLine      = firstNonBlank !== -1 ? (lines[firstNonBlank + 1] || '').trim() : '';
    if (candidate.length > 0 && candidate.length <= 120 && !labelRe.test(candidate)) {
      altTitle  = filenameFallback.toLowerCase() !== candidate.toLowerCase() ? candidate : null;
      bodyLines = lines.slice(nextLine === '' ? firstNonBlank + 2 : firstNonBlank + 1);
    } else {
      bodyLines = lines;
    }
  }

  const sepIdx = bodyLines.findIndex(l => sepRe.test(l));
  if (sepIdx !== -1) bodyLines = bodyLines.slice(0, sepIdx);

  return [{ title, altTitle, slides: slidesFromLines(bodyLines) }];
}

export function parseCsv(text) {
  const sep  = text.includes('\t') ? '\t' : ',';
  const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(r => r.trim());
  if (rows.length < 2) return [];

  function parseRow(line) {
    const fields = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === sep && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers  = parseRow(rows[0]).map(h => h.toLowerCase());
  const titleIdx = headers.findIndex(h => h === 'title' || h === 'song' || h === 'name');
  if (titleIdx === -1) return [];

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cols  = parseRow(rows[i]);
    const title = cols[titleIdx] || '';
    if (!title) continue;
    const lyricsIdx = headers.findIndex(h => h === 'lyrics' || h === 'text' || h === 'words');
    let slides = [];
    if (lyricsIdx !== -1 && cols[lyricsIdx]) {
      slides = cols[lyricsIdx].replace(/\\n/g, '\n').split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    } else {
      for (let c = 0; c < cols.length; c++) if (c !== titleIdx && cols[c].trim()) slides.push(cols[c].trim());
    }
    if (slides.length === 0) slides.push('');
    result.push({ title, slides });
  }
  return result;
}

export function parseJsonSongs(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.songs) ? data.songs : []);
  return list.filter(looksLikeSong);
}

/** Songs found in one file, chosen by extension. Throws if a .json file is not valid JSON. */
export function parseSongFile(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return parseJsonSongs(text);
  if (lower.endsWith('.txt'))  return isLyricsFile(text) ? parseLyricsFile(text) : parseTxt(text, name);
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return parseCsv(text);
  return [];
}
