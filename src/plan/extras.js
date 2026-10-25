import { formatClock } from '../overlay/timer-clock.js';
import { isValidLogoName } from './logos.js';
import { isLogoDataUrl } from '../core/state.js';

export const MAX_TIMER_SECONDS = 359999;   // 99:59:59

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidClockTime = (at) => typeof at === 'string' && CLOCK_TIME.test(at);

export function isValidTimerSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.mode === 'duration') {
    return Number.isInteger(spec.seconds) && spec.seconds >= 1 && spec.seconds <= MAX_TIMER_SECONDS;
  }
  if (spec.mode === 'clock') return isValidClockTime(spec.at);
  return false;
}

/** Epoch ms of today's HH:MM in local time. If that time has already passed it stays in the past: the timer shows 0:00. */
export function clockEndAt(at, now) {
  const [hours, minutes] = at.split(':').map(Number);
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
}

export function describeTimerSpec(spec) {
  return spec.mode === 'clock' ? 'at ' + spec.at : formatClock(spec.seconds * 1000);
}

/** "9:05", "0930" and "930" all become a zero-padded HH:MM; anything that is not a real time is null. */
export function parseClockInput(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw) || /^(\d{1,2})(\d{2})$/.exec(raw);
  if (!match) return null;
  const at = match[1].padStart(2, '0') + ':' + match[2];
  return isValidClockTime(at) ? at : null;
}

const WHOLE_NUMBER = /^\d+$/;

/** Read the announcement editor. { ok: true, draft } or { ok: false, hint }. */
export function announcementFromInputs({ title = '', body = '' }) {
  if (!body.trim()) return { ok: false, hint: 'Write the text to show.' };
  return { ok: true, draft: { type: 'announcement', title: title.trim(), body: body.trim() } };
}

/** Read the timer editor. minutes, seconds and clock are the raw field texts. */
export function timerFromInputs({ mode, title = '', minutes = '', seconds = '', clock = '' }) {
  const label = title.trim();
  if (mode === 'clock') {
    const at = parseClockInput(clock);
    return at
      ? { ok: true, draft: { type: 'timer', mode: 'clock', at, title: label } }
      : { ok: false, hint: 'Enter a 24-hour time such as 10:30.' };
  }
  const m = minutes.trim() || '0';
  const s = seconds.trim() || '0';
  if (!WHOLE_NUMBER.test(m) || !WHOLE_NUMBER.test(s)) return { ok: false, hint: 'Use whole numbers for minutes and seconds.' };
  if (Number(s) > 59) return { ok: false, hint: 'Seconds go up to 59.' };
  const total = Number(m) * 60 + Number(s);
  if (total < 1) return { ok: false, hint: 'Enter a time of at least 1 second.' };
  if (total > MAX_TIMER_SECONDS) return { ok: false, hint: 'The longest timer is 99:59:59.' };
  return { ok: true, draft: { type: 'timer', mode: 'duration', seconds: total, title: label } };
}

export const MAX_HIDE_AFTER = 3600;   // seconds
export const MAX_ITEM_LOGO_DATA = 150000;   // a picture kept inside the item stays small, since it is saved with the plan
const usableLogoData = (value) => isLogoDataUrl(value) && value.length <= MAX_ITEM_LOGO_DATA;
const ALIGNS = ['left', 'center', 'right'];
const textOrEmpty = (v) => (typeof v === 'string' ? v.trim() : '');

/** Valid when some text is present (strings only), the placement is known, the picture is a plain .png name, and hideAfter is in range. */
export function isValidLowerThird(item) {
  if (!item || typeof item !== 'object') return false;
  if ((item.name !== undefined && typeof item.name !== 'string') || (item.info !== undefined && typeof item.info !== 'string')) return false;
  if (!textOrEmpty(item.name) && !textOrEmpty(item.info)) return false;
  if (item.align !== undefined && !ALIGNS.includes(item.align)) return false;
  if (item.logo != null && !isValidLogoName(item.logo)) return false;
  if (item.logoData != null && !usableLogoData(item.logoData)) return false;
  if (item.hideAfter != null && !(Number.isInteger(item.hideAfter) && item.hideAfter >= 1 && item.hideAfter <= MAX_HIDE_AFTER)) return false;
  return true;
}

export const describeLowerThird = (item) => (item.hideAfter ? 'hides after ' + item.hideAfter + 's' : 'stays');

/** Read the lower third editor. hideAfter is the raw field text; blank means it stays until Hide. */
export function lowerThirdFromInputs({ name = '', info = '', align = 'left', logo = '', logoData = '', hideAfter = '' }) {
  const n = name.trim();
  const i = info.trim();
  if (!n && !i) return { ok: false, hint: 'Enter a name or some info.' };
  const raw = hideAfter.trim();
  let seconds = null;
  if (raw !== '') {
    seconds = WHOLE_NUMBER.test(raw) ? Number(raw) : NaN;
    if (!(seconds >= 1 && seconds <= MAX_HIDE_AFTER)) return { ok: false, hint: 'Hide after must be 1 to 3600 seconds.' };
  }
  if (logoData && !usableLogoData(logoData)) return { ok: false, hint: 'That picture could not be used. Choose it again.' };
  return {
    ok: true,
    draft: { type: 'lowerthird', name: n, info: i, align: ALIGNS.includes(align) ? align : 'left', logo: logoData ? null : (logo || null), logoData: logoData || null, hideAfter: seconds },
  };
}
