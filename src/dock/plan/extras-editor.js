import { $ } from '../shared/util.js';
import { announcementFromInputs, timerFromInputs, lowerThirdFromInputs } from '../../plan/extras.js';

const NO_FOLDER_HINT = 'Choose a library folder in Songs > Library tools to use pictures.';
const NAMES = { announcement: 'announcement', timer: 'timer', lowerthird: 'lower third' };

/**
 * The inline editor for announcements, timers and lower thirds. It only reads
 * and validates the fields; what to do with a valid draft (add, save, show now)
 * is decided by the callbacks.
 */
export function initExtrasEditor({ logoStore, onAdd, onSave, onShowNow }) {
  const root = $('extras-editor'), heading = $('ed-heading'), titleField = $('ed-title-field'), title = $('ed-title'), text = $('ed-text'),
        announcementFields = $('ed-announcement-fields'), timerFields = $('ed-timer-fields'), lowerFields = $('ed-lowerthird-fields'),
        modeButtons = [...document.querySelectorAll('#ed-mode button')],
        durationFields = $('ed-duration-fields'), clockFields = $('ed-clock-fields'),
        minutes = $('ed-minutes'), seconds = $('ed-seconds'), clock = $('ed-clock'),
        ltName = $('ed-lt-name'), ltInfo = $('ed-lt-info'), ltHide = $('ed-lt-hide'), ltLogo = $('ed-lt-logo'),
        ltAddLogo = $('ed-lt-add-logo'), ltFile = $('ed-lt-file'), ltLogoHint = $('ed-lt-logo-hint'),
        alignButtons = [...document.querySelectorAll('#ed-lt-align button')],
        hint = $('ed-hint'), btnAdd = $('ed-add'), btnShow = $('ed-show'), btnCancel = $('ed-cancel');

  let type = 'announcement';
  let mode = 'duration';
  let align = 'left';
  let editingId = null;

  function read() {
    if (type === 'announcement') return announcementFromInputs({ title: title.value, body: text.value });
    if (type === 'timer') return timerFromInputs({ mode, title: title.value, minutes: minutes.value, seconds: seconds.value, clock: clock.value });
    return lowerThirdFromInputs({ name: ltName.value, info: ltInfo.value, align, logo: ltLogo.value, hideAfter: ltHide.value });
  }

  function setPressed(buttons, value) {
    buttons.forEach((button) => {
      const on = button.dataset.value === value;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function setMode(next) {
    mode = next;
    setPressed(modeButtons, mode);
    durationFields.classList.toggle('hidden', mode !== 'duration');
    clockFields.classList.toggle('hidden', mode !== 'clock');
  }

  function setAlign(next) {
    align = next;
    setPressed(alignButtons, align);
  }

  /** The picture drop-down: No picture, the files in logos/, and a missing one the item still points at. */
  function fillLogos(selected) {
    const names = logoStore.list();
    const choices = selected && !names.includes(selected) ? [...names, selected] : names;
    ltLogo.replaceChildren(...['', ...choices].map((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name === '' ? 'No picture' : (names.includes(name) ? name : name + ' (missing)');
      return option;
    }));
    ltLogo.value = selected || '';
    const usable = logoStore.available();
    ltLogo.disabled = !usable;
    ltAddLogo.disabled = !usable;
    ltLogoHint.textContent = usable ? '' : NO_FOLDER_HINT;
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
    heading.textContent = (item ? 'Edit ' : 'New ') + NAMES[type];
    titleField.classList.toggle('hidden', type === 'lowerthird');
    announcementFields.classList.toggle('hidden', type !== 'announcement');
    timerFields.classList.toggle('hidden', type !== 'timer');
    lowerFields.classList.toggle('hidden', type !== 'lowerthird');
    title.value = item && type !== 'lowerthird' ? (item.title || '') : '';
    text.value = item && type === 'announcement' ? (item.body || '') : '';
    setMode(item && item.mode === 'clock' ? 'clock' : 'duration');
    const total = item && item.mode === 'duration' && Number.isInteger(item.seconds) && item.seconds > 0 ? item.seconds : 0;
    minutes.value = total ? String(Math.floor(total / 60)) : '';
    seconds.value = total ? String(total % 60) : '';
    clock.value = item && item.mode === 'clock' ? (item.at || '') : '';
    ltName.value = item && type === 'lowerthird' ? (item.name || '') : '';
    ltInfo.value = item && type === 'lowerthird' ? (item.info || '') : '';
    ltHide.value = item && type === 'lowerthird' && item.hideAfter ? String(item.hideAfter) : '';
    setAlign(item && type === 'lowerthird' && item.align ? item.align : 'left');
    fillLogos(item && type === 'lowerthird' ? (item.logo || '') : '');
    btnAdd.textContent = item ? 'Save' : 'Add to plan';
    root.classList.remove('hidden');
    update();
    ({ announcement: text, timer: minutes, lowerthird: ltName })[type].focus();
  }

  [title, text, minutes, seconds, clock, ltName, ltInfo, ltHide].forEach((field) => field.addEventListener('input', update));
  ltLogo.addEventListener('change', update);
  modeButtons.forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.value); update(); }));
  alignButtons.forEach((button) => button.addEventListener('click', () => { setAlign(button.dataset.value); update(); }));

  ltAddLogo.addEventListener('click', () => ltFile.click());
  ltFile.addEventListener('change', async () => {
    const file = ltFile.files[0];
    ltFile.value = '';
    if (!file) return;
    try {
      const name = await logoStore.add(file);
      fillLogos(name);
      update();
    } catch (err) {
      ltLogoHint.textContent = err.message || 'That picture could not be added.';
    }
  });

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
