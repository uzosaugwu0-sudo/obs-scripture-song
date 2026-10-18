import { normalizeTitle } from './model.js';

export function findDuplicateGroups(songs) {
  const groups = new Map();
  for (const song of songs) {
    const key = normalizeTitle(song.title);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), song]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/** Ids to delete: in each group the version with the most slides survives (first on a tie). */
export function pickRemovals(groups) {
  const ids = new Set();
  for (const group of groups) {
    const keeper = group.reduce((best, s) => (s.slides.length > best.slides.length ? s : best), group[0]);
    for (const s of group) if (s.id !== keeper.id) ids.add(s.id);
  }
  return ids;
}
