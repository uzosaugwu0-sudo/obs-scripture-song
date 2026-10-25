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
export function initExtrasTab({
  session, refresh, now = Date.now, startTicker = true, logoStore = null, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
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

  // ── Lower third ──────────────────────────────────────────────────────────
  let lowerThird = { name: '', info: '', align: 'left', logo: null, hideAfter: null };
  let logoData = null;                    // the picture as a data URL, once it has been read
  let logoPending = Promise.resolve();    // resolves when the picture read for the loaded item is done
  let hideToken = 0;                      // identifies the Show that armed the automatic hide
  let hideHandle = null;

  const lowerThirdTab = {
    load(item) {
      const wanted = item.logo || null;
      lowerThird = { name: (item.name || '').trim(), info: (item.info || '').trim(), align: item.align || 'left', logo: wanted, hideAfter: item.hideAfter || null };
      logoData = null;
      logoPending = wanted && logoStore
        ? logoStore.read(wanted).catch(() => null).then((data) => { if (lowerThird.logo === wanted) logoData = data; refresh(); })
        : Promise.resolve();
      refresh();
      return lowerThird.name.length > 0 || lowerThird.info.length > 0;
    },
    /** Show waits for this, so a lower third never goes on air before its picture has been read. */
    ready: () => logoPending,
    getContent: () => ({ title: lowerThird.name, body: lowerThird.info, lowerthird: { align: lowerThird.align, logo: logoData } }),
    preview() {
      const text = lowerThird.name || lowerThird.info;
      if (!text) return { ...NOTHING, sub: 'Lower third' };
      return { has: true, text, sub: 'Lower third' + (lowerThird.name && lowerThird.info ? ' · ' + lowerThird.info : ''), canNav: false };
    },
    /** Show arms the automatic hide. It only fires for this Show, and only while this lower third is still on air. */
    markShown() {
      hideToken += 1;
      const mine = hideToken;
      if (hideHandle !== null) { clearTimer(hideHandle); hideHandle = null; }
      if (!lowerThird.hideAfter) return;
      hideHandle = setTimer(() => {
        hideHandle = null;
        if (mine === hideToken && session.isLive && session.liveTab === 'lowerthird') session.hide();
      }, lowerThird.hideAfter * 1000);
    },
    step() {},
  };

  // Display only: the dock's own digits follow the clock once a second. The overlay counts by itself.
  if (startTicker) {
    setInterval(() => {
      if (session.activeTab === 'timer' || session.liveTab === 'timer') refresh();
    }, DISPLAY_TICK_MS);
  }

  return { announcement: announcementTab, timer: timerTab, lowerthird: lowerThirdTab };
}
