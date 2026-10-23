import { $ } from './util.js';
import { searchSongs, tokenize, markTokens } from '../songs/search.js';
import { findDuplicateGroups } from '../songs/duplicates.js';

export function initSongsTab({ session, library, setStatus, refresh, addToPlan }) {
  const search = $('song-search'), listEl = $('song-list'), view = $('song-view'), nameEl = $('song-name'),
        btnAll = $('btn-all-songs'), btnToPlan = $('btn-song-to-plan'), btnEdit = $('btn-edit-song'), cardsEl = $('slide-cards'),
        editor = $('song-editor'), titleInput = $('song-title-input'), slideList = $('slide-list'),
        slideText = $('slide-textarea'), btnAdd = $('btn-add-slide'), btnUpdate = $('btn-update-slide'),
        btnDelSlide = $('btn-delete-slide'), btnSave = $('btn-save-song'), btnDelete = $('btn-delete-song'),
        btnDone = $('btn-done-edit'), btnNew = $('btn-new-song');

  let activeSongId = null;
  let activeSlideIdx = null;   // the selected slide
  let shownIdx = -1;           // the slide last put on screen, -1 when none
  let editing = false;
  let listOpen = true;
  let discardArmed = false;   // true after Done warned about unsaved input

  const getSong = () => library.get(activeSongId);

  // While a slide of this song is live, re-sends follow the slide that is ON SCREEN, not the one selected in the editor.
  function contentIndex() {
    return session.isLive && session.liveTab === 'songs' && shownIdx >= 0 ? shownIdx : activeSlideIdx;
  }

  function hasUnsavedEdits() {
    const song = getSong();
    const typedTitle = titleInput.value.trim();
    const titleChanged = song ? (typedTitle || 'Untitled') !== song.title : typedTitle !== '';
    const text = slideText.value;
    const slideChanged = text.trim() !== '' && !(song && activeSlideIdx !== null && song.slides[activeSlideIdx] === text);
    return titleChanged || slideChanged;
  }

  function slideLines() {
    const song = getSong();
    const idx = contentIndex();
    if (song && idx !== null) return song.slides[idx] || '';
    return editing ? slideText.value.trim() : '';
  }

  function resetSelection() {
    activeSongId = null;
    activeSlideIdx = null;
    shownIdx = -1;
    editing = false;
    listOpen = true;
  }

  function renderList() {
    const query = search.value;
    const tokens = tokenize(query);
    const dupIds = new Set(findDuplicateGroups(library.list()).flat().map((s) => s.id));
    const found = searchSongs(library.list(), query);
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'song-item';
      li.textContent = query.trim() ? 'No songs match "' + query.trim() + '"' : 'No songs yet. Use + New or Import.';
      listEl.replaceChildren(li);
      return;
    }
    listEl.replaceChildren(...found.map(({ song, excerpt }) => {
      const li = document.createElement('li');
      li.className = 'song-item';
      const title = document.createElement('span');
      title.className = 'title';
      title.innerHTML = markTokens(song.title || 'Untitled', tokens);
      if (dupIds.has(song.id)) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'DUPLICATE';
        title.appendChild(badge);
      }
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = song.slides.length + (song.slides.length === 1 ? ' slide' : ' slides');
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'add';
      add.textContent = '+ Plan';
      add.title = 'Add this song to the open plan (hold Shift to keep choosing)';
      add.setAttribute('aria-label', 'Add ' + (song.title || 'Untitled') + ' to the plan');
      add.addEventListener('click', (e) => { e.stopPropagation(); addToPlan(song.id, e.shiftKey); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '\u2715';
      del.title = 'Delete this song';
      del.setAttribute('aria-label', 'Delete ' + song.title);
      del.addEventListener('click', (e) => { e.stopPropagation(); removeSong(song); });
      li.append(title, count, add, del);
      if (excerpt) {
        const note = document.createElement('span');
        note.className = 'excerpt';
        note.innerHTML = markTokens(excerpt, tokens);
        li.appendChild(note);
      }
      li.addEventListener('click', () => open(song.id));
      return li;
    }));
  }

  function renderCards(song) {
    if (!song.slides.length) {
      const hint = document.createElement('p');
      hint.className = 'faint';
      hint.textContent = 'This song has no slides yet. Press Edit to add some.';
      cardsEl.replaceChildren(hint);
      return;
    }
    cardsEl.replaceChildren(...song.slides.map((text, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card' + (i === activeSlideIdx ? ' cur' : '');
      const number = document.createElement('small');
      number.textContent = String(i + 1);
      card.append(number, document.createTextNode(text));
      card.addEventListener('click', () => showSlide(i));
      return card;
    }));
  }

  function renderChips() {
    const song = getSong();
    slideList.replaceChildren(...(song ? song.slides : []).map((text, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slide-chip' + (i === activeSlideIdx ? ' on' : '');
      chip.textContent = (text.split('\n')[0] || 'Slide ' + (i + 1)).slice(0, 30);
      chip.title = text;
      chip.addEventListener('click', () => selectSlide(i));
      return chip;
    }));
  }

  function render() {
    const song = getSong();
    const showList = !editing && (!song || listOpen);
    listEl.classList.toggle('hidden', !showList);
    search.classList.toggle('hidden', editing);
    view.classList.toggle('hidden', editing || !song || showList);
    editor.classList.toggle('hidden', !editing);
    if (showList) renderList();
    if (song && !editing) { nameEl.textContent = song.title; renderCards(song); }
    if (editing) renderChips();
    btnDelete.disabled = !song;
    refresh();
  }

  function open(id, { preview = false } = {}) {
    activeSongId = id;
    const song = getSong();
    activeSlideIdx = preview && song && song.slides.length ? 0 : null;
    shownIdx = -1;
    editing = false;
    listOpen = false;
    search.value = '';
    render();
  }

  function showSlide(i) {
    activeSlideIdx = i;
    shownIdx = i;
    renderCards(getSong());
    session.show();
    setStatus('Slide is live.', 'success');
  }

  function step(dir) {
    const song = getSong();
    if (!song || !song.slides.length) return;
    let target = shownIdx < 0 ? (dir > 0 ? 0 : song.slides.length - 1) : shownIdx + dir;
    target = Math.max(0, Math.min(song.slides.length - 1, target));
    activeSlideIdx = target;
    shownIdx = target;
    renderCards(song);
    session.show();
  }

  async function removeSong(song) {
    if (!confirm('Delete "' + (song.title || 'Untitled') + '"? This cannot be undone.')) return;
    await library.remove(song.id);
    if (song.id === activeSongId) resetSelection();
    render();
    setStatus('Deleted "' + (song.title || 'Untitled') + '".', '');
  }
  // ── Editor ────────────────────────────────────────────────────────────────

  function selectSlide(i) {
    const song = getSong();
    if (!song) return;
    activeSlideIdx = i;
    slideText.value = song.slides[i] || '';
    btnUpdate.disabled = false;
    btnDelSlide.disabled = false;
    renderChips();
    refresh();
  }

  function clearSlideEditor() {
    activeSlideIdx = null;
    slideText.value = '';
    btnUpdate.disabled = true;
    btnDelSlide.disabled = true;
  }

  function startEditing() {
    const song = getSong();
    editing = true;
    listOpen = false;
    titleInput.value = song ? song.title : '';
    clearSlideEditor();
    render();
  }

  function startNew() {
    activeSongId = null;
    shownIdx = -1;
    startEditing();
  }

  async function saveSong() {
    const title = titleInput.value.trim() || 'Untitled';
    const existing = getSong();
    const saved = await library.save({ ...(existing || { slides: [] }), id: existing ? existing.id : undefined, title });
    activeSongId = saved.id;
    btnDelete.disabled = false;
    setStatus('Song saved.', 'success');
    render();
  }

  async function addSlide() {
    const text = slideText.value;
    if (!text.trim()) { setStatus('Enter slide text first.', 'error'); return; }
    const existing = getSong();
    const saved = await library.save({
      ...(existing || { title: titleInput.value.trim() || 'Untitled' }),
      id: existing ? existing.id : undefined,
      slides: [...(existing ? existing.slides : []), text],
    });
    activeSongId = saved.id;
    activeSlideIdx = saved.slides.length - 1;
    slideText.value = '';
    btnUpdate.disabled = false;
    btnDelSlide.disabled = false;
    render();
    setStatus('Slide added.', 'success');
  }

  async function updateSlide() {
    const song = getSong();
    if (!song || activeSlideIdx === null) return;
    await library.save({ ...song, slides: song.slides.map((s, i) => (i === activeSlideIdx ? slideText.value : s)) });
    renderChips();
    if (session.isLive && session.liveTab === 'songs' && shownIdx === activeSlideIdx) session.resendIfLive({ fresh: true });
    refresh();
    setStatus('Slide updated.', 'success');
  }

  async function deleteSlide() {
    const song = getSong();
    if (!song || activeSlideIdx === null) return;
    await library.save({ ...song, slides: song.slides.filter((_, i) => i !== activeSlideIdx) });
    if (shownIdx === activeSlideIdx) shownIdx = -1;
    clearSlideEditor();
    render();
    setStatus('Slide deleted.', '');
  }

  // ── Events ────────────────────────────────────────────────────────────────

  search.addEventListener('focus', () => { listOpen = true; render(); });
  search.addEventListener('input', () => { listOpen = true; render(); });
  btnAll.addEventListener('click', () => { listOpen = true; render(); });
  btnEdit.addEventListener('click', startEditing);
  btnToPlan.addEventListener('click', (e) => { const song = getSong(); if (song) addToPlan(song.id, e.shiftKey); });
  btnNew.addEventListener('click', startNew);
  btnDone.addEventListener('click', () => {
    if (hasUnsavedEdits() && !discardArmed) {
      discardArmed = true;
      setStatus('You have unsaved text. Use Save song, Add slide or Update, or press Done again to discard it.', 'error');
      return;
    }
    discardArmed = false;
    editing = false;
    listOpen = !getSong();
    render();
  });
  titleInput.addEventListener('input', () => { discardArmed = false; });
  btnSave.addEventListener('click', saveSong);
  btnDelete.addEventListener('click', () => { const song = getSong(); if (song) removeSong(song); });
  btnAdd.addEventListener('click', addSlide);
  btnUpdate.addEventListener('click', updateSlide);
  btnDelSlide.addEventListener('click', deleteSlide);
  slideText.addEventListener('input', () => { discardArmed = false; refresh(); });

  render();

  return {
    getContent() {
      const song = getSong();
      return { title: song ? song.title : (editing ? titleInput.value.trim() : ''), body: slideLines() };
    },
    preview() {
      const song = getSong();
      const lines = slideLines();
      const where = activeSlideIdx === null ? 'no slide picked' : 'slide ' + (activeSlideIdx + 1) + ' of ' + (song ? song.slides.length : 0);
      return {
        has: lines.length > 0,
        text: lines || (song ? 'Pick a slide' : 'Nothing loaded'),
        sub: song ? song.title + ' \u00b7 ' + where : 'Pick a song and a slide',
        canNav: !!(song && song.slides.length),
      };
    },
    /** Open a song with slide 1 previewed, not shown. False when unsaved editor text would be lost or the song is gone. */
    loadSong(id) {
      if (editing && hasUnsavedEdits()) return false;
      if (!library.get(id)) return false;
      open(id, { preview: true });
      return true;
    },
    /** Which song and slide is loaded, for the plan's "slide 2/4" label. */
    position() {
      const song = getSong();
      if (!song) return null;
      return { songId: song.id, index: shownIdx >= 0 ? shownIdx : activeSlideIdx, count: song.slides.length };
    },
    step,
    markShown() { shownIdx = activeSlideIdx === null ? -1 : activeSlideIdx; },
    resetPosition() { shownIdx = -1; },
    /** Re-render after the library changed underneath us (bulk actions, folder attach). */
    refreshList() {
      if (activeSongId && !getSong()) resetSelection();
      render();
    },
  };
}
