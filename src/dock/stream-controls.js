import { $ } from './util.js';

export function initStreamControls({ session, scriptureTab, songsTab, setStatus }) {
  const previewLines = $('preview-lines'), btnPrev = $('btn-prev'), btnShow = $('btn-show'),
        btnHide = $('btn-hide'), btnNext = $('btn-next'), btnClear = $('btn-clear');

  /** Enable/disable the shared stream buttons for whatever tab is showing. */
  function refresh() {
    if (session.activeTab === 'scripture') {
      const has = scriptureTab.hasText();
      const content = scriptureTab.getContent();
      btnShow.disabled = !has;
      btnHide.disabled = !session.isLive;
      btnPrev.disabled = !scriptureTab.plainRef();
      btnNext.disabled = !scriptureTab.plainRef();
      previewLines.textContent = has
        ? content.body + (content.reference ? '\n— ' + content.reference : '')
        : 'Look up a verse to preview…';
    } else if (songsTab) {
      const { lines, canNav } = songsTab.currentSlide();
      btnShow.disabled = !lines;
      btnHide.disabled = !session.isLive;
      btnPrev.disabled = !canNav;
      btnNext.disabled = !canNav;
      previewLines.textContent = lines || 'Pick a slide to preview…';
    }
  }

  function navigate(dir) {
    if (session.activeTab === 'scripture') scriptureTab.step(dir);
    else if (songsTab) songsTab.navigate(dir);
  }

  btnShow.addEventListener('click', () => {
    if (session.activeTab === 'scripture') {
      if (!scriptureTab.hasText()) { setStatus('Look up a verse first.', 'error'); return; }
    } else {
      if (!songsTab || !songsTab.currentSlide().lines) { setStatus('No slide text to display.', 'error'); return; }
      songsTab.markShown();
    }
    session.show();
    setStatus(session.activeTab === 'scripture' ? 'Verse is live.' : 'Slide is live.', 'success');
  });

  btnHide.addEventListener('click', () => session.hide());

  btnClear.addEventListener('click', () => {
    session.clear();
    if (songsTab) songsTab.resetPosition();
  });

  btnPrev.addEventListener('click', () => navigate(-1));
  btnNext.addEventListener('click', () => navigate(1));

  document.addEventListener('keydown', (e) => {
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (inInput) return;
    if (e.key === 'Escape') btnHide.click();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
    else if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navigate(-1); }
    else if (e.key === ' ') { e.preventDefault(); if (session.isLive) btnHide.click(); else btnShow.click(); }
  });

  return { refresh };
}
