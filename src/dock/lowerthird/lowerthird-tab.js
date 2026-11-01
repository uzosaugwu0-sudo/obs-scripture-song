import { $ } from '../shared/util.js';
import { lowerThirdItem } from '../../plan/model.js';
import { describeLowerThird } from '../../plan/extras.js';

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * The Lower third tab: a saved list of lower thirds, independent of any plan. Show and Hide
 * go through the same lower third tab and session as the plan does, so a lower third still
 * takes turns with the card on screen.
 */
export function initLowerThirdTab({ session, store, tabs, editor, logoStore, setStatus }) {
  const listEl = $('lt-list'), emptyEl = $('lt-empty'), host = $('lt-editor-host'), btnNew = $('btn-lt-new');

  /** On air means the screen shows this item's words, so a lower third shown from the plan does not mark a saved one. */
  const onAir = (item) => {
    const live = session.liveContent;
    return session.isLive && session.liveTab === 'lowerthird' && !!live && live.title === item.name && live.body === item.info;
  };

  async function show(item) {
    const tab = tabs.lowerthird;
    if (!tab.load(item)) { setStatus('That could not be loaded.', 'error'); return; }
    session.setTab('lowerthird');
    await tab.ready();   // never on air before its picture has been read
    if (session.activeTab !== 'lowerthird') return;
    tab.markShown();
    session.show();
    setStatus('Lower third is live.', 'success');
  }

  const handlers = {
    onAdd: async (draft) => { await store.save(lowerThirdItem(draft)); render(); setStatus('Saved.', 'success'); },
    onSave: async (draft, id) => { await store.save({ ...lowerThirdItem(draft), id }); render(); setStatus('Saved.', 'success'); },
    onShowNow: (draft) => show(lowerThirdItem(draft)),
  };

  const openEditor = (item = null) => editor.open({ type: 'lowerthird', item, host, addLabel: 'Save', handlers });

  function renderRow(item) {
    const live = onAir(item);
    const li = make('li', 'lt-item' + (live ? ' cur' : ''));
    const text = make('div', 'lt-text');
    text.append(make('strong', 'lt-name', item.name || item.info));
    const missing = item.logo && !logoStore.has(item.logo);
    text.append(make('span', 'lt-info', [item.name ? item.info : '', missing ? 'picture missing' : describeLowerThird(item)].filter(Boolean).join(' · ')));
    const toggle = make('button', 'btn ' + (live ? 'btn-danger' : 'btn-primary'), live ? 'Hide' : 'Show');
    toggle.type = 'button';
    toggle.addEventListener('click', () => (live ? session.hide() : show(item)));
    const edit = make('button', 'btn btn-ghost', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openEditor(item));
    const del = make('button', 'btn btn-ghost', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete ' + (item.name || item.info));
    del.addEventListener('click', async () => {
      if (!confirm('Delete "' + (item.name || item.info) + '"? This cannot be undone.')) return;
      await store.remove(item.id);
      render();
    });
    li.append(text, toggle, edit, del);
    return li;
  }

  function render() {
    const items = store.list();
    emptyEl.classList.toggle('hidden', items.length > 0);
    listEl.replaceChildren(...items.map(renderRow));
  }

  btnNew.addEventListener('click', () => openEditor());
  render();
  return { render };
}
