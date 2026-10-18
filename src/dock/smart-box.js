import { $ } from './util.js';
import { BIBLE_BOOKS } from '../scripture/books.js';
import { classifyInput, dropdownRows } from '../scripture/smart-input.js';

const QUICK_BOOKS = ['John', 'Romans', 'Psalms', 'Matthew', 'Genesis', 'Proverbs', 'Isaiah', 'Hebrews', 'Acts', 'Revelation'];
const BLUR_CLOSE_MS = 120;

/**
 * The one box for a reference, a book name or a word search, with its dropdown
 * and the quick-book chips. It only decides and reports: onReference(text) and
 * onSearch(query) do the actual lookups.
 */
export function initSmartBox({ onReference, onSearch, setStatus }) {
  const input = $('smart-input'), list = $('smart-list'), chips = $('quick-books');
  let rows = [];
  let highlight = -1;

  function close() {
    list.classList.add('hidden');
    list.replaceChildren();
    rows = [];
    highlight = -1;
  }

  function paintHighlight() {
    [...list.children].forEach((li, i) => li.classList.toggle('hi', i === highlight));
  }

  function setBook(name) {
    input.value = name + ' ';
    input.focus();
    render();
    const book = BIBLE_BOOKS.find((b) => b[0] === name);
    if (book) setStatus(book[0] + ' has ' + book[2] + ' chapters. Type a chapter and verse.', '');
  }

  function pick(row) {
    if (row.type === 'book') { setBook(row.name); return; }
    close();
    onSearch(row.query);
  }

  function render() {
    rows = dropdownRows(input.value);
    highlight = -1;
    if (!rows.length) { close(); return; }
    list.replaceChildren(...rows.map((row) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      if (row.type === 'book') {
        li.textContent = row.name;
        const book = BIBLE_BOOKS.find((b) => b[0] === row.name);
        const small = document.createElement('small');
        small.textContent = (book ? book[2] : '') + ' chapters';
        li.appendChild(small);
      } else {
        li.textContent = 'Search verses for "' + row.query + '"';
      }
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(row); });   // mousedown beats blur
      return li;
    }));
    list.classList.remove('hidden');
  }

  function submit() {
    const result = classifyInput(input.value);
    if (result.kind === 'empty') { setStatus('Enter a reference or some words first.', 'error'); return; }
    if (result.kind === 'reference') { close(); onReference(result.reference); return; }
    if (result.kind === 'book') { setBook(BIBLE_BOOKS[result.bookIndex][0]); return; }
    close();
    onSearch(result.query);
  }

  function move(dir) {
    if (!rows.length) return;
    highlight = highlight === -1
      ? (dir > 0 ? 0 : rows.length - 1)
      : (highlight + dir + rows.length) % rows.length;
    paintHighlight();
  }

  input.addEventListener('input', render);
  input.addEventListener('blur', () => setTimeout(close, BLUR_CLOSE_MS));
  input.addEventListener('keydown', (e) => {
    const open = !list.classList.contains('hidden');
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlight >= 0) pick(rows[highlight]); else submit();
    }
  });

  QUICK_BOOKS.forEach((name) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = name;
    chip.addEventListener('click', () => setBook(name));
    chips.appendChild(chip);
  });

  return {
    setValue(text) { input.value = text; close(); },
    focus() { input.focus(); },
  };
}
