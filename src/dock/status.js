export function createStatus({ statusBar, statusDot, statusLabel, liveKind }) {
  function setStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className   = type ? 'is-' + type : '';
    if (msg) setTimeout(() => {
      if (statusBar.textContent === msg) { statusBar.textContent = ''; statusBar.className = ''; }
    }, 3500);
  }

  function setDotState(phase, liveTab) {
    statusDot.className = 'status-dot' +
      (phase === 'live' ? ' live' : phase === 'hidden' ? ' hidden-state' : '');
    statusLabel.textContent = phase === 'live' ? 'Live' : phase === 'hidden' ? 'Hidden' : 'Off';
    if (phase === 'live' && liveTab) {
      liveKind.className   = 'live-kind ' + (liveTab === 'scripture' ? 'is-verse' : 'is-song');
      liveKind.textContent = liveTab === 'scripture' ? 'Verse' : 'Song';
    } else {
      liveKind.className = 'live-kind hidden';
    }
  }

  return { setStatus, setDotState };
}
