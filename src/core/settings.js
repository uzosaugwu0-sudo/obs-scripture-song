import { DEFAULTS, migrateLegacy } from './state.js';

export const SETTINGS_KEY = 'obs-stage-display-settings';

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function saveSettings(settings, { storage = defaultStorage(), onError = () => {} } = {}) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    onError(err);
  }
}

export function loadSettings({ storage = defaultStorage(), onError = () => {} } = {}) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = {
        ...DEFAULTS,
        ...parsed,
        customColors: { ...DEFAULTS.customColors, ...(parsed.customColors || {}) },
      };
      return { ...merged, ...migrateLegacy(merged) };
    }
  } catch (err) {
    onError(err);
  }
  return { ...DEFAULTS, customColors: { ...DEFAULTS.customColors } };
}