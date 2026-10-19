import { $ } from './util.js';
import { createStatus } from './status.js';
import { createSession } from './session.js';
import { createDiagnostics } from './diagnostics.js';
import { createBrowserTransport } from '../transport/index.js';
import { createSettingsStore } from './settings-store.js';
import { initLiveBar } from './live-bar.js';
import { createScriptureApi } from '../scripture/api.js';
import { createOfflineProvider } from '../scripture/offline.js';
import { openKv, idbCache } from '../core/idb.js';
import { initScriptureTab } from './scripture-tab.js';
import { createLibrary } from '../songs/library.js';
import { createLocalSongStore } from '../songs/local-store.js';
import { initSongsTab } from './songs-tab.js';
import { initImportPanel } from './import-panel.js';
import { initLibraryTools } from './library-tools.js';
import { initStyleTab } from './style-tab.js';

const diagnostics = createDiagnostics();
const report = (context) => (err) => diagnostics.log(context, err);

const EMPTY_SCRIPTURE = { body: '', reference: '' };
const EMPTY_SONG = { title: '', body: '' };
const VIEWS = ['scripture', 'songs', 'style'];

function wireDiagnosticsPanel() {
  const list = $('diag-list'), count = $('diag-count');
  diagnostics.subscribe((entries) => {
    count.textContent = entries.length ? '(' + entries.length + ')' : '';
    list.replaceChildren(...entries.slice().reverse().map((entry) => {
      const li = document.createElement('li');
      li.textContent = entry.at.slice(11, 19) + '  ' + entry.context + ': ' + entry.message;
      return li;
    }));
  });
  $('diag-clear').addEventListener('click', () => diagnostics.clear());
}

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
    const scripture = createScriptureApi({
      cache: idbCache(openKv('obs-stage-cache'), report('cache')),
      offline: createOfflineProvider(),
    });
    tabs.scripture = initScriptureTab({
      session, scripture, store, setStatus: status.setStatus, refresh: () => liveBar.refresh(),
    });
    let libraryTools = null;
    const library = createLibrary({
      local: createLocalSongStore(window.localStorage, report('songs')),
      onModeChange: () => { if (libraryTools) libraryTools.render(); },
      onError: report('library'),
    });
    tabs.songs = initSongsTab({
      session, library, setStatus: status.setStatus, refresh: () => liveBar.refresh(),
    });
    initImportPanel({
      library, setStatus: status.setStatus, report: report('songs'), onImported: () => tabs.songs.refreshList(),
    });
    libraryTools = initLibraryTools({
      library, kv: openKv('obs-stage-library'), setStatus: status.setStatus,
      report: report('library'), onChanged: () => tabs.songs.refreshList(),
    });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.tab)));

    wireDiagnosticsPanel();
    initStyleTab({ session, store, setStatus: status.setStatus, report: report('settings') });
    transport.start();
    showView('scripture');
    await libraryTools.restore();
  } catch (err) {
    diagnostics.log('dock init', err);
    console.error('[dock] init failed:', err);
  }
})();
