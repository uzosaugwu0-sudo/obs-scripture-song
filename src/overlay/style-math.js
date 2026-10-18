export const THEME_BG = {
  dark:  '#0a0a14',
  gold:  '#080810',
  white: '#ffffff',
  neon:  '#050c10',
  'sacred-light': '#0a0a14',
};

// Body type scales with text length: short text large, long text small.
export const SIZE_RANGE = {
  'fs-sm': { min: 26, max: 34 },
  'fs-md': { min: 34, max: 46 },
  'fs-lg': { min: 46, max: 58 },
  'fs-xl': { min: 58, max: 72 },
};
export const SHORT_LEN = 80;
export const LONG_LEN  = 220;

// Baselines the Overlay Scale slider multiplies
export const MIN_HEIGHT_VH = { 'fs-sm': 18, 'fs-md': 24, 'fs-lg': 32, 'fs-xl': 42 };
export const LABEL_REM     = { 'fs-sm': 0.90, 'fs-md': 1.10, 'fs-lg': 1.30, 'fs-xl': 1.55 };

export function hexToRgba(hex, alpha) {
  const h = (typeof hex === 'string' ? hex : '').replace('#', '');
  const a = Math.max(0, Math.min(1, alpha));
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(10, 10, 20, ' + a + ')';
  return 'rgba(' + parseInt(h.slice(0, 2), 16) + ', '
                 + parseInt(h.slice(2, 4), 16) + ', '
                 + parseInt(h.slice(4, 6), 16) + ', ' + a + ')';
}

export function getScale(state) {
  const raw = state.scale !== undefined ? state.scale : 100;
  return Math.max(0.5, Math.min(1.5, raw / 100));
}

export function computeBodyFontSize(text, sizeClass, scale) {
  const range = SIZE_RANGE[sizeClass] || SIZE_RANGE['fs-md'];
  const len   = (text || '').length;
  let size;
  if (len < SHORT_LEN)     size = range.max;
  else if (len > LONG_LEN) size = range.min;
  else {
    const t = (len - SHORT_LEN) / (LONG_LEN - SHORT_LEN);
    size = Math.round(range.max - t * (range.max - range.min));
  }
  return Math.round(size * scale);
}
