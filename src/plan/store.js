import { uid as defaultUid } from '../songs/model.js';
import { toPlanRecord, uniqueName } from './model.js';
import { createPlanFolder } from './folder.js';

/**
 * The plans the dock can open. Plans live in memory as immutable records; every
 * change goes to plans/ in the library folder when it is connected and writable
 * (canWrite), and always to the browser copy. A failed write keeps the plan and
 * marks it dirty, so it wins over the folder copy when the folder is attached again.
 */
export function createPlanStore({ local, onError = () => {}, canWrite = () => true, uid = defaultUid }) {
  let plans = local.load();
  let folder = null;
  let unreadable = [];
  const dirty = new Set();

  async function persist({ write = [], remove = [] } = {}) {
    if (!folder || !canWrite()) {
      write.forEach((p) => dirty.add(p.id));
      local.save(plans);
      return;
    }
    try {
      for (const plan of write) await folder.write(plan);
      for (const id of remove) await folder.remove(id);
    } catch (err) {
      onError(err);
      write.forEach((p) => dirty.add(p.id));
    }
    local.save(plans);
  }

  const get = (id) => plans.find((p) => p.id === id) || null;

  async function save(input) {
    const record = toPlanRecord({ ...input, id: input.id || 'p_' + uid(), name: uniqueName(plans, input.name, input.id) });
    plans = plans.some((p) => p.id === record.id)
      ? plans.map((p) => (p.id === record.id ? record : p))
      : [...plans, record];
    await persist({ write: [record] });
    return record;
  }

  async function remove(id) {
    if (!get(id)) return;
    plans = plans.filter((p) => p.id !== id);
    dirty.delete(id);
    await persist({ remove: [id] });
  }

  async function duplicate(id) {
    const source = get(id);
    if (!source) return null;
    return save({
      ...source,
      id: 'p_' + uid(),
      name: source.name + ' (copy)',
      items: source.items.map((i) => ({ ...i, id: 'i_' + uid() })),
    });
  }

  /** The folder is truth; plans only in memory, and plans edited while it was unavailable, are written into it. */
  async function attach(dirHandle) {
    const newFolder = await createPlanFolder(dirHandle);
    const { records, errors } = await newFolder.list();
    const edited = new Set(dirty);
    dirty.clear();
    const inFolder = new Set(records.map((p) => p.id));
    const carried = plans.filter((p) => edited.has(p.id) || !inFolder.has(p.id));
    folder = newFolder;
    unreadable = errors;
    plans = [...records.filter((p) => !edited.has(p.id)), ...carried];
    await persist({ write: carried });
    return { loaded: records.length, carried: carried.length, errors };
  }

  function detach() {
    folder = null;
    unreadable = [];
    local.save(plans);
  }

  return {
    list: () => plans, get, save, remove, duplicate, attach, detach,
    unreadable: () => unreadable,
    lastId: () => local.loadLastId(),
    setLastId: (id) => local.saveLastId(id),
  };
}
