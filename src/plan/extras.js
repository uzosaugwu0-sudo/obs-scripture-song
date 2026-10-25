import { formatClock } from '../overlay/timer-clock.js';

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
