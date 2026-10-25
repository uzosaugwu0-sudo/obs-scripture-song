import { $ } from './util.js';
import { createPlan, addItem, songItem, readingItem, announcementItem, timerItem, renamePlan, moveItem, moveItemTo, removeItem, replaceItem, DEFAULT_PLAN_NAME } from '../plan/model.js';
import { itemStatus, itemTitle, indexOfItem, nextLoadable, prevLoadable, currentAfterRemove, planSummary } from '../plan/cursor.js';
import { describeTimerSpec } from '../plan/extras.js';
import { initExtrasEditor } from './extras-editor.js';

const TYPE_ICON = { song: '♫', reading: '✝', announcement: '✎', timer: '⏱' };
const BANNER_TEXT = {
  local: 'Plans are saved in this browser only. Open Songs, Library tools and choose a library folder to keep them as files.',
  'folder-lost': 'Lost access to the library folder. Plans are safe in this browser. Open Songs, Library tools and choose Reconnect.',
};

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * The Plan tab: a named list of songs and readings. It only decides what to
 * load; what is on air is still decided by Show and Hide in the live bar.
 */
export function initPlanTab({ session, store, library, tabs, setStatus, showView, refresh, report }) {
  const select = $('plan-select'), listEl = $('plan-list'), banner = $('plan-banner'),
        unreadableEl = $('plan-unreadable'), btnMenu = $('btn-plan-menu'), menu = $('plan-menu'),
        picker = $('picker-banner'), pickerText = $('picker-text'), btnNext = $('btn-next-item');

  let plan = store.get(store.lastId()) || store.list()[0] || createPlan();
  let currentId = null;     // the item most recently loaded from the plan
  let picking = null;       // 'songs' | 'scripture' while the operator chooses something to add
  let queue = Promise.resolve();
  let loading = false;      // true while an item loads, so a second Next item cannot skip one
  let openRowId = null;     // the row whose actions (Move up, Move down, Remove) are showing
  let dragId = null;        // the row being dragged

  /** Plan changes run one after another, so two quick edits never overwrite each other. */
  const enqueue = (job) => { queue = queue.then(job).catch(report); return queue; };

  async function commit(next) {
    plan = next;
    // A brand-new empty plan stays a draft until it gets an item or a name.
    if (store.get(plan.id) || plan.items.length || plan.name !== DEFAULT_PLAN_NAME) plan = await store.save(plan);
    store.setLastId(plan.id);
    render();
  }
  const edit = (change) => enqueue(() => commit(change(plan)));

  const openPlan = (next) => enqueue(async () => {
    plan = next;
    currentId = null;
    store.setLastId(plan.id);
    render();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  // ── Announcements and timers: the editor ──────────────────────────────────

  const draftItem = (draft) => (draft.type === 'announcement' ? announcementItem(draft) : timerItem(draft));

  /** Put a draft on air right now. The plan is not touched. */
  function showNow(draft) {
    const item = draftItem(draft);
    if (!tabs[draft.type].load(item)) { setStatus('That could not be loaded.', 'error'); return; }
    session.setTab(draft.type);
    if (tabs[draft.type].markShown) tabs[draft.type].markShown();
    session.show();
    setStatus(draft.type === 'timer' ? 'Timer is running.' : 'Announcement is live.', 'success');
  }

  const editor = initExtrasEditor({
    onAdd: (draft) => {
      edit((p) => addItem(p, draftItem(draft), currentId));
      setStatus('Added ' + (draft.title || draft.type) + ' to the plan.', 'success');
    },
    onSave: (draft, id) => {
      edit((p) => replaceItem(p, id, draftItem(draft)));
      setStatus('Saved.', 'success');
    },
    onShowNow: showNow,
  });

  function renderSelect() {
    const known = store.list();
    const entries = known.some((p) => p.id === plan.id) ? known : [...known, plan];
    select.replaceChildren(...entries.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
      const option = make('option', '', p.name);
      option.value = p.id;
      return option;
    }));
    select.value = plan.id;
  }

  function renderBanner() {
    const mode = library.mode();
    banner.classList.toggle('hidden', mode === 'folder');
    banner.classList.toggle('is-lost', mode === 'folder-lost');
    banner.textContent = BANNER_TEXT[mode] || '';
    const bad = store.unreadable();
    unreadableEl.classList.toggle('hidden', !bad.length);
    unreadableEl.textContent = bad.map((e) => 'Unreadable plan file: ' + e.file).join(' · ');
    picker.classList.toggle('hidden', !picking);
    pickerText.textContent = 'Adding to ' + plan.name;
  }

  function statusText(item, index, currentIndex) {
    const status = itemStatus(item, library);
    if (status !== 'ok') return status;
    if (item.id === currentId) {
      const pos = item.type === 'song' && tabs.songs ? tabs.songs.position() : null;
      if (pos && pos.songId === item.songId && pos.index !== null) return 'slide ' + (pos.index + 1) + '/' + pos.count;
      return 'loaded';
    }
    if (index < currentIndex) return 'done';
    if (item.type === 'song') {
      const count = library.get(item.songId).slides.length;
      return count + (count === 1 ? ' slide' : ' slides');
    }
    if (item.type === 'announcement') return 'announcement';
    if (item.type === 'timer') return describeTimerSpec(item);
    return item.translation || 'reading';
  }

  function renderRow(item, index, currentIndex) {
    const status = itemStatus(item, library);
    const li = make('li', 'plan-item' + (item.id === currentId ? ' cur' : '') + (index < currentIndex ? ' done' : '') + (status !== 'ok' ? ' missing' : ''));
    li.dataset.id = item.id;
    const grip = make('span', 'plan-grip', '≡');
    grip.setAttribute('aria-hidden', 'true');
    const icon = make('span', 'plan-icon', TYPE_ICON[item.type] || '?');
    const title = make('button', 'plan-title', itemTitle(item, library));
    title.type = 'button';
    title.addEventListener('click', () => loadItem(item));
    const state = make('span', 'plan-status', statusText(item, index, currentIndex));
    const more = make('button', 'plan-more', '⋯');
    more.type = 'button';
    more.setAttribute('aria-label', 'Actions for ' + itemTitle(item, library));
    more.setAttribute('aria-expanded', String(openRowId === item.id));
    more.addEventListener('click', () => { openRowId = openRowId === item.id ? null : item.id; render(); });
    li.append(grip, icon, title, state, more);
    if (openRowId === item.id) li.appendChild(renderActions(item, index));
    wireDrag(li, item);
    return li;
  }

  function renderNext() {
    const next = nextLoadable(plan, currentId, library);
    btnNext.disabled = !next;
    btnNext.textContent = !plan.items.length || next ? 'Next item \u00bb' : 'End of plan';
  }

  function actionButton(className, text, onClick) {
    const button = make('button', className, text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function renderActions(item, index) {
    const actions = make('div', 'row-actions');
    const up = actionButton('btn btn-ghost', 'Move up', () => edit((p) => moveItem(p, item.id, -1)));
    up.disabled = index === 0;
    const down = actionButton('btn btn-ghost', 'Move down', () => edit((p) => moveItem(p, item.id, 1)));
    down.disabled = index === plan.items.length - 1;
    const canEdit = item.type === 'announcement' || item.type === 'timer';
    const editButton = canEdit ? [actionButton('btn btn-ghost', 'Edit', () => editor.open({ type: item.type, item }))] : [];
    actions.append(...editButton, up, down, actionButton('btn btn-danger', 'Remove', () => removeRow(item.id)));
    return actions;
  }

  /** Removing the current item leaves its content loaded (and on air); current falls back to the item before it. */
  function removeRow(id) {
    enqueue(async () => {
      currentId = currentAfterRemove(plan, currentId, id);
      openRowId = null;
      await commit(removeItem(plan, id));
    });
  }

  function wireDrag(li, item) {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      dragId = item.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    });
    li.addEventListener('dragover', (e) => { if (dragId) e.preventDefault(); });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const moving = dragId;
      dragId = null;
      if (moving && moving !== item.id) edit((p) => moveItemTo(p, moving, indexOfItem(p, item.id)));
    });
    li.addEventListener('dragend', () => { dragId = null; });
  }


  function renderRows() {
    if (!plan.items.length) {
      listEl.replaceChildren(make('li', 'plan-empty faint', 'Nothing planned yet. Use + Song or + Verse, or press + Plan on a song or verse.'));
      return;
    }
    const currentIndex = indexOfItem(plan, currentId);
    listEl.replaceChildren(...plan.items.map((item, index) => renderRow(item, index, currentIndex)));
  }

  function render() {
    renderSelect();
    renderBanner();
    renderRows();
    renderNext();
    refresh();
  }

  // ── Adding ────────────────────────────────────────────────────────────────

  // ── Loading and moving between items ──────────────────────────────────────

  /** Load one item into the live bar. Never shows it: Show still decides what is on air. */
  async function loadItem(item) {
    if (loading) { setStatus('Still loading, try again in a moment.', ''); return; }
    const status = itemStatus(item, library);
    if (status !== 'ok') {
      setStatus(status === 'missing' ? 'That song is no longer in the library.' : 'This kind of item cannot be loaded yet.', 'error');
      return;
    }
    loading = true;
    try {
      if (item.type === 'song') {
        if (!tabs.songs.loadSong(item.songId)) { setStatus('Finish or discard the song you are editing first.', 'error'); return; }
        session.setTab('songs');
      } else if (item.type === 'announcement' || item.type === 'timer') {
        tabs[item.type].load(item);
        session.setTab(item.type);
      } else {
        const ok = await tabs.scripture.loadReading(item.ref, item.translation);
        if (ok === null) return;
        if (ok) session.setTab('scripture');
      }
      currentId = item.id;
      render();
    } finally {
      loading = false;
    }
  }

  async function nextItem() {
    const next = nextLoadable(plan, currentId, library);
    if (!next) { setStatus('End of the plan.', ''); return; }
    await loadItem(next);
  }

  async function prevItem() {
    const prev = prevLoadable(plan, currentId, library);
    if (!prev) { setStatus('Start of the plan.', ''); return; }
    await loadItem(prev);
  }

  function finishAdd(keepOpen, label) {
    setStatus('Added ' + label + ' to ' + plan.name + '.', 'success');
    if (picking && !keepOpen) {
      picking = null;
      showView('plan');
    }
  }

  async function addSong(songId, keepOpen = false) {
    await edit((p) => addItem(p, songItem(songId), currentId));
    const song = library.get(songId);
    finishAdd(keepOpen, song ? song.title : 'song');
  }

  async function addReading(ref, translation, keepOpen = false) {
    await edit((p) => addItem(p, readingItem(ref, translation), currentId));
    finishAdd(keepOpen, ref);
  }

  function startPicking(target) {
    picking = target;
    showView(target);
    if (target === 'scripture' && tabs.scripture) tabs.scripture.focus();
  }

  // ── Plan menu ─────────────────────────────────────────────────────────────

  function setMenu(open) {
    menu.classList.toggle('hidden', !open);
    btnMenu.setAttribute('aria-expanded', String(open));
  }

  btnMenu.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.classList.contains('hidden')); });
  menu.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== btnMenu) setMenu(false); });
  // Capture phase: while the menu is open, Escape only closes it and never reaches the Hide shortcut.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { setMenu(false); e.stopPropagation(); }
  }, true);

  $('plan-new').addEventListener('click', () => {
    const name = prompt('Name for the new plan:', '');
    if (name === null) return;
    enqueue(async () => { currentId = null; await commit(createPlan(name)); });
  });

  $('plan-rename').addEventListener('click', () => {
    const name = prompt('Rename this plan:', plan.name);
    if (name === null) return;
    edit((p) => renamePlan(p, name));
  });

  $('plan-duplicate').addEventListener('click', () => enqueue(async () => {
    if (!store.get(plan.id)) { setStatus('Add an item before duplicating this plan.', 'error'); return; }
    const copy = await store.duplicate(plan.id);
    plan = copy;
    currentId = null;
    store.setLastId(plan.id);
    render();
    setStatus('Duplicated as "' + copy.name + '".', 'success');
  }));

  $('plan-delete').addEventListener('click', () => {
    if (!confirm('Delete the plan "' + plan.name + '"? This cannot be undone.')) return;
    enqueue(async () => {
      await store.remove(plan.id);
      plan = createPlan();
      currentId = null;
      store.setLastId(null);
      render();
      setStatus('Plan deleted.', '');
    });
  });

  select.addEventListener('change', () => {
    const chosen = store.get(select.value);
    select.blur();
    if (chosen) openPlan(chosen);
  });

  $('btn-plan-add-announcement').addEventListener('click', () => editor.open({ type: 'announcement' }));
  $('btn-plan-add-timer').addEventListener('click', () => editor.open({ type: 'timer' }));
  btnNext.addEventListener('click', nextItem);
  $('btn-plan-add-song').addEventListener('click', () => startPicking('songs'));
  $('btn-plan-add-verse').addEventListener('click', () => startPicking('scripture'));
  $('picker-back').addEventListener('click', () => showView('plan'));

  // ── Outside hooks ─────────────────────────────────────────────────────────

  /** The library folder changed underneath us (attached, reconnected, released). */
  function reload() {
    enqueue(async () => {
      const fresh = store.get(plan.id) || store.get(store.lastId()) || store.list()[0];
      if (fresh) plan = fresh;
      if (indexOfItem(plan, currentId) === -1) currentId = null;
      render();
    });
  }

  function onView(name) {
    if (picking && name !== picking) picking = null;
    render();
  }

  render();

  return {
    render, reload, onView, addSong, addReading, nextItem, prevItem,
    isPicking: () => picking !== null,
    summary: () => planSummary(plan, currentId, library),
  };
}
