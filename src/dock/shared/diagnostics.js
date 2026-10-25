/** A small in-memory error log a volunteer can read out when something misbehaves. */
export function createDiagnostics({ max = 100 } = {}) {
  let list = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(list));

  return {
    log(context, err) {
      const message = err instanceof Error ? err.message : String(err);
      list = [...list, { at: new Date().toISOString(), context, message }].slice(-max);
      emit();
    },
    entries: () => list,
    clear() { list = []; emit(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
