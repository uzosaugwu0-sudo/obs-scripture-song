import { isPlanRecord, toPlanRecord } from './model.js';

export const PLANS_KEY     = 'obs-stage-plans';
export const LAST_PLAN_KEY = 'obs-stage-last-plan';

/** Plans kept in the browser: the plan list when no folder is chosen, and a safety copy beside the folder. */
export function createLocalPlanStore(storage, onError = () => {}) {
  function load() {
    try {
      const raw = storage?.getItem(PLANS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isPlanRecord).map(toPlanRecord) : [];
    } catch (err) {
      onError(err);
      return [];
    }
  }

  function save(plans) {
    try {
      storage?.setItem(PLANS_KEY, JSON.stringify(plans));
    } catch (err) {
      onError(err);
    }
  }

  function loadLastId() {
    try {
      return storage?.getItem(LAST_PLAN_KEY) || null;
    } catch (err) {
      onError(err);
      return null;
    }
  }

  function saveLastId(id) {
    try {
      if (id) storage?.setItem(LAST_PLAN_KEY, id);
      else storage?.removeItem(LAST_PLAN_KEY);
    } catch (err) {
      onError(err);
    }
  }

  return { load, save, loadLastId, saveLastId };
}
