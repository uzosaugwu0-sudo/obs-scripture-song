import { createTimerRun } from './timer-run.js';
import { formatClock, remainingMs } from '../../overlay/timer-clock.js';
import { describeTimerSpec } from '../../plan/extras.js';

const DISPLAY_TICK_MS = 1000;
const NOTHING = { has: false, text: 'Nothing loaded', canNav: false };

/**
 * The announcement and timer "tabs": they have no panel of their own (the Plan
 * tab's editor and rows load them), but they register in the tabs registry so
 * the live bar can preview and Show them like a song or a verse.
 */
export function initExtrasTab({ session, refresh, now = Date.now, startTicker = true }) {
  const run = createTimerRun(now);
  let announcement = { title: '', body: '' };

  const announcementTab = {
    load(item) {
      announcement = { title: (item.title || '').trim(), body: (item.body || '').trim() };
      refresh();
      return announcement.body.length > 0;
    },
    getContent: () => ({ ...announcement }),
    preview() {
      if (!announcement.body) return { ...NOTHING, sub: 'Announcement' };
      return {
        has: true,
        text: announcement.body,
        sub: announcement.title ? 'Announcement · ' + announcement.title : 'Announcement',
        canNav: false,
      };
    },
    step() {},
  };

  function timerContent() {
    const loaded = run.loaded();
    if (!loaded) return { title: '', body: '', timer: { remainingMs: 0 } };
    const running = run.running();
    const timer = running && running.spec === loaded.spec ? running.timer : run.previewTimer(loaded.spec);
    return { title: loaded.title, body: '', timer };
  }

  const isLiveTimer = () => session.isLive && session.liveTab === 'timer' && !!run.running();

  function pushLive() {
    session.updateLive({ timer: run.running().timer });
    refresh();
  }

  const timerTab = {
    load(item) {
      const ok = run.load(item);
      refresh();
      return ok;
    },
    getContent: timerContent,
    preview() {
      const loaded = run.loaded();
      if (!loaded) return { ...NOTHING, sub: 'Timer' };
      const { timer } = timerContent();
      return {
        has: true,
        text: formatClock(remainingMs(timer, now())),
        sub: 'Timer · ' + (loaded.title || describeTimerSpec(loaded.spec)),
        canNav: false,
      };
    },
    /** Show starts the loaded timer (a duration from its full time; pressing Show again restarts it). */
    markShown() { run.start(); },
    step() {},
    /** The clock that is on air, for the live bar's controls, or null. */
    live() {
      if (!isLiveTimer()) return null;
      const running = run.running();
      return { text: formatClock(run.remainingNow()), title: running.title, paused: run.isPaused(), canControl: run.canControl() };
    },
    pause()  { if (isLiveTimer() && run.pause())  pushLive(); },
    resume() { if (isLiveTimer() && run.resume()) pushLive(); },
    reset()  { if (isLiveTimer() && run.reset())  pushLive(); },
  };

  // Display only: the dock's own digits follow the clock once a second. The overlay counts by itself.
  if (startTicker) {
    setInterval(() => {
      if (session.activeTab === 'timer' || session.liveTab === 'timer') refresh();
    }, DISPLAY_TICK_MS);
  }

  return { announcement: announcementTab, timer: timerTab };
}
