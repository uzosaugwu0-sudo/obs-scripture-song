import { $, highlightMatch } from './util.js';
import { LANGUAGES, TRANSLATIONS } from '../scripture/translations.js';
import { buildReference, stepReference } from '../scripture/reference.js';
import { initSmartBox } from './smart-box.js';

export function initScriptureTab({ session, scripture, store, setStatus, refresh }) {
  const verseText = $('verse-text'), languageSel = $('language-sel'), translationSel = $('translation-sel'),
        autoShowCb = $('auto-show-cb'), randomScope = $('random-scope'), btnRandom = $('btn-random'),
        results = $('search-results');

  let plainRef = '';   // "John 3:16", used for stepping
  let refLabel = '';   // "John 3:16 - KJV", what goes on screen
  let busy = false;

  const translation = () => translationSel.value || 'KJV';

  function fillLanguages() {
    LANGUAGES.forEach((lang) => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang;
      languageSel.appendChild(option);
    });
  }

  function fillTranslations(keepKey) {
    translationSel.replaceChildren(...TRANSLATIONS.filter((t) => t.lang === languageSel.value).map((t) => {
      const option = document.createElement('option');
      option.value = t.key;
      option.textContent = t.key + ' - ' + t.label;
      return option;
    }));
    if (keepKey && [...translationSel.options].some((o) => o.value === keepKey)) translationSel.value = keepKey;
  }

  function hideResults() {
    results.classList.add('hidden');
    results.replaceChildren();
  }

  function apply(result) {
    verseText.value = result.text;
    plainRef = result.rawRef;
    refLabel = result.reference;
    smart.setValue(result.rawRef);
    hideResults();
    refresh();
    setStatus(result.reference, 'success');
  }

  async function lookup(reference) {
    if (busy) return;
    busy = true;
    setStatus('Looking up ' + reference + '...', 'loading');
    const result = await scripture.fetchVerse(reference, translation());
    busy = false;
    if (result.error) { setStatus(result.error, 'error'); return; }
    apply(result);
    if (autoShowCb.checked) session.show();
  }

  async function step(dir) {
    if (!plainRef || busy) return;
    busy = true;
    setStatus(dir > 0 ? 'Next verse...' : 'Previous verse...', 'loading');
    const next = await stepReference(plainRef, dir,
      (bookId, chapter) => scripture.fetchVerseCount(translation(), bookId, chapter));
    if (!next) { busy = false; setStatus('That is the end of the Bible.', ''); return; }
    const result = await scripture.fetchVerse(next, translation());
    busy = false;
    if (result.error) { setStatus(result.error, 'error'); return; }
    apply(result);
    if (session.isLive || autoShowCb.checked) session.show();
  }

  async function runSearch(query) {
    setStatus('Searching ' + translation() + '...', 'loading');
    const found = await scripture.searchScripture(translation(), query);
    if (found.error) { hideResults(); setStatus(found.error, 'error'); return; }
    if (!found.length) { hideResults(); setStatus('No results for "' + query + '".', ''); return; }
    results.replaceChildren(...found.map((r) => {
      const ref = buildReference(r.book, r.chapter, r.verse);
      const li = document.createElement('li');
      const refEl = document.createElement('span');
      refEl.className = 'ref';
      refEl.textContent = ref;
      const textEl = document.createElement('span');
      textEl.innerHTML = highlightMatch(r.text, query);
      li.append(refEl, textEl);
      li.addEventListener('click', () => { lookup(ref); });
      return li;
    }));
    results.classList.remove('hidden');
    setStatus(found.length + ' result' + (found.length === 1 ? '' : 's') + '.', 'success');
  }

  const smart = initSmartBox({ onReference: lookup, onSearch: runSearch, setStatus });

  const saved = store.get();
  fillLanguages();
  languageSel.value = LANGUAGES.includes(saved.language) ? saved.language : 'English';
  fillTranslations(saved.translation || 'KJV');
  autoShowCb.checked = !!saved.autoShow;

  languageSel.addEventListener('change', () => {
    fillTranslations();
    store.update({ language: languageSel.value, translation: translation() });
  });
  translationSel.addEventListener('change', () => {
    store.update({ translation: translation() });
    if (plainRef) lookup(plainRef);
  });
  autoShowCb.addEventListener('change', () => store.update({ autoShow: autoShowCb.checked }));
  verseText.addEventListener('input', refresh);
  btnRandom.addEventListener('click', async () => {
    setStatus('Picking a verse...', 'loading');
    const picked = await scripture.randomReference(translation(), randomScope.value);
    if (picked.error) { setStatus(picked.error, 'error'); return; }
    await lookup(picked.reference);
  });

  return {
    getContent: () => ({ body: verseText.value.trim(), reference: refLabel }),
    preview() {
      const body = verseText.value.trim();
      return {
        has: body.length > 0,
        text: body || 'Nothing loaded',
        sub: body ? (refLabel || 'Edited text') : 'Look up a verse to preview',
        canNav: !!plainRef,
      };
    },
    step,
    focus: () => smart.focus(),
  };
}
