import { $ } from './util.js';
import { createPlan, addItem, songItem, readingItem, renamePlan, DEFAULT_PLAN_NAME } from '../plan/model.js';
import { itemStatus, itemTitle, indexOfItem, planSummary } from '../plan/cursor.js';

const TYPE_ICON = { song: '♫', reading: '✝' };
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
        picker = $('picker-banner'), pickerText = $('picker-text');

  let plan = store.get(store.lastId()) || store.list()[0] || createPlan();
  let currentId = null;     // the item most recently loaded from the plan
  let picking = null;       // 'songs' | 'scripture' while the operator chooses something to add
  let queue = Promise.resolve();

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
    if (index < currentIndex) return 'done';
    if (item.type === 'song') {
      const count = library.get(item.songId).slides.length;
      return count + (count === 1 ? ' slide' : ' slides');
    }
    return item.translation || 'reading';
  }

  function renderRow(item, index, currentIndex) {
    const status = itemStatus(item, library);
    const li = make('li', 'plan-item' + (item.id === currentId ? ' cur' : '') + (index < currentIndex ? ' done' : '') + (status !== 'ok' ? ' missing' : ''));
    li.dataset.id = item.id;
    const grip = make('span', 'plan-grip', '≡');
    grip.setAttribute('aria-hidden', 'true');
    const icon = make('span', 'plan-icon', TYPE_ICON[item.type] || '?');
    const title = make('span', 'plan-title', itemTitle(item, library));
    const state = make('span', 'plan-status', statusText(item, index, currentIndex));
    li.append(grip, icon, title, state);
    return li;
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
    refresh();
  }

  // ── Adding ────────────────────────────────────────────────────────────────

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
    render, reload, onView, addSong, addReading,
    summary: () => planSummary(plan, currentId, library),
  };
}
