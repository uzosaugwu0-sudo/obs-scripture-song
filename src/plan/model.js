import { uid as defaultUid } from '../songs/model.js';

export const PLAN_VERSION = 1;
export const DEFAULT_PLAN_NAME = 'Untitled plan';

const cleanName = (name) => (name || '').trim() || DEFAULT_PLAN_NAME;
const isItem = (i) => !!i && typeof i === 'object' && typeof i.id === 'string' && typeof i.type === 'string';

export function isPlanRecord(x) {
  return !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string'
    && (x.v === undefined || (Number.isInteger(x.v) && x.v <= PLAN_VERSION))
    && Array.isArray(x.items) && x.items.every(isItem);
}

export function toPlanRecord(x) {
  return { v: PLAN_VERSION, id: x.id, name: x.name, items: x.items.map((i) => ({ ...i })) };
}

export function createPlan(name = DEFAULT_PLAN_NAME, uid = defaultUid) {
  return { v: PLAN_VERSION, id: 'p_' + uid(), name: cleanName(name), items: [] };
}

export const songItem = (songId, uid = defaultUid) => ({ id: 'i_' + uid(), type: 'song', songId });
export const readingItem = (ref, translation, uid = defaultUid) => ({ id: 'i_' + uid(), type: 'reading', ref, translation });

export const announcementItem = ({ title = '', body = '' }, uid = defaultUid) =>
  ({ id: 'i_' + uid(), type: 'announcement', title: title.trim(), body: body.trim() });

export function timerItem({ mode, seconds, at, title = '' }, uid = defaultUid) {
  const base = { id: 'i_' + uid(), type: 'timer', mode };
  const spec = mode === 'clock' ? { at } : { seconds };
  return { ...base, ...spec, title: title.trim() };
}

export function addItem(plan, item, afterId = null) {
  const at = afterId === null ? -1 : plan.items.findIndex((i) => i.id === afterId);
  const index = at === -1 ? plan.items.length : at + 1;
  return { ...plan, items: [...plan.items.slice(0, index), item, ...plan.items.slice(index)] };
}

export function moveItemTo(plan, id, toIndex) {
  const from = plan.items.findIndex((i) => i.id === id);
  if (from === -1) return plan;
  const to = Math.max(0, Math.min(plan.items.length - 1, toIndex));
  if (to === from) return plan;
  const rest = plan.items.filter((i) => i.id !== id);
  return { ...plan, items: [...rest.slice(0, to), plan.items[from], ...rest.slice(to)] };
}

export function moveItem(plan, id, delta) {
  const from = plan.items.findIndex((i) => i.id === id);
  return from === -1 ? plan : moveItemTo(plan, id, from + delta);
}

export function removeItem(plan, id) {
  return plan.items.some((i) => i.id === id) ? { ...plan, items: plan.items.filter((i) => i.id !== id) } : plan;
}

export const renamePlan = (plan, name) => ({ ...plan, name: cleanName(name) });

/** A name no other plan uses (case-insensitive): "Name", then "Name (2)", "Name (3)"... */
export function uniqueName(plans, name, exceptId = null) {
  const base = cleanName(name);
  const taken = new Set(plans.filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has((base + ' (' + n + ')').toLowerCase())) n += 1;
  return base + ' (' + n + ')';
}

/** Swap in a whole new item at the same place, keeping the old id (fields the new item lacks are dropped). */
export function replaceItem(plan, id, item) {
  if (!plan.items.some((i) => i.id === id)) return plan;
  return { ...plan, items: plan.items.map((i) => (i.id === id ? { ...item, id } : i)) };
}
