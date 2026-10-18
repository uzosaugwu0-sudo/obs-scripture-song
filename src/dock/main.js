import { $ } from './util.js';
import { createStatus } from './status.js';
import { createSession } from './session.js';
import { createDiagnostics } from './diagnostics.js';
import { createBrowserTransport } from '../transport/index.js';
import { createScriptureApi } from '../scripture/api.js';
import { createOfflineProvider } from '../scripture/offline.js';
import { createLibrary } from '../songs/library.js';
import { createLocalSongStore } from '../songs/local-store.js';
import { openKv, idbCache } from '../core/idb.js';
import { loadSettings } from '../core/settings.js';
import { initDisplaySettings } from './display-settings.js';
import { initScriptureTab } from './scripture-tab.js';
import { initSongsTab } from './songs-tab.js';
import { initLibraryUI } from './library-ui.js';
import { initStreamControls } from './stream-controls.js';

const diagnostics = createDiagnostics();
const report = (context) => (err) => diagnostics.log(context, err);

function wireDiagnosticsPanel() {
  const list = $('diag-list'), count = $('diag-count');
  diagnostics.subscribe((entries) => {
    count.textContent = entries.length ? `(${entries.length})` : '';
    list.replaceChildren(...entries.slice().reverse().map((e) => {
      const li = document.createElement('li');
      li.textContent = `${e.at.slice(11, 19)}  ${e.context}: ${e.message}`;
      return li;
    }));
  });
  $('diag-clear').addEventListener('click', () => diagnostics.clear());
}

(async () => {
  try {
    wireDiagnosticsPanel();

    const status = createStatus({
      statusBar: $('status-bar'), statusDot: $('status-dot'),
      statusLabel: $('status-label'), liveKind: $('live-kind'),
    });

    const transport = createBrowserTransport('dock', report('transport'));
    const scripture = createScriptureApi({
      cache: idbCache(openKv('obs-stage-cache'), report('cache')),
      offline: createOfflineProvider(),
    });
    const library = createLibrary({
      local: createLocalSongStore(window.localStorage, report('songs')),
      onError: report('library'),
    });

    let scriptureTab = null;
    let songsTab = null;
    let controls = null;
    let display = null;

    const session = createSession({
      transport,
      readSettings: () => display.readSettings(),
      providers: {
        scripture: () => scriptureTab.getContent(),
        songs: () => songsTab.getContent(),
      },
      onChange: (snap) => {
        status.setDotState(snap.phase, snap.liveTab);
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === snap.activeTab));
        $('panel-scripture').classList.toggle('hidden', snap.activeTab !== 'scripture');
        $('panel-songs').classList.toggle('hidden', snap.activeTab !== 'songs');
        controls?.refresh();
      },
    });

    display = initDisplaySettings({
      session, setStatus: status.setStatus, onError: report('settings'),
      applyScriptureSettings: (s) => {
        scriptureTab.setLanguage(s.language);
        scriptureTab.buildTranslationSelect(s.translation);
        scriptureTab.setAutoShow(s.autoShow);
      },
    });
    scriptureTab = initScriptureTab({
      session, scripture, setStatus: status.setStatus,
      saveCurrentSettings: () => display.saveCurrentSettings(),
      refresh: () => controls.refresh(),
    });
    songsTab = initSongsTab({
      session, library, setStatus: status.setStatus,
      refresh: () => controls.refresh(), report: report('songs'),
    });
    controls = initStreamControls({ session, scriptureTab, songsTab, setStatus: status.setStatus });

    display.applySettings(loadSettings({ onError: report('settings') }));

    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => session.setTab(b.dataset.tab)));
    transport.start();
    session.setTab('scripture');

    const libraryUi = initLibraryUI({
      library, kv: openKv('obs-stage-library'), setStatus: status.setStatus,
      onChange: () => songsTab.refreshList(), report: report('library'),
    });
    await libraryUi.restore();
  } catch (err) {
    diagnostics.log('dock init', err);
    console.error('[dock] init failed:', err);
  }
})();
