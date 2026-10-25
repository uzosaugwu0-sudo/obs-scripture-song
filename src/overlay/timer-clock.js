export const STALE_AFTER_MS = 3600000;   // a restored timer this long past its end renders nothing

/** Milliseconds left: against the clock for a running timer, the frozen value for a paused one. Never negative. */
export function remainingMs(timer, now) {
  if (typeof timer.endAt === 'number') return Math.max(0, timer.endAt - now);
  return Math.max(0, timer.remainingMs || 0);
}

/** M:SS, or H:MM:SS from one hour up. Rounds up, so 0:00 only appears at real zero. */
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : minutes + ':' + pad(seconds);
}

export const isRunning = (timer) => typeof timer.endAt === 'number';

/** A running timer that ended more than STALE_AFTER_MS ago: a leftover from a restore, not worth showing. */
export function isStale(timer, now) {
  return isRunning(timer) && now - timer.endAt > STALE_AFTER_MS;
}
