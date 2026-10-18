import { $ } from './util.js';
import { FONTS } from '../core/fonts.js';
import { DEFAULTS } from '../core/state.js';
import { saveSettings } from '../core/settings.js';

export function initDisplaySettings({ session, setStatus, applyScriptureSettings, onError }) {
  const persist = (settings) => saveSettings(settings, { onError });

  // elements owned by the scripture tab but saved with the display settings
  const languageSel = $('language-sel'), translationSel = $('translation-sel'), autoShowCb = $('auto-show-cb');

  const themeSel = $('theme-sel'), positionSel = $('position-sel'),
        fontsizeSel = $('fontsize-sel'), animationSel = $('animation-sel'),
        fontSel = $('font-sel'), btnItalic = $('btn-italic'),
        opacitySlider = $('opacity-slider'), opacityValue = $('opacity-value'),
        scaleSlider = $('scale-slider'), scaleValue = $('scale-value'),
        showCardCb = $('show-card-cb'), showTitleCb = $('show-title-cb'),
        showRefCb = $('show-ref-cb'), customColorsSection = $('custom-colors-section'),
        colorBg = $('color-bg'), colorText = $('color-text'), colorAccent = $('color-accent'),
        btnBgImage = $('btn-bg-image'), btnBgClear = $('btn-bg-clear'),
        bgImageName = $('bg-image-name'), bgImageInput = $('bg-image-input');

  let isItalic    = false;
  let bgImageData = null;

  FONTS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.value; o.textContent = f.label;
    fontSel.appendChild(o);
  });

  function saveCurrentSettings() {
    persist({
      theme: themeSel.value, position: positionSel.value,
      fontSize: fontsizeSel.value, animation: animationSel.value,
      font: fontSel.value, italic: isItalic,
      opacity: parseInt(opacitySlider.value, 10),
      scale: parseInt(scaleSlider.value, 10),
      showCard: showCardCb.checked, showTitle: showTitleCb.checked,
      showReference: showRefCb.checked,
      bgImage: bgImageData, bgMode: bgImageData ? 'image' : 'color',
      language: languageSel.value, translation: translationSel.value,
      autoShow: autoShowCb.checked,
      customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value },
    });
  }

  function applySettings(s) {
    themeSel.value     = s.theme     || 'dark';
    positionSel.value  = s.position  || 'bottom';
    fontsizeSel.value  = s.fontSize  || 'md';
    animationSel.value = s.animation || 'fade';
    fontSel.value      = s.font      || 'Open Sans';
    isItalic           = !!s.italic;
    btnItalic.classList.toggle('active', isItalic);

    opacitySlider.value      = s.opacity !== undefined ? s.opacity : 88;
    opacityValue.textContent = opacitySlider.value + '%';
    scaleSlider.value        = s.scale !== undefined ? s.scale : 100;
    scaleValue.textContent   = scaleSlider.value + '%';

    showCardCb.checked  = s.showCard !== false;
    showTitleCb.checked = s.showTitle !== false;
    showRefCb.checked   = s.showReference !== false;

    const c = s.customColors || DEFAULTS.customColors;
    colorBg.value     = c.bg     || '#0a0a14';
    colorText.value   = c.text   || '#ffffff';
    colorAccent.value = c.accent || '#a78bfa';

    applyScriptureSettings(s);

    bgImageData = s.bgImage || null;
    updateBgUI();
    updateThemeUI();
  }

  function updateThemeUI() {
    customColorsSection.style.display = themeSel.value === 'custom' ? '' : 'none';
  }

  function updateBgUI() {
    if (bgImageData) {
      bgImageName.textContent      = 'Custom image in use';
      btnBgClear.style.display     = '';
    } else {
      bgImageName.textContent      = 'None — using theme colour';
      btnBgClear.style.display     = 'none';
    }
  }

  /**
   * Background images are downscaled before storage. A full-size photo as a
   * data URL can exceed the localStorage quota on its own, which would stop
   * every later state update from saving — a failure that would only show up
   * mid-service.
   */
  function loadBgImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW  = 1920;
        const ratio = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          bgImageData = canvas.toDataURL('image/jpeg', 0.85);
        } catch (_) {
          bgImageData = e.target.result;
        }
        updateBgUI();
        saveCurrentSettings();
        session.resendIfLive();
        setStatus('Background image set.', 'success');
      };
      img.onerror = () => setStatus('That image could not be read.', 'error');
      img.src = e.target.result;
    };
    reader.onerror = () => setStatus('That image could not be read.', 'error');
    reader.readAsDataURL(file);
  }

  function readSettings() {
    return {
      theme: themeSel.value, position: positionSel.value, fontSize: fontsizeSel.value,
      animation: animationSel.value, font: fontSel.value, italic: isItalic,
      opacity: parseInt(opacitySlider.value, 10), scale: parseInt(scaleSlider.value, 10),
      showCard: showCardCb.checked, showTitle: showTitleCb.checked, showReference: showRefCb.checked,
      bgMode: bgImageData ? 'image' : 'color', bgImage: bgImageData,
      customColors: { bg: colorBg.value, text: colorText.value, accent: colorAccent.value },
    };
  }

  // ── Events: display settings ──────────────────────────────────────────────
  [themeSel, positionSel, fontsizeSel, animationSel, fontSel].forEach(el =>
    el.addEventListener('change', () => {
      if (el === themeSel) updateThemeUI();
      saveCurrentSettings();
      session.resendIfLive();
    }));

  btnItalic.addEventListener('click', () => {
    isItalic = !isItalic;
    btnItalic.classList.toggle('active', isItalic);
    saveCurrentSettings();
    session.resendIfLive();
  });

  opacitySlider.addEventListener('input', () => {
    opacityValue.textContent = opacitySlider.value + '%';
    saveCurrentSettings(); session.resendIfLive();
  });
  scaleSlider.addEventListener('input', () => {
    scaleValue.textContent = scaleSlider.value + '%';
    saveCurrentSettings(); session.resendIfLive();
  });

  [showCardCb, showTitleCb, showRefCb].forEach(cb =>
    cb.addEventListener('change', () => { saveCurrentSettings(); session.resendIfLive(); }));

  [colorBg, colorText, colorAccent].forEach(el =>
    el.addEventListener('input', () => { saveCurrentSettings(); session.resendIfLive(); }));

  btnBgImage.addEventListener('click', () => bgImageInput.click());
  bgImageInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) loadBgImage(file);
    bgImageInput.value = '';
  });
  btnBgClear.addEventListener('click', () => {
    bgImageData = null;
    updateBgUI(); saveCurrentSettings(); session.resendIfLive();
    setStatus('Background image removed.', '');
  });

  return { readSettings, saveCurrentSettings, applySettings };
}
