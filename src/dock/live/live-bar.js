import { $ } from '../shared/util.js';

const PHASE_LABEL = { off: 'OFF', live: 'LIVE', hidden: 'HIDDEN' };
const EMPTY_PREVIEW = { has: false, text: 'Nothing loaded', sub: 'Look up a verse or pick a slide', canNav: false };
const NEEDS = {
  scripture: 'Look up a verse first.',
  songs: 'No slide text to display.',
  announcement: 'Write the announcement first.',
  timer: 'Set up the timer first.',
};
const LIVE_MSG = {
  scripture: 'Verse is live.',
  songs: 'Slide is live.',
  announcement: 'Announcement is live.',
  timer: 'Timer is running.',
};

/**
 * The pinned bar: status, a preview of what is loaded in the active tab, and
 * Show / Hide / Prev / Next. Also owns the global keyboard shortcuts.
 */
export function initLiveBar({ session, tabs, setStatus }) {
  const bar = $('live-bar'), pill = $('status-pill'), what = $('status-what'),
        previewText = $('preview-text'), previewSub = $('preview-sub'), planLine = $('plan-line'),
        btnPrev = $('btn-prev'), btnShow = $('btn-show'), btnHide = $('btn-hide'),
        btnNext = $('btn-next'), btnClear = $('btn-clear'),
        timerControls = $('timer-controls'), timerText = $('timer-live-text'),
        btnTimerPause = $('btn-timer-pause'), btnTimerReset = $('btn-timer-reset');

  const activeTab = () => tabs[session.activeTab] || null;

  function liveLabel() {
    if (session.phase !== 'live') return '';
    if (session.liveTab === 'scripture') return 'Verse';
    if (session.liveTab === 'announcement' || session.liveTab === 'timer') {
      const name = session.liveTab === 'timer' ? 'Timer' : 'Announcement';
      const title = session.liveContent ? session.liveContent.title : '';
      return title ? name + ' · ' + title : name;
    }
    const title = tabs.songs ? tabs.songs.getContent().title : '';
    return title ? 'Song · ' + title : 'Song';
  }

  function refresh() {
    const tab = activeTab();
    const p = tab ? tab.preview() : EMPTY_PREVIEW;
    bar.dataset.phase = session.phase;
    pill.textContent = PHASE_LABEL[session.phase];
    what.textContent = liveLabel();
    previewText.textContent = p.text;
    previewSub.textContent = p.sub;
    const planText = tabs.plan ? tabs.plan.summary() : null;
    planLine.textContent = planText || '';
    planLine.classList.toggle('hidden', !planText);
    const live = tabs.timer ? tabs.timer.live() : null;
    timerControls.classList.toggle('hidden', !live);
    if (live) {
      timerText.textContent = live.text + (live.paused ? ' (paused)' : '') + (live.title ? ' \u00b7 ' + live.title : '');
      btnTimerPause.textContent = live.paused ? 'Resume' : 'Pause';
      btnTimerPause.classList.toggle('hidden', !live.canControl);
      btnTimerReset.classList.toggle('hidden', !live.canControl);
    }
    btnShow.disabled = !p.has;
    btnHide.disabled = !session.isLive;
    btnPrev.disabled = !p.canNav;
    btnNext.disabled = !p.canNav;
  }

  function step(dir) {
    const tab = activeTab();
    if (tab) tab.step(dir);
  }

  btnShow.addEventListener('click', () => {
    const tab = activeTab();
    if (!tab || !tab.preview().has) {
      setStatus(NEEDS[session.activeTab] || 'Nothing to show.', 'error');
      return;
    }
    if (tab.markShown) tab.markShown();
    session.show();
    setStatus(LIVE_MSG[session.activeTab] || 'Live.', 'success');
  });
  btnHide.addEventListener('click', () => session.hide());
  btnClear.addEventListener('click', () => {
    session.clear();
    if (tabs.songs && tabs.songs.resetPosition) tabs.songs.resetPosition();
  });
  btnPrev.addEventListener('click', () => step(-1));
  btnNext.addEventListener('click', () => step(1));
  btnTimerPause.addEventListener('click', () => {
    const live = tabs.timer.live();
    if (!live) return;
    if (live.paused) tabs.timer.resume(); else tabs.timer.pause();
  });
  btnTimerReset.addEventListener('click', () => tabs.timer.reset());

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === 'Escape') btnHide.click();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'PageDown') { e.preventDefault(); if (tabs.plan) tabs.plan.nextItem(); }
    else if (e.key === 'PageUp') { e.preventDefault(); if (tabs.plan) tabs.plan.prevItem(); }
    else if (e.key === ' ') { e.preventDefault(); if (session.isLive) btnHide.click(); else btnShow.click(); }
  });

  return { refresh };
}
