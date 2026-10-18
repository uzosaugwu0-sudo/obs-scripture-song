import { $, highlightMatch } from './util.js';
import { normalizeTitle } from '../songs/model.js';
import { parseSongFile } from '../songs/parse.js';
import { findDuplicateGroups, pickRemovals } from '../songs/duplicates.js';

export function initSongsTab({ session, library, setStatus, refresh, report }) {
  const libSearch = $('lib-search'), btnNewSong = $('btn-new-song'),
        songList = $('song-list'), editorTitle = $('editor-title'),
        songTitleInput = $('song-title-input'), slideList = $('slide-list'),
        slideTextarea = $('slide-textarea'), btnAddSlide = $('btn-add-slide'),
        btnUpdateSlide = $('btn-update-slide'), btnDeleteSlide = $('btn-delete-slide'),
        btnSaveSong = $('btn-save-song'), btnDeleteSong = $('btn-delete-song'),
        btnExport = $('btn-export'), btnRemoveDuplicates = $('btn-remove-duplicates'),
        btnClearAllSongs = $('btn-clear-all-songs'), btnImportFile = $('btn-import-file'),
        btnImportFolder = $('btn-import-folder'), importFileInput = $('import-file-input'),
        importFolderInput = $('import-folder-input'), importPanel = $('import-panel'),
        importPanelTitle = $('import-panel-title'), importPanelHint = $('import-panel-hint'),
        importSongList = $('import-song-list'), btnImportConfirm = $('btn-import-confirm'),
        btnImportCancel = $('btn-import-cancel'), btnImportClose = $('btn-import-close');

  let activeSongId    = null;
  let activeSlideIdx  = null;
  let currentSlideIdx = -1;
  let libFilter       = '';
  let libSearchMode   = 'title';
  let _pendingImport   = [];

  const getActiveSong = () => library.get(activeSongId);

  const STOP_WORDS = new Set([
    'verse','verse1','verse2','verse3','verse4',
    'chorus','prechorus','pre-chorus','bridge',
    'intro','outro','tag','hook','refrain',
    'repeat','interlude','coda','ending','instrumental',
  ]);

  function stripStopWords(text) {
    return text.toLowerCase().split(/\s+/)
      .filter(w => !STOP_WORDS.has(w.replace(/[^a-z0-9]/g, '')))
      .join(' ');
  }

  function lyricExcerpt(song, q) {
    for (const slide of song.slides) {
      const idx = slide.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 30);
      const end   = Math.min(slide.length, idx + q.length + 30);
      return highlightMatch(
        (start > 0 ? '…' : '') + slide.slice(start, end) + (end < slide.length ? '…' : ''), q);
    }
    return null;
  }

  function renderSongList() {
    const q = libFilter.toLowerCase().trim();
    songList.innerHTML = '';
    const dupIds = new Set(findDuplicateGroups(library.list()).flat().map(s => s.id));

    const filtered = library.list().filter(s => {
      if (!q) return true;
      if (libSearchMode === 'lyrics') {
        return s.slides.some(sl => sl.toLowerCase().includes(q) || stripStopWords(sl).includes(q));
      }
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.altTitle && s.altTitle.toLowerCase().includes(q)) return true;
      return false;
    });

    if (filtered.length === 0 && q) {
      const empty = document.createElement('li');
      empty.className   = 'song-list-empty';
      empty.textContent = 'No songs match "' + q + '"';
      songList.appendChild(empty);
      return;
    }

    filtered.forEach(song => {
      const li = document.createElement('li');
      li.className = 'song-item' + (song.id === activeSongId ? ' active' : '') +
                     (dupIds.has(song.id) ? ' is-duplicate' : '');

      const titleMatch = q && libSearchMode === 'title' && song.title.toLowerCase().includes(q);
      const altMatch   = q && libSearchMode === 'title' && song.altTitle &&
                         song.altTitle.toLowerCase().includes(q);
      const lyricMatch = q && libSearchMode === 'lyrics' &&
                         song.slides.some(sl => sl.toLowerCase().includes(q) ||
                                                stripStopWords(sl).includes(q));

      const titleSpan = document.createElement('span');
      titleSpan.className = 'song-item-title';
      if (titleMatch) titleSpan.innerHTML = highlightMatch(song.title || '(Untitled)', q);
      else            titleSpan.textContent = song.title || '(Untitled)';
      if (dupIds.has(song.id)) {
        const badge = document.createElement('span');
        badge.className = 'song-item-dup-badge';
        badge.textContent = 'DUPLICATE';
        titleSpan.appendChild(badge);
      }

      const countSpan = document.createElement('span');
      countSpan.className   = 'song-item-count';
      countSpan.textContent = song.slides.length + ' slide' + (song.slides.length !== 1 ? 's' : '');

      const deleteBtn = document.createElement('button');
      deleteBtn.className   = 'song-item-delete';
      deleteBtn.type        = 'button';
      deleteBtn.textContent = '✕';
      deleteBtn.title       = 'Delete this song';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('Delete "' + (song.title || 'Untitled') + '"? This cannot be undone.')) {
          deleteSongById(song.id);
        }
      });

      li.appendChild(titleSpan);
      li.appendChild(countSpan);
      li.appendChild(deleteBtn);

      if (song.altTitle) {
        const alias = document.createElement('span');
        alias.className = 'song-item-alias';
        if (altMatch) alias.innerHTML = '📄 ' + highlightMatch(song.altTitle, q);
        else          alias.textContent = '📄 ' + song.altTitle;
        li.appendChild(alias);
      }

      if (lyricMatch) {
        const excerpt = lyricExcerpt(song, q);
        if (excerpt) {
          const span = document.createElement('span');
          span.className = 'song-item-excerpt';
          span.innerHTML = excerpt;
          li.appendChild(span);
        }
      }

      li.addEventListener('click', () => loadSongIntoEditor(song.id));
      songList.appendChild(li);
    });
  }

  function loadSongIntoEditor(id) {
    activeSongId    = id;
    activeSlideIdx  = null;
    currentSlideIdx = -1;
    const song = getActiveSong();
    if (!song) return;
    editorTitle.textContent = 'Editor — ' + (song.title || 'Untitled');
    songTitleInput.value    = song.title || '';
    btnDeleteSong.disabled  = false;
    slideTextarea.value     = '';
    btnUpdateSlide.disabled = true;
    btnDeleteSlide.disabled = true;
    renderSlideChips();
    renderSongList();
    refresh();
  }

  function renderSlideChips() {
    slideList.innerHTML = '';
    const song = getActiveSong();
    if (!song) return;
    song.slides.forEach((text, idx) => {
      const chip = document.createElement('button');
      chip.className   = 'slide-chip' + (idx === activeSlideIdx ? ' active' : '');
      chip.textContent = (text.split('\n')[0] || 'Slide ' + (idx + 1)).slice(0, 30);
      chip.title       = text;
      chip.addEventListener('click', () => selectSlide(idx));
      slideList.appendChild(chip);
    });
  }

  function selectSlide(idx) {
    const song = getActiveSong();
    if (!song) return;
    activeSlideIdx          = idx;
    slideTextarea.value     = song.slides[idx] || '';
    btnUpdateSlide.disabled = false;
    btnDeleteSlide.disabled = false;
    renderSlideChips();
    refresh();
  }

  function newSong() {
    activeSongId = activeSlideIdx = null;
    currentSlideIdx = -1;
    editorTitle.textContent = 'Editor — New Song';
    songTitleInput.value    = '';
    slideList.innerHTML     = '';
    slideTextarea.value     = '';
    btnDeleteSong.disabled  = true;
    btnUpdateSlide.disabled = true;
    btnDeleteSlide.disabled = true;
    renderSongList();
    refresh();
  }

  async function saveSong() {
    const title = songTitleInput.value.trim() || 'Untitled';
    const existing = getActiveSong();
    const saved = await library.save({ ...(existing || { slides: [] }), id: existing?.id, title });
    activeSongId = saved.id;
    editorTitle.textContent = 'Editor — ' + title;
    btnDeleteSong.disabled  = false;
    renderSongList();
    renderSlideChips();
    setStatus('Song saved.', 'success');
  }

  async function deleteSongById(id) {
    const song = library.get(id);
    if (!song) return;
    await library.remove(id);
    if (id === activeSongId) newSong(); else renderSongList();
    setStatus('Deleted "' + (song.title || 'Untitled') + '".', '');
  }

  async function clearAllSongs() {
    const count = library.list().length;
    if (count === 0) { setStatus('Library is already empty.', ''); return; }
    const inFolder = library.mode() === 'folder';
    if (!confirm('Delete ALL ' + count + ' song' + (count !== 1 ? 's' : '') + ' from the library?\n\n' +
      (inFolder ? 'Their files in the library folder will be deleted too. ' : '') +
      'This cannot be undone. If you have not backed up, click Cancel, use the ↓ JSON button first, then come back.')) return;
    if (prompt('To confirm, type DELETE below:') !== 'DELETE') {
      setStatus('Clear cancelled — nothing was deleted.', ''); return;
    }
    await library.clearAll();
    activeSongId = null;
    newSong();
    setStatus('Library cleared. Import your songs again to bring them back.', 'success');
  }

  async function removeDuplicates() {
    const groups = findDuplicateGroups(library.list());
    if (groups.length === 0) { setStatus('No duplicate songs found.', ''); return; }
    const totalExtra = groups.reduce((n, g) => n + (g.length - 1), 0);
    if (!confirm('Found ' + groups.length + ' title' + (groups.length !== 1 ? 's' : '') +
      ' with duplicates (' + totalExtra + ' extra cop' + (totalExtra !== 1 ? 'ies' : 'y') + ').\n\n' +
      'For each, the version with the most slides will be kept and the rest deleted. This cannot be undone.')) return;
    const ids = pickRemovals(groups);
    const activeRemoved = activeSongId && ids.has(activeSongId);
    await library.removeMany([...ids]);
    if (activeRemoved) newSong(); else renderSongList();
    setStatus('Removed ' + ids.size + ' duplicate song' + (ids.size !== 1 ? 's' : '') + '.', 'success');
  }

  async function addSlide() {
    const text = slideTextarea.value;
    if (!text.trim()) { setStatus('Enter slide text first.', 'error'); return; }
    const existing = getActiveSong();
    const saved = await library.save({
      ...(existing || { title: songTitleInput.value.trim() || 'Untitled' }),
      id: existing?.id,
      slides: [...(existing ? existing.slides : []), text],
    });
    activeSongId   = saved.id;
    activeSlideIdx = saved.slides.length - 1;
    btnDeleteSong.disabled = false;
    slideTextarea.value = '';
    renderSlideChips(); renderSongList(); refresh();
    setStatus('Slide added.', 'success');
  }

  async function updateSlide() {
    const song = getActiveSong();
    if (!song || activeSlideIdx === null) return;
    await library.save({ ...song, slides: song.slides.map((s, i) => (i === activeSlideIdx ? slideTextarea.value : s)) });
    renderSlideChips();
    if (session.isLive && session.liveTab === 'songs' && currentSlideIdx === activeSlideIdx) session.resendIfLive();
    setStatus('Slide updated.', 'success');
  }

  async function deleteSlide() {
    const song = getActiveSong();
    if (!song || activeSlideIdx === null) return;
    await library.save({ ...song, slides: song.slides.filter((_, i) => i !== activeSlideIdx) });
    activeSlideIdx = null;
    slideTextarea.value = '';
    btnUpdateSlide.disabled = true;
    btnDeleteSlide.disabled = true;
    renderSlideChips(); renderSongList(); refresh();
    setStatus('Slide deleted.', '');
  }

  async function confirmImport() {
    const toAdd = _pendingImport.filter((s) => s._selected);
    if (toAdd.length === 0) { setStatus('No songs selected.', 'error'); return; }
    const { added, replaced } = await library.upsertByTitle(
      toAdd.map(({ title, altTitle, slides }) => ({ title, altTitle, slides })));
    renderSongList(); closeImportPanel();
    const parts = [];
    if (added) parts.push(added + ' added');
    if (replaced) parts.push(replaced + ' updated');
    setStatus(parts.join(', ') + '.', 'success');
  }

  async function processFiles(files, sourceLabel) {
    const all = [];
    const failed = [];
    for (const file of files) {
      try {
        all.push(...parseSongFile(file.name, await readFileAsText(file)));
      } catch (err) {
        report(err);
        failed.push(file.name);
      }
    }
    const failedMessage = 'Could not read ' + failed.join(', ') + '.';
    if (all.length === 0 && failed.length) { setStatus(failedMessage, 'error'); return; }
    showImportPreview(all, sourceLabel);
    if (failed.length) setStatus(failedMessage, 'error');
  }

  function navigateSlide(dir) {
    const song = getActiveSong();
    if (!song || song.slides.length === 0) return;
    let target = currentSlideIdx < 0
      ? (dir > 0 ? 0 : song.slides.length - 1)
      : currentSlideIdx + dir;
    target = Math.max(0, Math.min(song.slides.length - 1, target));
    activeSlideIdx = currentSlideIdx = target;
    renderSlideChips();
    refresh();
    session.show();
  }

  function exportSongs() {
    if (library.list().length === 0) { setStatus('No songs to export.', 'error'); return; }
    const blob = new Blob([JSON.stringify({ version: 1, songs: library.list() }, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'stage-songs-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Exported ' + library.list().length + ' songs.', 'success');
  }
  function showImportPreview(incoming, sourceLabel) {
    if (!incoming || incoming.length === 0) { setStatus('No songs found in those files.', 'error'); return; }
    _pendingImport = incoming.map(s => ({
      ...s,
      _exists: library.list().some((e) => normalizeTitle(e.title) === normalizeTitle(s.title)),
      _selected: true,
    }));
    const newCount = _pendingImport.filter(s => !s._exists).length;
    const conCount = _pendingImport.filter(s =>  s._exists).length;
    importPanelTitle.textContent = 'Import Preview — ' + sourceLabel;
    importPanelHint.textContent  = _pendingImport.length + ' found · ' + newCount + ' new · ' + conCount + ' already exist';
    importSongList.innerHTML = '';

    _pendingImport.forEach((song, idx) => {
      const li = document.createElement('li');
      li.className = 'import-song-item' + (song._exists ? ' conflict' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !song._exists; cb.id = 'isc-' + idx;
      cb.addEventListener('change', () => { _pendingImport[idx]._selected = cb.checked; });
      _pendingImport[idx]._selected = !song._exists;
      const label = document.createElement('label'); label.htmlFor = 'isc-' + idx;
      const ts = document.createElement('span'); ts.className = 'isc-title'; ts.textContent = song.title;
      const ms = document.createElement('span'); ms.className = 'isc-meta';
      ms.textContent = song.slides.length + ' slides' + (song._exists ? ' · already exists' : '');
      label.appendChild(ts); label.appendChild(ms);
      li.appendChild(cb); li.appendChild(label);
      importSongList.appendChild(li);
    });
    importPanel.classList.remove('hidden');
  }
  function closeImportPanel() {
    importPanel.classList.add('hidden');
    importSongList.innerHTML = '';
    _pendingImport = [];
    importFileInput.value = '';
    importFolderInput.value = '';
  }

  function readFileAsText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result);
      r.onerror = () => rej(new Error('Read failed'));
      r.readAsText(file);
    });
  }

  // ── Events: songs ─────────────────────────────────────────────────────────
  libSearch.addEventListener('input', () => { libFilter = libSearch.value.trim(); renderSongList(); });

  document.querySelectorAll('.search-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.search-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      libSearchMode = btn.dataset.mode;
      renderSongList();
    });
  });

  btnNewSong.addEventListener('click', newSong);
  btnSaveSong.addEventListener('click', saveSong);
  btnDeleteSong.addEventListener('click', () => {
    const s = getActiveSong();
    if (s && confirm('Delete "' + s.title + '"?')) deleteSongById(s.id);
  });
  btnRemoveDuplicates.addEventListener('click', removeDuplicates);
  btnClearAllSongs.addEventListener('click', clearAllSongs);
  btnAddSlide.addEventListener('click', addSlide);
  btnUpdateSlide.addEventListener('click', updateSlide);
  btnDeleteSlide.addEventListener('click', deleteSlide);
  slideTextarea.addEventListener('input', refresh);

  btnExport.addEventListener('click', exportSongs);
  btnImportFile.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', async e => {
    const f = Array.from(e.target.files);
    if (f.length) await processFiles(f, f.length === 1 ? f[0].name : f.length + ' files');
  });
  btnImportFolder.addEventListener('click', () => importFolderInput.click());
  importFolderInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files).filter(f => {
      const n = f.name.toLowerCase();
      return n.endsWith('.txt') || n.endsWith('.json') || n.endsWith('.csv') || n.endsWith('.tsv');
    });
    if (files.length === 0) { setStatus('No compatible files in that folder.', 'error'); return; }
    const folderName = files[0].webkitRelativePath.split('/')[0] || 'folder';
    await processFiles(files, folderName + ' (' + files.length + ' files)');
  });
  btnImportConfirm.addEventListener('click', confirmImport);
  btnImportCancel.addEventListener('click', closeImportPanel);
  btnImportClose.addEventListener('click', closeImportPanel);

  renderSongList();

  return {
    currentSlide() {
      const song  = getActiveSong();
      const lines = (activeSlideIdx !== null && song) ? (song.slides[activeSlideIdx] || '') : slideTextarea.value.trim();
      return { lines, canNav: !!(song && song.slides.length) };
    },
    navigate: navigateSlide,
    markShown() { currentSlideIdx = activeSlideIdx !== null ? activeSlideIdx : -1; },
    resetPosition() { currentSlideIdx = -1; },
    getContent() {
      const song = getActiveSong();
      const { lines } = this.currentSlide();
      return { title: (song ? song.title : songTitleInput.value.trim()) || '', body: lines };
    },
    refreshList: renderSongList,
  };
}
