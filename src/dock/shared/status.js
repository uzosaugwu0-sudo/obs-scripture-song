/** The toast-style status line at the bottom of the dock. */
export function createStatus({ statusBar }) {
  function setStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className = type ? 'status-bar is-' + type : 'status-bar';
    if (msg) setTimeout(() => {
      if (statusBar.textContent === msg) { statusBar.textContent = ''; statusBar.className = 'status-bar'; }
    }, 3500);
  }
  return { setStatus };
}
