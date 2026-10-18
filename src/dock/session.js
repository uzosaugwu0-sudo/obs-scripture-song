const TABS = ['scripture', 'songs'];

/**
 * What the operator is doing: which tab they are on, what is on screen, and
 * the rule that style changes keep re-sending the live content even after
 * they have switched tabs to prepare the next thing. This is the one piece
 * of intentionally mutable dock state.
 */
export function createSession({ transport, readSettings, providers, onChange = () => {} }) {
  const s = { activeTab: 'scripture', isLive: false, liveTab: null, phase: 'off' };

  const snapshot = () => ({ activeTab: s.activeTab, isLive: s.isLive, liveTab: s.liveTab, phase: s.phase });
  const notify   = () => onChange(snapshot());

  function content(tab) {
    return tab === 'scripture'
      ? { kind: 'verse', title: '', ...providers.scripture() }
      : { kind: 'song', reference: '', ...providers.songs() };
  }

  function buildState(action, { forShow = false } = {}) {
    const tab = (action === 'show' && s.isLive && s.liveTab && !forShow) ? s.liveTab : s.activeTab;
    return { ...readSettings(), action, visible: action === 'show', ...content(tab) };
  }

  return {
    get activeTab() { return s.activeTab; },
    get isLive()    { return s.isLive; },
    get liveTab()   { return s.liveTab; },
    get phase()     { return s.phase; },

    buildState,

    setTab(tab) {
      if (!TABS.includes(tab)) return;
      s.activeTab = tab;
      notify();
    },
    show() {
      transport.send(buildState('show', { forShow: true }));
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
      s.phase = 'off';
      notify();
    },
    resendIfLive() {
      if (s.isLive) transport.send(buildState('show'));
    },
  };
}
