export const STATE_VERSION = 1;
const ACTIONS = Object.freeze(['show', 'hide', 'clear']);
export const KINDS = Object.freeze(['verse', 'song', 'announcement', 'timer']);
export const THEMES = Object.freeze(['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom']);
export const ANIMATIONS = Object.freeze(['rise', 'wipe', 'lines', 'cut']);

export const DEFAULTS = Object.freeze({
  action:        'show',
  kind:          'verse',   // one of KINDS; later phases add more
  title:         '',        // song title
  body:          '',        // verse text or slide lines
  reference:     '',        // scripture reference
  timer:         null,      // timer kind only: { endAt } while running, { remainingMs } while paused
  theme:         'frosted',
  position:      'bottom',
  fontSize:      'md',
  animation:     'rise',
  visible:       false,
  version:       STATE_VERSION,
  seq:           0,         // monotonic; replaces the old timestamp
  opacity:       88,
  scale:         100,
  font:          'Open Sans',
  italic:        false,
  showCard:      true,
  showTitle:     true,
  showReference: true,
  bgMode:        'color',   // 'color' | 'image'
  bgImage:       null,
  customColors:  { bg: '#0a0a14', text: '#ffffff', accent: '#a78bfa' },
});

const LEGACY_THEMES     = Object.freeze({ dark: 'frosted', gold: 'frosted', neon: 'frosted', white: 'frosted-light' });
const LEGACY_ANIMATIONS = Object.freeze({ fade: 'rise', slide: 'rise', none: 'cut' });

/** Map pre-redesign theme and animation names onto the new set; anything unknown becomes the default. */
export function migrateLegacy({ theme, animation } = {}) {
  const t = LEGACY_THEMES[theme] ?? theme;
  const a = LEGACY_ANIMATIONS[animation] ?? animation;
  return {
    theme:     THEMES.includes(t) ? t : DEFAULTS.theme,
    animation: ANIMATIONS.includes(a) ? a : DEFAULTS.animation,
  };
}

/** Next sequence number: always above the last one, and clock-based so it survives restarts. */
export function nextSeq(lastSeq, nowMs) {
  return Math.max(lastSeq + 1, nowMs);
}

function validTimer(timer) {
  if (!timer || typeof timer !== 'object') return false;
  if (typeof timer.endAt === 'number') return Number.isFinite(timer.endAt);
  return typeof timer.remainingMs === 'number' && Number.isFinite(timer.remainingMs) && timer.remainingMs >= 0;
}

/**
 * Turn anything that arrives over a transport into a usable state, or null.
 * The overlay ignores null, so hostile or newer-than-us payloads render nothing.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.version === 'number' && raw.version > STATE_VERSION) return null;
  const merged = {
    ...DEFAULTS,
    ...raw,
    customColors: { ...DEFAULTS.customColors, ...(raw.customColors || {}) },
  };
  if (!ACTIONS.includes(merged.action)) return null;
  if (!KINDS.includes(merged.kind)) return null;
  if (merged.kind === 'timer' && merged.action !== 'clear' && !validTimer(merged.timer)) return null;
  return { ...merged, ...migrateLegacy(merged) };
}