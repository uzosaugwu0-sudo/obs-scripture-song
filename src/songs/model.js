export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function normalizeTitle(title) {
  return (title || '').trim().toLowerCase();
}

export function looksLikeSong(x) {
  return !!x && typeof x === 'object' && typeof x.title === 'string' && Array.isArray(x.slides);
}

export function isSongRecord(x) {
  return looksLikeSong(x) && typeof x.id === 'string' && x.slides.every((s) => typeof s === 'string');
}

export function toSongRecord(x) {
  return {
    id:       x.id,
    title:    x.title,
    altTitle: x.altTitle ?? null,
    slides:   [...x.slides],
  };
}
