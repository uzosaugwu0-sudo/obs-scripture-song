import { clockEndAt, isValidTimerSpec } from '../../plan/extras.js';
import { remainingMs } from '../../overlay/timer-clock.js';

const specOf = (item) => (item.mode === 'clock' ? { mode: 'clock', at: item.at } : { mode: 'duration', seconds: item.seconds });
const fullMs = (spec) => spec.seconds * 1000;

/**
 * The dock's timer clock. `loaded` is the timer you are looking at in the live
 * bar; `running` is the clock that was started at Show. They are separate on
 * purpose: loading the next plan item must never touch a clock that is on air.
 */
export function createTimerRun(now = Date.now) {
  let loaded = null;    // { spec, title }
  let running = null;   // { spec, title, timer }, timer is { endAt } or { remainingMs }

  const isPaused = () => !!running && running.spec.mode === 'duration' && typeof running.timer.endAt !== 'number';

  /** A clock time that is already behind us is sent as zero left; an old end time would be dropped by the overlay as a stale leftover. */
  function clockTimer(spec) {
    const endAt = clockEndAt(spec.at, now());
    return endAt <= now() ? { remainingMs: 0 } : { endAt };
  }
  const canControl = () => !!running && running.spec.mode === 'duration';

  /** What the timer would show right now if it went on air: the full time, or the time left until the clock time. */
  function previewTimer(spec) {
    return spec.mode === 'clock' ? clockTimer(spec) : { remainingMs: fullMs(spec) };
  }

  return {
    load(item) {
      if (!isValidTimerSpec(item)) return false;
      loaded = { spec: specOf(item), title: (item.title || '').trim() };
      return true;
    },
    loaded: () => loaded,
    previewTimer,
    /** The loaded timer goes on air: a duration starts from the full time, a clock timer follows the clock. */
    start() {
      if (!loaded) return null;
      const { spec, title } = loaded;
      const timer = spec.mode === 'clock' ? clockTimer(spec) : { endAt: now() + fullMs(spec) };
      running = { spec, title, timer };
      return timer;
    },
    running: () => running,
    canControl,
    isPaused,
    pause() {
      if (!canControl() || isPaused()) return false;
      running.timer = { remainingMs: remainingMs(running.timer, now()) };
      return true;
    },
    resume() {
      if (!canControl() || !isPaused()) return false;
      running.timer = { endAt: now() + running.timer.remainingMs };
      return true;
    },
    reset() {
      if (!canControl()) return false;
      running.timer = { endAt: now() + fullMs(running.spec) };
      return true;
    },
    remainingNow: () => (running ? remainingMs(running.timer, now()) : null),
  };
}
