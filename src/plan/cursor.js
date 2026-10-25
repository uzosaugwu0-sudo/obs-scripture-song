import { isValidTimerSpec, describeTimerSpec } from './extras.js';

const titleOk = (item) => item.title === undefined || typeof item.title === 'string';

export function itemStatus(item, library) {
  if (item.type === 'song') return library.get(item.songId) ? 'ok' : 'missing';
  if (item.type === 'reading') return typeof item.ref === 'string' && item.ref.trim() ? 'ok' : 'unsupported';
  if (item.type === 'announcement') return typeof item.body === 'string' && item.body.trim() && titleOk(item) ? 'ok' : 'unsupported';
  if (item.type === 'timer') return isValidTimerSpec(item) && titleOk(item) ? 'ok' : 'unsupported';
  return 'unsupported';
}

export function itemTitle(item, library) {
  const status = itemStatus(item, library);
  if (item.type === 'song') return status === 'ok' ? (library.get(item.songId).title || 'Untitled') : 'Song missing';
  if (status !== 'ok') return 'Unsupported item';
  if (item.type === 'reading') return item.ref;
  if (item.type === 'announcement') return (item.title || '').trim() || item.body.trim().split('\n')[0];
  return (item.title || '').trim() || describeTimerSpec(item);
}

export const indexOfItem = (plan, id) => (id === null ? -1 : plan.items.findIndex((i) => i.id === id));

export function nextLoadable(plan, currentId, library) {
  for (let i = indexOfItem(plan, currentId) + 1; i < plan.items.length; i += 1) {
    if (itemStatus(plan.items[i], library) === 'ok') return plan.items[i];
  }
  return null;
}

export function prevLoadable(plan, currentId, library) {
  for (let i = indexOfItem(plan, currentId) - 1; i >= 0; i -= 1) {
    if (itemStatus(plan.items[i], library) === 'ok') return plan.items[i];
  }
  return null;
}

/** What is current once `removedId` leaves the plan. Pass the plan as it is BEFORE the removal. */
export function currentAfterRemove(plan, currentId, removedId) {
  if (currentId !== removedId) return currentId;
  const at = indexOfItem(plan, removedId);
  return at > 0 ? plan.items[at - 1].id : null;
}

/** The one-line "3 of 6 · Next: John 3:16" shown in the live bar. */
export function planSummary(plan, currentId, library) {
  const total = plan.items.length;
  if (!total) return null;
  const at = indexOfItem(plan, currentId);
  const next = nextLoadable(plan, currentId, library);
  const where = at === -1 ? total + (total === 1 ? ' item' : ' items') : (at + 1) + ' of ' + total;
  return where + ' \u00b7 ' + (next ? 'Next: ' + itemTitle(next, library) : 'End of plan');
}