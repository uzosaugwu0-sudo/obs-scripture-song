import { $ } from './util.js';
import { createStatus } from './status.js';
import { createSession } from './session.js';
import { createDiagnostics } from './diagnostics.js';
import { createBrowserTransport } from '../transport/index.js';
import { createSettingsStore } from './settings-store.js';
import { initLiveBar } from './live-bar.js';

const diagnostics = createDiagnostics();
const report = (context) => (err) => diagnostics.log(context, err);

const EMPTY_SCRIPTURE = { body: '', reference: '' };
const EMPTY_SONG = { title: '', body: '' };
const VIEWS = ['scripture', 'songs', 'style'];

(async () => {
  try {
    const status = createStatus({ statusBar: $('status-bar') });
    const transport = createBrowserTransport('dock', report('transport'));
    const store = createSettingsStore({ storage: window.localStorage, onError: report('settings') });

    // Each tab registers itself here when it is initialised (later tasks).
    const tabs = {};
    let liveBar = null;

    const session = createSession({
      transport,
      readSettings: () => store.styleState(),
      providers: {
        scripture: () => (tabs.scripture ? tabs.scripture.getContent() : EMPTY_SCRIPTURE),
        songs: () => (tabs.songs ? tabs.songs.getContent() : EMPTY_SONG),
      },
      onChange: () => { if (liveBar) liveBar.refresh(); },
    });

    /** Which panel is showing. The Style view leaves session.activeTab alone. */
    function showView(name) {
      VIEWS.forEach((view) => {
        const on = view === name;
        $('panel-' + view).classList.toggle('hidden', !on);
        const tab = $('tab-' + view);
        tab.classList.toggle('on', on);
        tab.setAttribute('aria-selected', String(on));
      });
      if (name !== 'style') session.setTab(name);
      if (liveBar) liveBar.refresh();
    }

    liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.tab)));

    transport.start();
    showView('scripture');
  } catch (err) {
    diagnostics.log('dock init', err);
    console.error('[dock] init failed:', err);
  }
})();
