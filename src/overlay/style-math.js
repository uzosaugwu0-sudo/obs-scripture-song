// Card colour used behind the text for themes that have a card.
export const THEME_BG = {
  frosted:         '#0e121e',
  'frosted-light': '#ffffff',
  pure:            '#0a0c14',   // only used when Show card is turned on for Pure Type
  'sacred-light':  '#0a0a14',
};

// Base alpha multiplied by the opacity slider, so the default 88% gives 0.55 / 0.704 glass.
export const THEME_ALPHA = { frosted: 0.625, 'frosted-light': 0.8 };

// Pure Type floats text on the video; every other theme starts with its card on.
const CARD_DEFAULT = { frosted: true, 'frosted-light': true, pure: false, 'sacred-light': true, custom: true };

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

export function cardAlpha(theme, opacityPct) {
  const alpha = (opacityPct / 100) * (THEME_ALPHA[theme] ?? 1);
  return Math.max(0, Math.min(1, alpha));
}

export function defaultShowCard(theme) {
  return CARD_DEFAULT[theme] ?? true;
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