import { $ } from './util.js';
import { FONTS } from '../core/fonts.js';
import { defaultShowCard } from '../overlay/style-math.js';
import { bindSegmented } from './segmented.js';
import { readBackgroundImage } from './bg-image.js';

export function initStyleTab({ session, store, setStatus, report }) {
  const fontSel = $('font-sel'), btnItalic = $('btn-italic'),
        opacitySlider = $('opacity-slider'), opacityValue = $('opacity-value'),
        scaleSlider = $('scale-slider'), scaleValue = $('scale-value'),
        showCardCb = $('show-card-cb'), showTitleCb = $('show-title-cb'), showRefCb = $('show-ref-cb'),
        customSection = $('custom-colors-section'), colorBg = $('color-bg'), colorText = $('color-text'),
        colorAccent = $('color-accent'), btnBgImage = $('btn-bg-image'), btnBgClear = $('btn-bg-clear'),
        bgName = $('bg-image-name'), bgInput = $('bg-image-input');

  FONTS.forEach((font) => {
    const option = document.createElement('option');
    option.value = font.value;
    option.textContent = font.label;
    fontSel.appendChild(option);
  });

  /** Paint every control from the store. */
  function sync() {
    const s = store.get();
    fontSel.value = s.font;
    btnItalic.setAttribute('aria-pressed', String(!!s.italic));
    btnItalic.classList.toggle('on', !!s.italic);
    opacitySlider.value = String(s.opacity);
    opacityValue.textContent = s.opacity + '%';
    scaleSlider.value = String(s.scale);
    scaleValue.textContent = s.scale + '%';
    showCardCb.checked = s.showCard !== false;
    showTitleCb.checked = s.showTitle !== false;
    showRefCb.checked = s.showReference !== false;
    customSection.classList.toggle('hidden', s.theme !== 'custom');
    colorBg.value = s.customColors.bg;
    colorText.value = s.customColors.text;
    colorAccent.value = s.customColors.accent;
    btnBgClear.classList.toggle('hidden', !s.bgImage);
    bgName.textContent = s.bgImage ? 'Custom image in use' : 'None, using the theme colour';
    segments.forEach((segment) => segment.paint());
  }

  function change(patch) {
    store.update(patch);
    session.resendIfLive();
    sync();
  }

  const segments = [
    bindSegmented($('theme-swatches'), {
      get: () => store.get().theme,
      set: (theme) => change({ theme, showCard: defaultShowCard(theme) }),
    }),
    bindSegmented($('anim-seg'), { get: () => store.get().animation, set: (animation) => change({ animation }) }),
    bindSegmented($('position-seg'), { get: () => store.get().position, set: (position) => change({ position }) }),
    bindSegmented($('size-seg'), { get: () => store.get().fontSize, set: (fontSize) => change({ fontSize }) }),
  ];

  fontSel.addEventListener('change', () => change({ font: fontSel.value }));
  btnItalic.addEventListener('click', () => change({ italic: !store.get().italic }));
  opacitySlider.addEventListener('input', () => change({ opacity: Number(opacitySlider.value) }));
  scaleSlider.addEventListener('input', () => change({ scale: Number(scaleSlider.value) }));
  showCardCb.addEventListener('change', () => change({ showCard: showCardCb.checked }));
  showTitleCb.addEventListener('change', () => change({ showTitle: showTitleCb.checked }));
  showRefCb.addEventListener('change', () => change({ showReference: showRefCb.checked }));
  [colorBg, colorText, colorAccent].forEach((input) => input.addEventListener('input', () => {
    change({ customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value } });
  }));

  btnBgImage.addEventListener('click', () => bgInput.click());
  bgInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    bgInput.value = '';
    if (!file) return;
    try {
      change({ bgImage: await readBackgroundImage(file) });
      setStatus('Background image set.', 'success');
    } catch (err) {
      report(err);
      setStatus(err.message, 'error');
    }
  });
  btnBgClear.addEventListener('click', () => {
    change({ bgImage: null });
    setStatus('Background image removed.', '');
  });

  sync();
}
