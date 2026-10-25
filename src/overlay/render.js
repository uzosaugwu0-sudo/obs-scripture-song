import { DEFAULTS, normalizeState } from '../core/state.js';
import {
  THEME_BG, MIN_HEIGHT_VH, LABEL_REM,
  hexToRgba, getScale, computeBodyFontSize, cardAlpha,
} from './style-math.js';
import { splitLines } from './split-lines.js';
import { remainingMs, formatClock, isStale } from './timer-clock.js';

const KIND_CLASSES  = ['kind-verse', 'kind-song', 'kind-announcement', 'kind-timer', 'kind-lowerthird'];
const THEME_CLASSES = ['theme-frosted', 'theme-frosted-light', 'theme-pure', 'theme-sacred-light', 'theme-custom'];
const POS_CLASSES   = ['pos-bottom', 'pos-center', 'pos-top'];
const ALIGN_CLASSES = ['lt-left', 'lt-center', 'lt-right'];
const SIZE_CLASSES  = ['fs-sm', 'fs-md', 'fs-lg', 'fs-xl'];
const ANIM_CLASSES  = ['anim-rise', 'anim-wipe', 'anim-lines', 'anim-cut'];
const CARD_STATES   = ['card-in', 'card-out'];
const TEXT_STATES   = ['text-in', 'text-out'];
const SACRED_IMAGE  = 'assets/bg1.png';

// Fallback timers a little longer than the CSS durations, in case animationend never fires.
const ENTER_MS    = { rise: 560, wipe: 700, lines: 400 };
const LEAVE_MS    = { rise: 400, wipe: 460, lines: 400 };
const TEXT_OUT_MS = 240;
const TEXT_IN_MS  = 340;
const MAX_STAGGER_S  = 0.35;
const LINES_BUDGET_S = 2.4;
const TIMER_TICK_MS = 250;
const TIMER_SCALE   = 1.6;   // the digits are set a little larger than body text
const LT_NAME_SCALE = 0.9;    // lower third text sizes, as a fraction of the body size
const LT_INFO_SCALE = 0.56;
const LT_LOGO_SCALE = 1.2;    // picture height, as a multiple of the two text lines together

export function createRenderer(doc = document, onError = () => {}) {
  const stage   = doc.getElementById('stage');
  const card    = doc.getElementById('card');
  const wrap    = doc.getElementById('wrap');
  const titleEl = doc.getElementById('ov-title');
  const bodyEl  = doc.getElementById('ov-body');
  const refEl   = doc.getElementById('ov-ref');
  const logoEl  = doc.getElementById('ov-logo');

  // Bumped by every valid command. Deferred steps compare against it, so the
  // last command always wins and an interrupted animation cannot leave the
  // overlay hidden over new text or half faded.
  let epoch = 0;
  let tickHandle = null;   // the digits interval; any command cancels it

  function setClass(group, value) {
    group.forEach((c) => stage.classList.remove(c));
    stage.classList.add(value);
  }

  /** Replays a CSS animation class on el. done() runs once, and only if no newer command arrived. */
  function play(el, add, remove, fallbackMs, token, done) {
    remove.forEach((c) => el.classList.remove(c));
    void el.offsetWidth;                         // force reflow so the animation replays
    el.classList.add(add);
    let finished = false;
    let timer = null;
    const onEnd = (e) => { if (e.target === el) finish(); };
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      el.removeEventListener('animationend', onEnd);
      if (token === epoch && done) done();
    }
    timer = setTimeout(finish, fallbackMs);
    el.addEventListener('animationend', onEnd);
  }

  function stopTick() {
    if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
  }

  function paintClock(timer) {
    bodyEl.textContent = formatClock(remainingMs(timer, Date.now()));
  }

  /** Update only the digits, every TIMER_TICK_MS. A paused timer is painted once and never ticks. */
  function startTick(timer) {
    stopTick();
    paintClock(timer);
    if (typeof timer.endAt !== 'number') return;
    tickHandle = setInterval(() => {
      paintClock(timer);
      if (remainingMs(timer, Date.now()) === 0) stopTick();
    }, TIMER_TICK_MS);
  }

  function applyStyles(state) {
    const kind       = state.kind;
    const theme      = state.theme;
    const opacityPct = state.opacity !== undefined ? state.opacity : 88;
    const font       = state.font || 'Open Sans';
    const sizeClass  = 'fs-' + (state.fontSize || 'md');
    const scale      = getScale(state);
    const colors     = state.customColors || DEFAULTS.customColors;

    setClass(KIND_CLASSES,  'kind-' + kind);
    setClass(THEME_CLASSES, 'theme-' + theme);
    setClass(POS_CLASSES,   'pos-' + (kind === 'lowerthird' ? 'bottom' : (state.position || 'bottom')));
    ALIGN_CLASSES.forEach((c) => stage.classList.remove(c));
    if (kind === 'lowerthird') stage.classList.add('lt-' + state.lowerthird.align);
    setClass(SIZE_CLASSES,  sizeClass);
    setClass(ANIM_CLASSES,  'anim-' + state.animation);
    if (state.animation !== 'lines') stage.classList.remove('lines-go');

    // A background image implies a visible card, since the image is the card.
    let imageUrl = null;
    if (theme === 'sacred-light')                       imageUrl = SACRED_IMAGE;
    else if (state.bgMode === 'image' && state.bgImage) imageUrl = state.bgImage;

    const showCard = imageUrl ? true : (state.showCard !== false);
    stage.classList.toggle('no-card', !showCard);

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
      const hex = theme === 'custom' ? colors.bg : (THEME_BG[theme] || THEME_BG.frosted);
      card.style.background = hexToRgba(hex, cardAlpha(theme, opacityPct));
    } else {
      card.style.backgroundColor = 'transparent';
    }

    if (theme === 'custom') {
      const accent = colors.accent || '#a78bfa';
      const swap = kind === 'lowerthird';   // a lower third puts the name in the text colour and the info in the accent
      bodyEl.style.color  = swap ? accent : (colors.text || '#ffffff');
      titleEl.style.color = swap ? (colors.text || '#ffffff') : accent;
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

    const hideTitle = kind === 'verse' || (kind !== 'lowerthird' && state.showTitle === false) || (kind !== 'song' && !state.title);
    const hideRef   = kind !== 'verse' || state.showReference === false;
    titleEl.style.display = hideTitle ? 'none' : '';
    refEl.style.display   = hideRef   ? 'none' : '';
    stage.classList.toggle('no-title', hideTitle);
    stage.classList.toggle('no-ref',   hideRef);

    // Overlay Scale: card height and vertical padding only, so width never changes.
    card.style.minHeight     = ((MIN_HEIGHT_VH[sizeClass] || 24) * scale) + 'vh';
    card.style.paddingTop    = Math.round(28 * scale) + 'px';
    card.style.paddingBottom = Math.round(24 * scale) + 'px';
    card.style.paddingLeft   = '52px';
    card.style.paddingRight  = '52px';
    if (kind === 'lowerthird') {
      card.style.minHeight     = '';
      card.style.paddingTop    = Math.round(14 * scale) + 'px';
      card.style.paddingBottom = Math.round(14 * scale) + 'px';
      card.style.paddingLeft   = '20px';
      card.style.paddingRight  = '28px';
    }

    const labelRem = (LABEL_REM[sizeClass] || 1.10) * scale;
    titleEl.style.fontSize = labelRem + 'rem';
    refEl.style.fontSize   = labelRem + 'rem';
  }
  function scaleText(text, sizeClass, scale) {
    bodyEl.style.fontSize = computeBodyFontSize(text, sizeClass, scale) + 'px';
  }

  function fillContent(state) {
    const logo = state.kind === 'lowerthird' ? state.lowerthird.logo : null;
    if (logo) logoEl.src = logo; else logoEl.removeAttribute('src');
    stage.classList.toggle('has-logo', !!logo);
    const titled = state.kind !== 'verse';
    titleEl.textContent = titled ? (state.title || '') : '';
    refEl.textContent   = state.kind === 'verse' ? (state.reference || '') : '';
    const body = state.body || '';
    bodyEl.setAttribute('aria-label', state.kind === 'timer' ? (state.title || 'Timer') : body);

    if (state.kind === 'lowerthird') {
      const base = computeBodyFontSize('', 'fs-' + (state.fontSize || 'md'), getScale(state));
      titleEl.style.fontSize = Math.round(base * LT_NAME_SCALE) + 'px';
      bodyEl.style.fontSize  = Math.round(base * LT_INFO_SCALE) + 'px';
      bodyEl.textContent = body;
      bodyEl.style.removeProperty('--stagger');
      logoEl.style.height = Math.round(base * (LT_NAME_SCALE + LT_INFO_SCALE) * LT_LOGO_SCALE) + 'px';
      return;
    }
    if (state.kind === 'timer') {
      paintClock(state.timer);
      bodyEl.style.removeProperty('--stagger');
      bodyEl.style.fontSize = Math.round(computeBodyFontSize('', 'fs-' + (state.fontSize || 'md'), getScale(state)) * TIMER_SCALE) + 'px';
      return;
    }
    if (state.animation === 'lines') {
      const lines = splitLines(body, state.kind === 'verse' ? 'verse' : 'song');
      bodyEl.textContent = '';
      lines.forEach((text, i) => {
        const span = doc.createElement('span');
        span.className = 'ln';
        span.style.setProperty('--i', String(i));
        span.textContent = text;
        bodyEl.appendChild(span);
      });
      const stagger = lines.length > 1 ? Math.min(MAX_STAGGER_S, LINES_BUDGET_S / lines.length) : MAX_STAGGER_S;
      bodyEl.style.setProperty('--stagger', stagger + 's');
    } else {
      bodyEl.textContent = body;
      bodyEl.style.removeProperty('--stagger');
    }
    scaleText(body, 'fs-' + (state.fontSize || 'md'), getScale(state));
  }

  function restartLines() {
    stage.classList.remove('lines-go');
    void stage.offsetWidth;
    stage.classList.add('lines-go');
  }

  function show(state, token) {
    const anim       = state.animation;
    const wasVisible = !stage.classList.contains('hidden');
    const commit = () => {
      applyStyles(state);
      fillContent(state);
      stage.classList.remove('hidden');
      if (state.kind === 'timer') startTick(state.timer);
    };

    // A hide may have been in flight: put the card back before anything else.
    CARD_STATES.forEach((c) => card.classList.remove(c));
    TEXT_STATES.forEach((c) => wrap.classList.remove(c));

    if (!wasVisible) {
      commit();
      if (anim === 'cut') return;
      play(card, 'card-in', CARD_STATES, ENTER_MS[anim], token, () => card.classList.remove('card-in'));
      if (anim === 'lines') restartLines();
      return;
    }

    // Already on screen: the card stays put and only the text changes.
    if (anim === 'cut')   { commit(); return; }
    if (anim === 'lines') { commit(); restartLines(); return; }
    play(wrap, 'text-out', TEXT_STATES, TEXT_OUT_MS, token, () => {
      commit();
      play(wrap, 'text-in', TEXT_STATES, TEXT_IN_MS, token, () => wrap.classList.remove('text-in'));
    });
  }

  function hide(state, token) {
    if (stage.classList.contains('hidden')) return;
    const anim = state.animation;
    const finish = () => {
      stopTick();
      CARD_STATES.forEach((c) => card.classList.remove(c));
      TEXT_STATES.forEach((c) => wrap.classList.remove(c));
      stage.classList.add('hidden');
    };
    if (anim === 'cut') { finish(); return; }
    setClass(ANIM_CLASSES, 'anim-' + anim);
    TEXT_STATES.forEach((c) => wrap.classList.remove(c));
    play(card, 'card-out', CARD_STATES, LEAVE_MS[anim], token, finish);
  }

  function clear() {
    stopTick();
    CARD_STATES.forEach((c) => card.classList.remove(c));
    TEXT_STATES.forEach((c) => wrap.classList.remove(c));
    stage.classList.remove('lines-go');
    stage.classList.add('hidden');
    titleEl.textContent = '';
    bodyEl.textContent  = '';
    refEl.textContent   = '';
  }

  function handle(raw) {
    try {
      const state = normalizeState(raw);
      if (!state) return;                       // hostile, newer or unknown kind: render nothing
      if (state.action === 'show' && state.kind === 'timer' && isStale(state.timer, Date.now())) return;   // a restored leftover
      epoch += 1;
      stopTick();
      const token = epoch;
      switch (state.action) {
        case 'show':  show(state, token);  break;
        case 'hide':  hide(state, token);  break;
        case 'clear': clear();             break;
      }
    } catch (err) {
      onError(err);                             // a blank overlay beats a broken one on a live stream
    }
  }

  return { handle };
}
