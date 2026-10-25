import { escapeHtml } from '../core/html.js';

export const $ = (id) => document.getElementById(id);

export function highlightMatch(text, q) {
  if (!q) return escapeHtml(text);
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return escapeHtml(text).replace(re, '<mark>$1</mark>');
}
