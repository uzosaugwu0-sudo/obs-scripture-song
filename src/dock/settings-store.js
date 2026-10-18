import { loadSettings, saveSettings } from '../core/settings.js';

const STYLE_KEYS = ['theme', 'position', 'fontSize', 'animation', 'font', 'italic', 'opacity',
                    'scale', 'showCard', 'showTitle', 'showReference'];
const PERSISTED_KEYS = [...STYLE_KEYS, 'customColors', 'bgImage', 'language', 'translation', 'autoShow'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

/** The one in-memory copy of the persisted dock settings. Values are replaced, never mutated. */
export function createSettingsStore({ storage, onError = () => {} } = {}) {
  let current = loadSettings({ storage, onError });
  const listeners = new Set();

  return {
    get: () => current,

    update(patch) {
      current = {
        ...current,
        ...patch,
        customColors: { ...current.customColors, ...(patch.customColors || {}) },
      };
      saveSettings(pick(current, PERSISTED_KEYS), { storage, onError });
      listeners.forEach((fn) => fn(current));
      return current;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** What the overlay needs, in the shape the transport sends. */
    styleState() {
      return {
        ...pick(current, STYLE_KEYS),
        customColors: { ...current.customColors },
        bgMode: current.bgImage ? 'image' : 'color',
        bgImage: current.bgImage || null,
      };
    },
  };
}
