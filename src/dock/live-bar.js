import { $ } from './util.js';

const PHASE_LABEL = { off: 'OFF', live: 'LIVE', hidden: 'HIDDEN' };
const EMPTY_PREVIEW = { has: false, text: 'Nothing loaded', sub: 'Look up a verse or pick a slide', canNav: false };

/**
 * The pinned bar: status, a preview of what is loaded in the active tab, and
 * Show / Hide / Prev / Next. Also owns the global keyboard shortcuts.
 */
export function initLiveBar({ session, tabs, setStatus }) {
  const bar = $('live-bar'), pill = $('status-pill'), what = $('status-what'),
        previewText = $('preview-text'), previewSub = $('preview-sub'),
        btnPrev = $('btn-prev'), btnShow = $('btn-show'), btnHide = $('btn-hide'),
        btnNext = $('btn-next'), btnClear = $('btn-clear');

  const activeTab = () => tabs[session.activeTab] || null;

  function liveLabel() {
    if (session.phase !== 'live') return '';
    if (session.liveTab === 'scripture') return 'Verse';
    const title = tabs.songs ? tabs.songs.getContent().title : '';
    return title ? 'Song \u00b7 ' + title : 'Song';
  }

  function refresh() {
    const tab = activeTab();
    const p = tab ? tab.preview() : EMPTY_PREVIEW;
    bar.dataset.phase = session.phase;
    pill.textContent = PHASE_LABEL[session.phase];
    what.textContent = liveLabel();
    previewText.textContent = p.text;
    previewSub.textContent = p.sub;
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
      setStatus(session.activeTab === 'scripture' ? 'Look up a verse first.' : 'No slide text to display.', 'error');
      return;
    }
    if (tab.markShown) tab.markShown();
    session.show();
    setStatus(session.activeTab === 'scripture' ? 'Verse is live.' : 'Slide is live.', 'success');
  });
  btnHide.addEventListener('click', () => session.hide());
  btnClear.addEventListener('click', () => {
    session.clear();
    if (tabs.songs && tabs.songs.resetPosition) tabs.songs.resetPosition();
  });
  btnPrev.addEventListener('click', () => step(-1));
  btnNext.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === 'Escape') btnHide.click();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') { e.preventDefault(); if (session.isLive) btnHide.click(); else btnShow.click(); }
  });

  return { refresh };
}
