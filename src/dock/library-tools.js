import { $ } from './util.js';
import { createSongFolder, ensurePermission, saveHandle, loadHandle } from '../songs/folder.js';
import { findDuplicateGroups, pickRemovals } from '../songs/duplicates.js';

const PICKER_ID = 'obs-songs';

export function initLibraryTools({ library, kv, setStatus, report, onChanged }) {
  const banner = $('library-banner'), btnTools = $('btn-tools'), menu = $('tools-menu'),
        statusLine = $('library-status'), toolChoose = $('tool-choose-folder'),
        toolReconnect = $('tool-reconnect'), toolRewrite = $('tool-rewrite-lyrics'), toolStop = $('tool-stop-folder');
  let pendingHandle = null;   // the stored folder, kept so Reconnect can ask for permission again

  function setMenu(open) {
    menu.classList.toggle('hidden', !open);
    btnTools.setAttribute('aria-expanded', String(open));
  }

  function render() {
    const mode = library.mode();
    banner.classList.toggle('hidden', mode === 'folder');
    banner.classList.toggle('is-lost', mode === 'folder-lost');
    banner.textContent = mode === 'folder-lost'
      ? 'Lost access to the song folder. Songs are safe in this browser. Open Library tools and choose Reconnect.'
      : 'Songs are saved in this browser only. Open Library tools and choose a library folder to keep them as files and a lyrics.txt.';
    statusLine.textContent = mode === 'folder'
      ? 'Folder: ' + (pendingHandle ? pendingHandle.name : 'connected')
      : mode === 'folder-lost' ? 'Folder not connected' : 'Songs stored in this browser only';
    toolReconnect.classList.toggle('hidden', mode !== 'folder-lost');
    toolStop.classList.toggle('hidden', mode !== 'folder');
    toolRewrite.disabled = mode !== 'folder';
    toolChoose.textContent = mode === 'folder' ? 'Change library folder' : 'Choose library folder';
    onChanged();
  }

  async function attach(handle, successMessage) {
    const result = await library.attachFolder(createSongFolder(handle));
    pendingHandle = handle;
    await saveHandle(kv, handle);
    result.errors.forEach((e) => report(new Error(e.file + ': ' + e.message)));
    const skipped = result.errors.length ? ' ' + result.errors.length + ' file(s) were skipped (see Diagnostics).' : '';
    setStatus(successMessage + ' ' + result.loaded + ' song(s) loaded, ' + result.carried + ' added.' + skipped, 'success');
    render();
  }

  async function chooseFolder() {
    if (!window.showDirectoryPicker) { setStatus('This browser cannot pick folders.', 'error'); return; }
    try {
      const handle = await window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' });
      await attach(handle, 'Song folder: ' + handle.name + '.');
    } catch (err) {
      if (err.name !== 'AbortError') { report(err); setStatus('Could not open that folder.', 'error'); }
    }
  }

  async function reconnect() {
    try {
      if (pendingHandle && await ensurePermission(pendingHandle, { request: true })) await attach(pendingHandle, 'Reconnected.');
      else await chooseFolder();
    } catch (err) { report(err); setStatus('Could not reconnect to the folder.', 'error'); }
  }

  function exportSongs() {
    const songs = library.list();
    if (!songs.length) { setStatus('No songs to export.', 'error'); return; }
    const blob = new Blob([JSON.stringify({ version: 1, songs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stage-songs-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Exported ' + songs.length + ' songs.', 'success');
  }

  async function removeDuplicates() {
    const groups = findDuplicateGroups(library.list());
    if (!groups.length) { setStatus('No duplicate songs found.', ''); return; }
    const extra = groups.reduce((n, g) => n + (g.length - 1), 0);
    if (!confirm('Found ' + groups.length + ' title' + (groups.length !== 1 ? 's' : '') +
      ' with duplicates (' + extra + ' extra cop' + (extra !== 1 ? 'ies' : 'y') + ').\n\n' +
      'For each, the version with the most slides will be kept and the rest deleted. This cannot be undone.')) return;
    const ids = pickRemovals(groups);
    await library.removeMany([...ids]);
    onChanged();
    setStatus('Removed ' + ids.size + ' duplicate song' + (ids.size !== 1 ? 's' : '') + '.', 'success');
  }

  async function clearLibrary() {
    const count = library.list().length;
    if (!count) { setStatus('Library is already empty.', ''); return; }
    const inFolder = library.mode() === 'folder';
    if (!confirm('Delete ALL ' + count + ' song' + (count !== 1 ? 's' : '') + ' from the library?\n\n' +
      (inFolder ? 'Their files in the library folder will be deleted too. ' : '') +
      'This cannot be undone. If you have not backed up, click Cancel, use Export all as JSON first, then come back.')) return;
    if (prompt('To confirm, type DELETE below:') !== 'DELETE') {
      setStatus('Clear cancelled. Nothing was deleted.', '');
      return;
    }
    await library.clearAll();
    onChanged();
    setStatus('Library cleared. Import your songs again to bring them back.', 'success');
  }

  async function restore() {
    render();
    try {
      const handle = await loadHandle(kv);
      if (!handle) return;
      pendingHandle = handle;
      if (await ensurePermission(handle)) await attach(handle, 'Song folder restored.');
      else { library.markLost(); render(); }
    } catch (err) {
      report(err);
      library.markLost();
      render();
    }
  }

  btnTools.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.classList.contains('hidden')); });
  menu.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== btnTools) setMenu(false); });
  // Capture phase: while the menu is open, Escape only closes it and never reaches the Hide shortcut.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { setMenu(false); e.stopPropagation(); }
  }, true);

  toolChoose.addEventListener('click', chooseFolder);
  toolReconnect.addEventListener('click', reconnect);
  toolRewrite.addEventListener('click', async () => {
    await library.rewriteLyrics();
    const ok = library.mode() === 'folder';
    setStatus(ok ? 'lyrics.txt rewritten.' : 'Folder not connected.', ok ? 'success' : 'error');
    render();
  });
  toolStop.addEventListener('click', () => {
    library.detach();
    pendingHandle = null;
    setStatus('No longer using the folder. Songs stay in this browser.', '');
    render();
  });
  $('tool-export').addEventListener('click', exportSongs);
  $('tool-duplicates').addEventListener('click', removeDuplicates);
  $('tool-clear-all').addEventListener('click', clearLibrary);

  return { restore, render };
}
