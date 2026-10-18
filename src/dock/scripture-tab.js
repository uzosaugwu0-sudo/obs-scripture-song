import { $, highlightMatch } from './util.js';
import { BIBLE_BOOKS, bookIndexOf, searchBooks } from '../scripture/books.js';
import { LANGUAGES, TRANSLATIONS } from '../scripture/translations.js';
import { buildReference, stepReference } from '../scripture/reference.js';

export function initScriptureTab({ session, scripture, setStatus, saveCurrentSettings, refresh }) {
  // Scripture
  const refInput = $('ref-input'), btnLookup = $('btn-lookup'),
        bookSuggest = $('book-suggest'), languageSel = $('language-sel'),
        translationSel = $('translation-sel'), bookSel = $('book-sel'),
        chapterSel = $('chapter-sel'), verseSel = $('verse-sel'),
        btnGoto = $('btn-goto'), quickBooks = $('quick-books'),
        autoShowCb = $('auto-show-cb'), verseText = $('verse-text'),
        scriptureSearch = $('scripture-search'), btnScriptureSearch = $('btn-scripture-search'),
        searchResults = $('search-results'), randomScope = $('random-scope'),
        btnRandom = $('btn-random');

  // Quick reference boxes
  const qrBook = $('qr-book'), qrChapter = $('qr-chapter'),
        qrVerse = $('qr-verse'), qrGo = $('qr-go'),
        qrSuggest = $('qr-book-suggest'), qrHint = $('qr-hint');

  // Scripture
  let currentPlainRef = '';      // "John 3:16" — used for stepping
  let currentRefLabel = '';      // "John 3:16 — KJV" — what goes on screen
  let suggestIdx      = -1;
  let looking         = false;

  const QUICK_BOOKS = ['John','Romans','Psalms','Matthew','Genesis',
                       'Proverbs','Isaiah','Hebrews','Acts','Revelation'];

  // SCRIPTURE
  // ══════════════════════════════════════════════════════════════════════════

  function currentTranslation() { return translationSel.value || 'KJV'; }

  function buildLanguageSelect() {
    LANGUAGES.forEach(lang => {
      const o = document.createElement('option');
      o.value = lang; o.textContent = lang;
      languageSel.appendChild(o);
    });
    languageSel.value = 'English';
  }

  function buildTranslationSelect(keepKey) {
    const lang = languageSel.value;
    translationSel.innerHTML = '';
    TRANSLATIONS.filter(t => t.lang === lang).forEach(t => {
      const o = document.createElement('option');
      o.value = t.key;
      o.textContent = t.key + ' — ' + t.label;
      translationSel.appendChild(o);
    });
    if (keepKey && [...translationSel.options].some(o => o.value === keepKey)) {
      translationSel.value = keepKey;
    }
  }

  function buildBookSelect() {
    BIBLE_BOOKS.forEach(([name], i) => {
      const o = document.createElement('option');
      o.value = String(i + 1); o.textContent = name;
      bookSel.appendChild(o);
    });
  }

  function buildQuickBooks() {
    QUICK_BOOKS.forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quick-book';
      b.textContent = name;
      b.addEventListener('click', () => {
        const idx = BIBLE_BOOKS.findIndex(x => x[0] === name);
        if (idx === -1) return;
        bookSel.value = String(idx + 1);
        onBookChange();
        document.querySelectorAll('.quick-book').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
      quickBooks.appendChild(b);
    });
  }

  function onBookChange() {
    const id = parseInt(bookSel.value, 10);
    chapterSel.innerHTML = '';
    verseSel.innerHTML   = '';
    if (!id) {
      chapterSel.disabled = verseSel.disabled = btnGoto.disabled = true;
      return;
    }
    const chapters = BIBLE_BOOKS[id - 1][2];
    for (let c = 1; c <= chapters; c++) {
      const o = document.createElement('option');
      o.value = String(c); o.textContent = String(c);
      chapterSel.appendChild(o);
    }
    chapterSel.disabled = false;
    onChapterChange();
  }

  async function onChapterChange() {
    const bookId  = parseInt(bookSel.value, 10);
    const chapter = parseInt(chapterSel.value, 10);
    if (!bookId || !chapter) return;

    verseSel.innerHTML = '<option value="1">1</option>';
    verseSel.disabled  = true;
    btnGoto.disabled   = true;

    // The API knows how many verses a chapter really has. If it can't be
    // reached, fall back to a generous list rather than blocking the picker.
    const count = await scripture.fetchVerseCount(currentTranslation(), bookId, chapter) || 50;
    verseSel.innerHTML = '';
    for (let v = 1; v <= count; v++) {
      const o = document.createElement('option');
      o.value = String(v); o.textContent = String(v);
      verseSel.appendChild(o);
    }
    verseSel.disabled = false;
    btnGoto.disabled  = false;
  }

  function gotoFromPickers() {
    const bookId = parseInt(bookSel.value, 10);
    if (!bookId) return;
    const ref = buildReference(
      BIBLE_BOOKS[bookId - 1][0], chapterSel.value, verseSel.value);
    refInput.value = ref;
    lookup();
  }

  async function lookup(refOverride) {
    if (looking) return;
    const ref = (refOverride !== undefined ? refOverride : refInput.value).trim();
    if (!ref) { setStatus('Enter a reference first.', 'error'); return; }

    looking = true;
    btnLookup.disabled = true;
    setStatus('Looking up ' + ref + '…', 'loading');

    const result = await scripture.fetchVerse(ref, currentTranslation());

    looking = false;
    btnLookup.disabled = false;

    if (result.error) { setStatus(result.error, 'error'); return; }

    refInput.value   = result.rawRef;
    verseText.value  = result.text;
    currentPlainRef  = result.rawRef;
    currentRefLabel  = result.reference;
    hideSuggest();
    syncPickersTo(result);
    refresh();
    setStatus(result.reference, 'success');

    if (autoShowCb.checked) session.show();
  }

  async function stepVerse(dir) {
    if (!currentPlainRef) return;
    setStatus(dir > 0 ? 'Next verse…' : 'Previous verse…', 'loading');
    const next = await stepReference(currentPlainRef, dir, (bookId, chapter) => scripture.fetchVerseCount(currentTranslation(), bookId, chapter));
    if (!next) { setStatus('That is the end of the Bible.', ''); return; }

    const result = await scripture.fetchVerse(next, currentTranslation());
    if (result.error) { setStatus(result.error, 'error'); return; }

    refInput.value  = result.rawRef;
    verseText.value = result.text;
    currentPlainRef = result.rawRef;
    currentRefLabel = result.reference;
    syncPickersTo(result);
    refresh();
    setStatus(result.reference, 'success');

    // Stepping while live updates the screen straight away.
    if (session.isLive || autoShowCb.checked) session.show();
  }

  function syncPickersTo(result) {
    if (!result.bookId) return;

    // Keep the quick-reference boxes showing whatever was last looked up,
    // whether it came from a quick book, the dropdowns, search or random.
    const book = BIBLE_BOOKS[result.bookId - 1][0];
    qrBook.value    = book;
    qrChapter.value = result.chapter;
    qrVerse.value   = result.endVerse ? `${result.verse}-${result.endVerse}` : result.verse;
    qrBookIdx       = result.bookId - 1;

    bookSel.value = String(result.bookId);
    const chapters = BIBLE_BOOKS[result.bookId - 1][2];
    if (chapterSel.options.length !== chapters) {
      chapterSel.innerHTML = '';
      for (let c = 1; c <= chapters; c++) {
        const o = document.createElement('option');
        o.value = String(c); o.textContent = String(c);
        chapterSel.appendChild(o);
      }
      chapterSel.disabled = false;
    }
    chapterSel.value = String(result.chapter);
  }

  // ── Book autocomplete ─────────────────────────────────────────────────────

  function showSuggest(names) {
    bookSuggest.innerHTML = '';
    suggestIdx = -1;
    if (!names.length) { hideSuggest(); return; }
    names.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      li.addEventListener('mousedown', e => {   // mousedown beats blur
        e.preventDefault();
        refInput.value = name + ' ';
        hideSuggest();
        refInput.focus();
      });
      bookSuggest.appendChild(li);
    });
    bookSuggest.classList.remove('hidden');
  }

  function hideSuggest() {
    bookSuggest.classList.add('hidden');
    bookSuggest.innerHTML = '';
    suggestIdx = -1;
  }

  function moveSuggest(dir) {
    const items = [...bookSuggest.querySelectorAll('li')];
    if (!items.length) return;
    items.forEach(i => i.classList.remove('highlight'));
    suggestIdx = (suggestIdx + dir + items.length) % items.length;
    items[suggestIdx].classList.add('highlight');
    items[suggestIdx].scrollIntoView({ block: 'nearest' });
  }

  // ── Scripture search ──────────────────────────────────────────────────────

  async function runScriptureSearch() {
    const q = scriptureSearch.value.trim();
    if (!q) { setStatus('Type something to search for.', 'error'); return; }

    setStatus('Searching ' + currentTranslation() + '…', 'loading');
    const results = await scripture.searchScripture(currentTranslation(), q);

    if (results.error) { setStatus(results.error, 'error'); return; }
    if (!results.length) {
      searchResults.classList.add('hidden');
      setStatus('No results for "' + q + '".', '');
      return;
    }

    searchResults.innerHTML = '';
    results.forEach(r => {
      const ref = buildReference(r.book, r.chapter, r.verse);
      const li  = document.createElement('li');
      li.className = 'search-result';
      const refSpan = document.createElement('span');
      refSpan.className = 'search-result-ref';
      refSpan.textContent = ref;
      const txtSpan = document.createElement('span');
      txtSpan.className = 'search-result-text';
      txtSpan.innerHTML = highlightMatch(r.text, q);
      li.appendChild(refSpan);
      li.appendChild(txtSpan);
      li.addEventListener('click', () => { refInput.value = ref; lookup(ref); });
      searchResults.appendChild(li);
    });
    searchResults.classList.remove('hidden');
    setStatus(results.length + ' result' + (results.length !== 1 ? 's' : '') + '.', 'success');
  }

  async function pickRandom() {
    setStatus('Picking a verse…', 'loading');
    const r = await scripture.randomReference(currentTranslation(), randomScope.value);
    if (r.error) { setStatus(r.error, 'error'); return; }
    refInput.value = r.reference;
    await lookup(r.reference);
  }

  // ── Events: scripture ─────────────────────────────────────────────────────
  btnLookup.addEventListener('click', () => lookup());

  refInput.addEventListener('input', () => {
    const val = refInput.value;
    // Only suggest while the operator is still typing the book name.
    if (/\d/.test(val)) { hideSuggest(); return; }
    showSuggest(searchBooks(val));
  });

  refInput.addEventListener('keydown', e => {
    const open = !bookSuggest.classList.contains('hidden');
    if (e.key === 'ArrowDown' && open)      { e.preventDefault(); moveSuggest(1); }
    else if (e.key === 'ArrowUp' && open)   { e.preventDefault(); moveSuggest(-1); }
    else if (e.key === 'Escape')            { hideSuggest(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = bookSuggest.querySelector('li.highlight');
      if (open && hit) { refInput.value = hit.textContent + ' '; hideSuggest(); }
      else lookup();
    }
  });

  refInput.addEventListener('blur', () => setTimeout(hideSuggest, 120));

  // ── Quick Reference ───────────────────────────────────────────────────────
  // Three boxes, no punctuation to type. Focus moves forward on its own as
  // soon as each box can't take another digit, so a reference is usually
  // "john" Tab "3" "16" Enter without ever reaching for the colon key.
  let qrBookIdx = -1;   // index into BIBLE_BOOKS, or -1 when unresolved

  function qrSetHint(msg, isError) {
    qrHint.textContent = msg;
    qrHint.classList.toggle('is-error', !!isError);
  }

  function qrResetHint() {
    qrSetHint('Type the book, chapter and verse — it jumps between boxes for you.', false);
  }

  function qrHideSuggest() {
    qrSuggest.classList.add('hidden');
    qrSuggest.innerHTML = '';
  }

  function qrShowSuggest(names) {
    qrSuggest.innerHTML = '';
    if (!names.length) { qrHideSuggest(); return; }
    names.forEach((name, i) => {
      const li = document.createElement('li');
      li.textContent = name;
      if (i === 0) li.classList.add('highlight');
      // mousedown fires before blur, so the click isn't swallowed
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        qrPickBook(name);
      });
      qrSuggest.appendChild(li);
    });
    qrSuggest.classList.remove('hidden');
  }

  function qrMoveSuggest(dir) {
    const items = [...qrSuggest.querySelectorAll('li')];
    if (!items.length) return;
    let i = items.findIndex(el => el.classList.contains('highlight'));
    items.forEach(el => el.classList.remove('highlight'));
    i = Math.max(0, Math.min(items.length - 1, (i === -1 ? 0 : i + dir)));
    items[i].classList.add('highlight');
  }

  /** Lock in a book name and jump to the chapter box. */
  function qrPickBook(name) {
    qrBook.value = name;
    qrBookIdx    = bookIndexOf(name);
    qrHideSuggest();
    qrSetHint(qrBookIdx !== -1
      ? `${BIBLE_BOOKS[qrBookIdx][0]} — ${BIBLE_BOOKS[qrBookIdx][2]} chapters`
      : `No book called "${name}".`, qrBookIdx === -1);
    if (qrBookIdx !== -1) qrChapter.focus();
  }

  /** Resolve whatever is typed in the book box without moving focus. */
  function qrResolveBook() {
    qrBookIdx = bookIndexOf(qrBook.value);
    return qrBookIdx;
  }

  /** Build the reference and hand it to the existing lookup path. */
  function qrLookup() {
    if (qrResolveBook() === -1) {
      qrSetHint(qrBook.value.trim()
        ? `No book called "${qrBook.value.trim()}".`
        : 'Type a book name first.', true);
      qrBook.focus();
      return;
    }
    const [name, , chapters] = BIBLE_BOOKS[qrBookIdx];
    const ch = parseInt(qrChapter.value, 10);
    if (!ch || ch < 1 || ch > chapters) {
      qrSetHint(`${name} has ${chapters} chapter${chapters !== 1 ? 's' : ''}.`, true);
      qrChapter.focus();
      qrChapter.select();
      return;
    }
    // The verse box also accepts a range, e.g. 28-30.
    const raw = qrVerse.value.trim();
    const m   = raw.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) {
      qrSetHint('Enter a verse number, or a range like 28-30.', true);
      qrVerse.focus();
      qrVerse.select();
      return;
    }
    qrResetHint();
    const ref = buildReference(name, ch, parseInt(m[1], 10),
                                        m[2] ? parseInt(m[2], 10) : null);
    refInput.value = ref;
    lookup(ref);
  }

  qrBook.addEventListener('input', () => {
    qrBookIdx = -1;
    qrShowSuggest(searchBooks(qrBook.value.trim()));
  });

  qrBook.addEventListener('keydown', e => {
    const open = !qrSuggest.classList.contains('hidden');
    if (e.key === 'ArrowDown' && open)    { e.preventDefault(); qrMoveSuggest(1); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); qrMoveSuggest(-1); }
    else if (e.key === 'Escape')          { qrHideSuggest(); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const hit = open ? qrSuggest.querySelector('li.highlight') : null;
      if (hit) { e.preventDefault(); qrPickBook(hit.textContent); }
      else if (e.key === 'Enter') { e.preventDefault(); qrPickBook(qrBook.value.trim()); }
    }
  });

  qrBook.addEventListener('blur', () => setTimeout(() => {
    qrHideSuggest();
    if (qrBook.value.trim() && qrResolveBook() === -1) {
      qrSetHint(`No book called "${qrBook.value.trim()}".`, true);
    }
  }, 120));

  // Chapter: advance as soon as no further digit could make a valid chapter.
  // In John (21 chapters) typing "3" jumps straight on, while "1" waits
  // because 10–19 are still possible.
  qrChapter.addEventListener('input', () => {
    qrChapter.value = qrChapter.value.replace(/\D/g, '');
    if (qrResolveBook() === -1) return;
    const chapters = BIBLE_BOOKS[qrBookIdx][2];
    const n = parseInt(qrChapter.value, 10);
    if (!n) return;
    if (n > chapters) {
      qrSetHint(`${BIBLE_BOOKS[qrBookIdx][0]} has ${chapters} chapters.`, true);
      return;
    }
    qrResetHint();
    if (n * 10 > chapters) qrVerse.focus();
  });

  qrChapter.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); qrVerse.focus(); }
    // Backspace on an empty box steps back to the book
    else if (e.key === 'Backspace' && !qrChapter.value) { qrBook.focus(); }
  });

  qrVerse.addEventListener('input', () => {
    qrVerse.value = qrVerse.value.replace(/[^\d-]/g, '');
  });

  qrVerse.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); qrLookup(); }
    else if (e.key === 'Backspace' && !qrVerse.value) { qrChapter.focus(); }
  });

  qrGo.addEventListener('click', qrLookup);
  qrResetHint();

  languageSel.addEventListener('change', () => { buildTranslationSelect(); saveCurrentSettings(); });
  translationSel.addEventListener('change', () => {
    saveCurrentSettings();
    if (chapterSel.value) onChapterChange();
    if (currentPlainRef) lookup(currentPlainRef);
  });

  bookSel.addEventListener('change', onBookChange);
  chapterSel.addEventListener('change', onChapterChange);
  btnGoto.addEventListener('click', gotoFromPickers);

  verseText.addEventListener('input', refresh);
  autoShowCb.addEventListener('change', saveCurrentSettings);

  btnScriptureSearch.addEventListener('click', runScriptureSearch);
  scriptureSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); runScriptureSearch(); }
  });
  btnRandom.addEventListener('click', pickRandom);

  buildLanguageSelect();
  buildTranslationSelect('KJV');
  buildBookSelect();
  buildQuickBooks();

  return {
    getContent: () => ({ body: verseText.value.trim(), reference: currentRefLabel }),
    hasText: () => verseText.value.trim().length > 0,
    plainRef: () => currentPlainRef,
    step: stepVerse,
    buildTranslationSelect,
    setLanguage(lang) { if (LANGUAGES.includes(lang)) languageSel.value = lang; },
    setAutoShow(on) { autoShowCb.checked = !!on; },
    autoShow: () => autoShowCb.checked,
  };
}
