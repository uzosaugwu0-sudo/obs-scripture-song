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
