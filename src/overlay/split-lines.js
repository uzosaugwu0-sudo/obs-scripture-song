const MIN_PIECE = 12;   // shorter pieces are joined to a neighbour
const MAX_PIECES = 8;   // more than this are grouped evenly

/**
 * Lines for the Line by line animation. A song slide splits on its own line
 * breaks; a verse splits after clause punctuation so it builds like speech.
 */
export function splitLines(text, kind) {
  const raw = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return [];
  if (kind === 'song') return raw.split('\n').map((l) => l.trim()).filter(Boolean);

  const pieces = raw.replace(/\s+/g, ' ').split(/(?<=[,;:.?!])\s+/);
  const out = [];
  let pending = '';
  for (const piece of pieces) {
    const current = pending ? `${pending} ${piece}` : piece;
    if (current.length < MIN_PIECE) pending = current;
    else { out.push(current); pending = ''; }
  }
  if (pending) {
    if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${pending}`;
    else out.push(pending);
  }

  if (out.length <= MAX_PIECES) return out;
  const size = Math.ceil(out.length / MAX_PIECES);
  const grouped = [];
  for (let i = 0; i < out.length; i += size) grouped.push(out.slice(i, i + size).join(' '));
  return grouped;
}