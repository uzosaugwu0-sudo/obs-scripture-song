import { $ } from './shared/util.js';
import { createStatus } from './shared/status.js';
import { createSession } from './live/session.js';
import { createDiagnostics } from './shared/diagnostics.js';
import { createBrowserTransport } from '../transport/index.js';
import { createSettingsStore } from './style/settings-store.js';
import { initLiveBar } from './live/live-bar.js';
import { createScriptureApi } from '../scripture/api.js';
import { createOfflineProvider } from '../scripture/offline.js';
import { openKv, idbCache } from '../core/idb.js';
import { initScriptureTab } from './scripture/scripture-tab.js';
import { createLibrary } from '../songs/library.js';
import { createLocalSongStore } from '../songs/local-store.js';
import { initSongsTab } from './songs/songs-tab.js';
import { initImportPanel } from './songs/import-panel.js';
import { initLibraryTools } from './songs/library-tools.js';
import { initStyleTab } from './style/style-tab.js';
import { createPlanStore } from '../plan/store.js';
import { createLocalPlanStore } from '../plan/local-store.js';
import { initPlanTab } from './plan/plan-tab.js';
import { initExtrasTab } from './plan/extras-tab.js';
import { createLogoStore } from './plan/logo-store.js';
import { createPictureFolder } from './plan/picture-folder.js';

const diagnostics = createDiagnostics();
const report = (context) => (err) => diagnostics.log(context, err);

const EMPTY_SCRIPTURE = { body: '', reference: '' };
const EMPTY_SONG = { title: '', body: '' };
const VIEWS = ['plan', 'scripture', 'songs', 'style'];

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

    // Each tab registers itself here when it is initialised.
    const tabs = {};
    let liveBar = null;

    const session = createSession({
      transport,
      readSettings: () => store.styleState(),
      providers: {
        scripture: () => (tabs.scripture ? tabs.scripture.getContent() : EMPTY_SCRIPTURE),
        songs: () => (tabs.songs ? tabs.songs.getContent() : EMPTY_SONG),
        announcement: () => (tabs.announcement ? tabs.announcement.getContent() : EMPTY_SONG),
        timer: () => (tabs.timer ? tabs.timer.getContent() : { ...EMPTY_SONG, timer: { remainingMs: 0 } }),
        lowerthird: () => (tabs.lowerthird ? tabs.lowerthird.getContent() : { ...EMPTY_SONG, lowerthird: { align: 'left', logo: null } }),
      },
      onChange: () => {
        if (liveBar) liveBar.refresh();
        if (tabs.plan) tabs.plan.render();
      },
    });

    /** Which panel is showing. Only Scripture and Songs change session.activeTab. */
    function showView(name) {
      VIEWS.forEach((view) => {
        const on = view === name;
        $('panel-' + view).classList.toggle('hidden', !on);
        const tab = $('tab-' + view);
        tab.classList.toggle('on', on);
        tab.setAttribute('aria-selected', String(on));
      });
      if (name === 'scripture' || name === 'songs') session.setTab(name);
      if (tabs.plan) tabs.plan.onView(name);
      if (liveBar) liveBar.refresh();
    }

    liveBar = initLiveBar({ session, tabs, setStatus: status.setStatus });
    const logoStore = createLogoStore({ onError: report('logos') });
    const pictureFolder = createPictureFolder({
      logoStore, kv: openKv('obs-stage-pictures'), report: report('pictures'),
      onChange: () => { if (tabs.plan) tabs.plan.render(); },
    });
    const extras = initExtrasTab({ session, refresh: () => liveBar.refresh(), logoStore });
    tabs.announcement = extras.announcement;
    tabs.timer = extras.timer;
    tabs.lowerthird = extras.lowerthird;
    const scripture = createScriptureApi({
      cache: idbCache(openKv('obs-stage-cache'), report('cache')),
      offline: createOfflineProvider(),
    });
    tabs.scripture = initScriptureTab({
      session, scripture, store, setStatus: status.setStatus, refresh: () => liveBar.refresh(),
      addToPlan: (ref, translation, keepOpen) => tabs.plan.addReading(ref, translation, keepOpen),
      isPicking: () => !!tabs.plan && tabs.plan.isPicking(),
    });
    let libraryTools = null;
    const library = createLibrary({
      local: createLocalSongStore(window.localStorage, report('songs')),
      onModeChange: () => {
        if (libraryTools) libraryTools.render();
        if (tabs.plan) tabs.plan.render();
      },
      onError: report('library'),
    });
    const planStore = createPlanStore({
      local: createLocalPlanStore(window.localStorage, report('plans')),
      onError: (err) => { report('plans')(err); library.markLost(); },
      canWrite: () => library.mode() === 'folder',
    });
    tabs.songs = initSongsTab({
      session, library, setStatus: status.setStatus, refresh: () => liveBar.refresh(),
      addToPlan: (songId, keepOpen) => tabs.plan.addSong(songId, keepOpen),
    });
    initImportPanel({
      library, setStatus: status.setStatus, report: report('songs'), onImported: () => tabs.songs.refreshList(),
    });
    tabs.plan = initPlanTab({
      session, store: planStore, library, tabs, logoStore, pictureFolder, setStatus: status.setStatus, showView,
      refresh: () => liveBar.refresh(), report: report('plans'),
    });
    libraryTools = initLibraryTools({
      library, kv: openKv('obs-stage-library'), setStatus: status.setStatus,
      report: report('library'), onChanged: () => { tabs.songs.refreshList(); tabs.plan.render(); },
      onFolderChange: async (handle) => {
        if (handle) {
          await planStore.attach(handle);
          try { await logoStore.attach(handle); } catch (err) { report('logos')(err); }
        } else {
          planStore.detach();
          logoStore.detach();
        }
        tabs.plan.reload();
      },
    });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.tab)));

    wireDiagnosticsPanel();
    initStyleTab({ session, store, setStatus: status.setStatus, report: report('settings') });
    transport.start();
    showView('plan');
    pictureFolder.restore();
    await libraryTools.restore();
  } catch (err) {
    diagnostics.log('dock init', err);
    console.error('[dock] init failed:', err);
  }
})();
