import { safeFilename } from '../core/record-folder.js';

export const LOGO_MAX_SIDE = 160;   // pictures are shrunk to this on their longest side

const LOGO_NAME = /^[^\\/:*?"<>|\x00-\x1f]{1,80}\.png$/i;

/** A plain file name ending .png: no folders, no dot-dot, not hidden. */
export const isValidLogoName = (name) =>
  typeof name === 'string' && LOGO_NAME.test(name) && !name.startsWith('.') && !name.includes('..');

/** A free "name.png": "Pastor John.jpg" becomes "Pastor_John.png", then "Pastor_John (2).png" if taken. */
export function logoFileName(sourceName, taken) {
  const stem = (sourceName || '').replace(/\.[^.]*$/, '').replace(/\./g, '_');
  const base = (stem.trim() ? safeFilename(stem, 'logo') : 'logo').slice(0, 70).trim() || 'logo';   // room for " (99).png" under the 80 limit
  const used = new Set(taken.map((n) => n.toLowerCase()));
  let name = base + '.png';
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = base + ' (' + n + ').png';
  return name;
}

/** The size to draw a picture at: longest side at most `max`, proportions kept, never zero. */
export function fitSize(width, height, max = LOGO_MAX_SIDE) {
  if (!(width > 0) || !(height > 0)) return null;
  const k = Math.max(width, height) > max ? max / Math.max(width, height) : 1;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
