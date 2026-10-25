import { $ } from './util.js';
import { announcementFromInputs, timerFromInputs } from '../plan/extras.js';

/**
 * The inline editor for announcements and timers. It only reads and validates
 * the fields; what to do with a valid draft (add, save, show now) is decided by
 * the callbacks.
 */
export function initExtrasEditor({ onAdd, onSave, onShowNow }) {
  const root = $('extras-editor'), heading = $('ed-heading'), title = $('ed-title'), text = $('ed-text'),
        announcementFields = $('ed-announcement-fields'), timerFields = $('ed-timer-fields'),
        modeButtons = [...document.querySelectorAll('#ed-mode button')],
        durationFields = $('ed-duration-fields'), clockFields = $('ed-clock-fields'),
        minutes = $('ed-minutes'), seconds = $('ed-seconds'), clock = $('ed-clock'), hint = $('ed-hint'),
        btnAdd = $('ed-add'), btnShow = $('ed-show'), btnCancel = $('ed-cancel');

  let type = 'announcement';
  let mode = 'duration';
  let editingId = null;

  function read() {
    return type === 'announcement'
      ? announcementFromInputs({ title: title.value, body: text.value })
      : timerFromInputs({ mode, title: title.value, minutes: minutes.value, seconds: seconds.value, clock: clock.value });
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach((button) => {
      const on = button.dataset.value === mode;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    durationFields.classList.toggle('hidden', mode !== 'duration');
    clockFields.classList.toggle('hidden', mode !== 'clock');
  }

  function update() {
    const result = read();
    hint.textContent = result.ok ? '' : result.hint;
    btnAdd.disabled = !result.ok;
    btnShow.disabled = !result.ok;
  }

  function close() {
    root.classList.add('hidden');
    editingId = null;
  }

  function open({ type: nextType, item = null }) {
    type = nextType;
    editingId = item ? item.id : null;
    heading.textContent = (item ? 'Edit ' : 'New ') + (type === 'announcement' ? 'announcement' : 'timer');
    announcementFields.classList.toggle('hidden', type !== 'announcement');
    timerFields.classList.toggle('hidden', type !== 'timer');
    title.value = item ? (item.title || '') : '';
    text.value = item && type === 'announcement' ? (item.body || '') : '';
    setMode(item && item.mode === 'clock' ? 'clock' : 'duration');
    const total = item && item.mode === 'duration' && Number.isInteger(item.seconds) && item.seconds > 0 ? item.seconds : 0;
    minutes.value = total ? String(Math.floor(total / 60)) : '';
    seconds.value = total ? String(total % 60) : '';
    clock.value = item && item.mode === 'clock' ? (item.at || '') : '';
    btnAdd.textContent = item ? 'Save' : 'Add to plan';
    root.classList.remove('hidden');
    update();
    (type === 'announcement' ? text : minutes).focus();
  }

  [title, text, minutes, seconds, clock].forEach((field) => field.addEventListener('input', update));
  modeButtons.forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.value); update(); }));

  btnAdd.addEventListener('click', () => {
    const result = read();
    if (!result.ok) return;
    if (editingId) onSave(result.draft, editingId);
    else onAdd(result.draft);
    close();
  });
  btnShow.addEventListener('click', () => {
    const result = read();
    if (!result.ok) return;
    onShowNow(result.draft);
    close();
  });
  btnCancel.addEventListener('click', close);
  // Escape closes the editor and does not also reach the Hide shortcut.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });

  return { open, close, isOpen: () => !root.classList.contains('hidden') };
}
