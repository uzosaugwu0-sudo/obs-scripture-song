import { $ } from './util.js';
import { createSongFolder, ensurePermission, saveHandle, loadHandle } from '../songs/folder.js';

const PICKER_ID = 'obs-songs';

export function initLibraryUI({ library, kv, setStatus, onChange, report }) {
  const banner = $('library-banner'), label = $('output-folder-label'),
        btnChoose = $('btn-set-folder'), btnReconnect = $('btn-reconnect-folder'),
        btnRewrite = $('btn-save-all-txt'), btnStop = $('btn-clear-folder');
  let pendingHandle = null;   // the stored folder, kept so Reconnect can ask for permission again

  function render() {
    const mode = library.mode();
    banner.classList.toggle('hidden', mode === 'folder');
    banner.classList.toggle('is-lost', mode === 'folder-lost');
    banner.textContent = mode === 'folder-lost'
      ? 'Lost access to the song folder — songs are safe in this browser. Click Reconnect.'
      : 'Songs are saved in this browser only. Choose a folder to keep them as files and a lyrics.txt.';
    label.textContent = mode === 'folder' ? '📂 ' + (pendingHandle?.name || 'Song folder')
      : mode === 'folder-lost' ? '⚠ Folder not connected' : 'Songs are stored in this browser only';
    btnReconnect.style.display = mode === 'folder-lost' ? '' : 'none';
    btnStop.style.display      = mode === 'folder' ? '' : 'none';
    btnRewrite.disabled        = mode !== 'folder';
    btnChoose.textContent      = mode === 'folder' ? 'Change Folder' : 'Choose Folder';
    onChange();
  }

  async function attach(handle, successMessage) {
    const result = await library.attachFolder(createSongFolder(handle));
    pendingHandle = handle;
    await saveHandle(kv, handle);
    result.errors.forEach((e) => report(new Error(e.file + ': ' + e.message)));
    const skipped = result.errors.length ? ` ${result.errors.length} file(s) were skipped (see Diagnostics).` : '';
    setStatus(`${successMessage} ${result.loaded} song(s) loaded, ${result.carried} added.${skipped}`, 'success');
    render();
  }

  btnChoose.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) { setStatus('This browser cannot pick folders.', 'error'); return; }
    try {
      const handle = await window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' });
      await attach(handle, 'Song folder: ' + handle.name + '.');
    } catch (err) {
      if (err.name !== 'AbortError') { report(err); setStatus('Could not open that folder.', 'error'); }
    }
  });

  btnReconnect.addEventListener('click', async () => {
    try {
      if (pendingHandle && await ensurePermission(pendingHandle, { request: true })) {
        await attach(pendingHandle, 'Reconnected.');
      } else {
        btnChoose.click();
      }
    } catch (err) { report(err); setStatus('Could not reconnect to the folder.', 'error'); }
  });

  btnRewrite.addEventListener('click', async () => {
    await library.rewriteLyrics();
    const ok = library.mode() === 'folder';
    setStatus(ok ? 'lyrics.txt rewritten.' : 'Folder not connected.', ok ? 'success' : 'error');
    render();
  });

  btnStop.addEventListener('click', () => {
    library.detach();
    pendingHandle = null;
    setStatus('No longer using the folder. Songs stay in this browser.', '');
    render();
  });

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

  return { restore, render };
}
