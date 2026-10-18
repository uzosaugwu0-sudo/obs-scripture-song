import { DEFAULTS, normalizeState } from '../core/state.js';
import {
  THEME_BG, MIN_HEIGHT_VH, LABEL_REM,
  hexToRgba, getScale, computeBodyFontSize,
} from './style-math.js';

const KIND_CLASSES  = ['kind-verse', 'kind-song'];
const THEME_CLASSES = ['theme-dark', 'theme-gold', 'theme-white',
                       'theme-neon', 'theme-sacred-light', 'theme-custom'];
const POS_CLASSES   = ['pos-bottom', 'pos-center', 'pos-top'];
const SIZE_CLASSES  = ['fs-sm', 'fs-md', 'fs-lg', 'fs-xl'];
const SACRED_IMAGE  = 'assets/bg1.png';

export function createRenderer(doc = document, onError = () => {}) {
  const stage   = doc.getElementById('stage');
  const card    = doc.getElementById('card');
  const wrap    = doc.getElementById('wrap');
  const titleEl = doc.getElementById('ov-title');
  const bodyEl  = doc.getElementById('ov-body');
  const refEl   = doc.getElementById('ov-ref');

  function setClass(group, value) {
    group.forEach((c) => stage.classList.remove(c));
    stage.classList.add(value);
  }

  function applyStyles(state) {
    const kind      = state.kind === 'song' ? 'song' : 'verse';
    const theme     = state.theme || 'dark';
    const opacity   = (state.opacity !== undefined ? state.opacity : 88) / 100;
    const font      = state.font || 'Open Sans';
    const sizeClass = 'fs-' + (state.fontSize || 'md');
    const scale     = getScale(state);
    const colors    = state.customColors || DEFAULTS.customColors;

    setClass(KIND_CLASSES,  'kind-' + kind);
    setClass(THEME_CLASSES, 'theme-' + theme);
    setClass(POS_CLASSES,   'pos-' + (state.position || 'bottom'));
    setClass(SIZE_CLASSES,  sizeClass);

    // A background image implies a visible card, since the image is the
    // card. Otherwise honour the Show Card checkbox.
    let imageUrl = null;
    if (theme === 'sacred-light')                       imageUrl = SACRED_IMAGE;
    else if (state.bgMode === 'image' && state.bgImage) imageUrl = state.bgImage;

    const showCard = imageUrl ? true : (state.showCard !== false);
    stage.classList.toggle('no-card', !showCard);

    // Clear inline backgrounds so nothing stale survives a theme change
    card.style.background         = '';
    card.style.backgroundColor    = '';
    card.style.backgroundImage    = '';
    card.style.backgroundSize     = '';
    card.style.backgroundPosition = '';
    card.style.backgroundRepeat   = '';

    if (imageUrl) {
      card.style.backgroundImage    = 'url("' + imageUrl + '")';
      card.style.backgroundSize     = 'cover';
      card.style.backgroundPosition = 'center';
      card.style.backgroundRepeat   = 'no-repeat';
    } else if (showCard) {
      const hex = theme === 'custom' ? colors.bg : (THEME_BG[theme] || '#0a0a14');
      card.style.background = hexToRgba(hex, opacity);
    } else {
      card.style.backgroundColor = 'transparent';
    }

    if (theme === 'custom') {
      const accent = colors.accent || '#a78bfa';
      bodyEl.style.color  = colors.text || '#ffffff';
      titleEl.style.color = accent;
      refEl.style.color   = accent;
      card.style.setProperty('--accent', accent);
    } else {
      bodyEl.style.color  = '';
      titleEl.style.color = '';
      refEl.style.color   = '';
      card.style.removeProperty('--accent');
    }

    card.style.fontFamily  = "'" + font + "', 'Open Sans', Georgia, serif";
    bodyEl.style.fontStyle = state.italic ? 'italic' : 'normal';

    // Title and reference visibility. Their accent lines follow them.
    const hideTitle = kind !== 'song'  || state.showTitle === false;
    const hideRef   = kind !== 'verse' || state.showReference === false;
    titleEl.style.display = hideTitle ? 'none' : '';
    refEl.style.display   = hideRef   ? 'none' : '';
    stage.classList.toggle('no-title', hideTitle);
    stage.classList.toggle('no-ref',   hideRef);

    // Overlay Scale — card height and vertical padding only, so the card
    // keeps the same width whatever the slider says.
    card.style.minHeight     = ((MIN_HEIGHT_VH[sizeClass] || 24) * scale) + 'vh';
    card.style.paddingTop    = Math.round(28 * scale) + 'px';
    card.style.paddingBottom = Math.round(24 * scale) + 'px';
    card.style.paddingLeft   = '52px';
    card.style.paddingRight  = '52px';

    const labelRem = (LABEL_REM[sizeClass] || 1.10) * scale;
    titleEl.style.fontSize = labelRem + 'rem';
    refEl.style.fontSize   = labelRem + 'rem';
  }

  function scaleText(text, sizeClass, scale) {
    bodyEl.style.fontSize = computeBodyFontSize(text, sizeClass, scale) + 'px';
  }

  function runAnim(name, seconds, fallbackMs, done) {
    wrap.style.animation = 'none';
    void wrap.offsetWidth;                  // force reflow so it replays
    wrap.style.animation = name + ' ' + seconds + 's ease forwards';
    if (!done) return;
    let fired = false;
    const finish = () => { if (fired) return; fired = true; done(); };
    const timer = setTimeout(finish, fallbackMs);
    wrap.addEventListener('animationend', () => {
      clearTimeout(timer);
      finish();
    }, { once: true });
  }

  // ── Show / hide / clear ───────────────────────────────────────────────

  function show(state) {
    const anim       = state.animation || 'fade';
    const sizeClass  = 'fs-' + (state.fontSize || 'md');
    const wasVisible = !stage.classList.contains('hidden');

    const commit = () => {
      applyStyles(state);

      titleEl.textContent = state.kind === 'song' ? (state.title || '') : '';
      bodyEl.textContent  = state.body || '';
      refEl.textContent   = state.kind === 'song' ? '' : (state.reference || '');
      scaleText(state.body || '', sizeClass, getScale(state));

      stage.classList.remove('hidden');

      if (anim === 'none') {
        wrap.style.animation = '';
        wrap.style.opacity   = '1';
        wrap.style.transform = 'none';
        return;
      }
      const name = anim === 'slide'
        ? (stage.classList.contains('pos-top') ? 'slideDown' : 'slideUp')
        : 'fadeIn';
      runAnim(name, 0.55, 620);
    };

    if (wasVisible && anim !== 'none') {
      // Already on screen — advancing a slide, stepping to the next verse,
      // or switching between the two. The old text fades out first so the
      // two never cross-fade on top of each other. The card never animates.
      runAnim('fadeOut', 0.18, 220, commit);
    } else {
      commit();
    }
  }

  function hide(state) {
    const anim = state.animation || 'fade';
    const finish = () => {
      wrap.style.animation = '';
      stage.classList.add('hidden');
    };
    if (anim === 'none') { finish(); return; }
    runAnim('fadeOut', 0.45, 560, finish);
  }

  function clear() {
    wrap.style.animation = '';
    stage.classList.add('hidden');
    titleEl.textContent = '';
    bodyEl.textContent  = '';
    refEl.textContent   = '';
  }

  function handle(raw) {
    try {
      const state = normalizeState(raw);
      if (!state) return;                       // hostile, newer or unknown kind: render nothing
      switch (state.action) {
        case 'show':  show(state);  break;
        case 'hide':  hide(state);  break;
        case 'clear': clear();      break;
      }
    } catch (err) {
      onError(err);                             // a blank overlay beats a broken one on a live stream
    }
  }

  return { handle };
}
