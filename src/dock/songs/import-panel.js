import { $ } from '../shared/util.js';
import { normalizeTitle } from '../../songs/model.js';
import { parseSongFile } from '../../songs/parse.js';

const SONG_FILE = /[.](txt|json|csv|tsv)$/i;

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsText(file);
  });
}

/** Import preview: choose which songs from a file or folder to add or update. */
export function initImportPanel({ library, setStatus, report, onImported }) {
  const panel = $('import-panel'), title = $('import-panel-title'), hint = $('import-panel-hint'),
        listEl = $('import-song-list'), fileInput = $('import-file-input'), folderInput = $('import-folder-input');
  let pending = [];

  function close() {
    panel.classList.add('hidden');
    listEl.replaceChildren();
    pending = [];
    fileInput.value = '';
    folderInput.value = '';
  }

  function showPreview(incoming, sourceLabel) {
    if (!incoming.length) { setStatus('No songs found in those files.', 'error'); return; }
    const existing = new Set(library.list().map((s) => normalizeTitle(s.title)));
    pending = incoming.map((song) => {
      const exists = existing.has(normalizeTitle(song.title));
      return { ...song, exists, selected: !exists };
    });
    const newCount = pending.filter((s) => !s.exists).length;
    title.textContent = 'Import preview - ' + sourceLabel;
    hint.textContent = pending.length + ' found, ' + newCount + ' new, ' + (pending.length - newCount) + ' already exist';
    listEl.replaceChildren(...pending.map((song, idx) => {
      const li = document.createElement('li');
      li.className = song.exists ? 'conflict' : '';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'isc-' + idx;
      box.checked = song.selected;
      box.addEventListener('change', () => {
        pending = pending.map((s, i) => (i === idx ? { ...s, selected: box.checked } : s));
      });
      const label = document.createElement('label');
      label.htmlFor = box.id;
      const name = document.createElement('span');
      name.className = 'isc-title';
      name.textContent = song.title;
      const meta = document.createElement('span');
      meta.className = 'isc-meta';
      meta.textContent = song.slides.length + ' slides' + (song.exists ? ' - already exists' : '');
      label.append(name, meta);
      li.append(box, label);
      return li;
    }));
    panel.classList.remove('hidden');
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
    showPreview(all, sourceLabel);
    if (failed.length) setStatus(failedMessage, 'error');
  }

  async function confirmImport() {
    const chosen = pending.filter((s) => s.selected);
    if (!chosen.length) { setStatus('No songs selected.', 'error'); return; }
    const { added, replaced } = await library.upsertByTitle(
      chosen.map(({ title: t, altTitle, slides }) => ({ title: t, altTitle, slides })));
    close();
    onImported();
    const parts = [];
    if (added) parts.push(added + ' added');
    if (replaced) parts.push(replaced + ' updated');
    setStatus(parts.join(', ') + '.', 'success');
  }

  $('btn-import-file').addEventListener('click', () => fileInput.click());
  $('tool-import-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length) await processFiles(files, files.length === 1 ? files[0].name : files.length + ' files');
  });
  folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter((f) => SONG_FILE.test(f.name));
    if (!files.length) { setStatus('No compatible files in that folder.', 'error'); return; }
    const folderName = files[0].webkitRelativePath.split('/')[0] || 'folder';
    await processFiles(files, folderName + ' (' + files.length + ' files)');
  });
  $('btn-import-confirm').addEventListener('click', confirmImport);
  $('btn-import-cancel').addEventListener('click', close);
  $('btn-import-close').addEventListener('click', close);

  return { close };
}
