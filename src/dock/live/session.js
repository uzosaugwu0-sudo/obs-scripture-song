// Tab name to the kind of thing it puts on screen.
const KIND_OF = { scripture: 'verse', songs: 'song', announcement: 'announcement', timer: 'timer' };
const TABS = Object.keys(KIND_OF);

/**
 * What the operator is doing: which tab they are on, what is on screen, and
 * the rule that style changes keep re-sending the live content even after
 * they have switched tabs to prepare the next thing. This is the one piece
 * of intentionally mutable dock state.
 */
export function createSession({ transport, readSettings, providers, onChange = () => {} }) {
  const s = { activeTab: 'scripture', isLive: false, liveTab: null, phase: 'off', liveContent: null };

  const snapshot = () => ({ activeTab: s.activeTab, isLive: s.isLive, liveTab: s.liveTab, phase: s.phase });
  const notify   = () => onChange(snapshot());

  function content(tab) {
    const provided = providers[tab] ? providers[tab]() : {};
    return { kind: KIND_OF[tab], title: '', reference: '', body: '', ...provided };
  }

  function buildState(action, { forShow = false, fresh = false } = {}) {
    const live = action === 'show' && s.isLive && s.liveTab && !forShow;
    // A restyle re-sends what is on air; loading the next plan item must not leak onto the screen.
    if (live && !fresh && s.liveContent) return { ...readSettings(), action, visible: true, ...s.liveContent };
    const tab = live ? s.liveTab : s.activeTab;
    return { ...readSettings(), action, visible: action === 'show', ...content(tab) };
  }

  return {
    get activeTab() { return s.activeTab; },
    get isLive()    { return s.isLive; },
    get liveTab()   { return s.liveTab; },
    get phase()     { return s.phase; },
    get liveContent() { return s.liveContent; },

    buildState,

    setTab(tab) {
      if (!TABS.includes(tab)) return;
      s.activeTab = tab;
      notify();
    },
    show() {
      const state = buildState('show', { forShow: true });
      transport.send(state);
      s.liveContent = { kind: state.kind, title: state.title, reference: state.reference, body: state.body, timer: state.timer };
      s.liveTab = s.activeTab;
      s.isLive = true;
      s.phase = 'live';
      notify();
    },
    hide() {
      transport.send(buildState('hide'));
      s.isLive = false;
      s.phase = 'hidden';
      notify();
    },
    clear() {
      transport.send({ action: 'clear', visible: false });
      s.isLive = false;
      s.liveTab = null;
      s.liveContent = null;
      s.phase = 'off';
      notify();
    },
    /** Re-send what is on air with the current style. fresh: true re-reads the content too (an edit to the live slide). */
    resendIfLive({ fresh = false } = {}) {
      if (s.isLive) transport.send(buildState('show', { fresh }));
    },
    /** Change part of what is on air (a paused or reset timer) and send it. Does nothing unless something is live. */
    updateLive(patch) {
      if (!s.isLive || !s.liveContent) return;
      s.liveContent = { ...s.liveContent, ...patch };
      transport.send({ ...readSettings(), action: 'show', visible: true, ...s.liveContent });
      notify();
    },
  };
}
