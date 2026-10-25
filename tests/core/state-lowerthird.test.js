import { describe, it, expect } from 'vitest';
import { KINDS, DEFAULTS, normalizeState, isLogoDataUrl, MAX_LOGO_DATA_URL } from '../../src/core/state.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const show = (extra) => ({ action: 'show', kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', ...extra });

describe('lowerthird kind', () => {
  it('is a known kind and defaults its field to null', () => {
    expect(KINDS).toContain('lowerthird');
    expect(DEFAULTS.lowerthird).toBeNull();
  });

  it('accepts a name and info and fills the lowerthird field with defaults', () => {
    expect(normalizeState(show())).toMatchObject({ kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'left', logo: null } });
  });

  it('needs some text to show, but name alone or info alone is enough', () => {
    expect(normalizeState(show({ body: '' }))).not.toBeNull();
    expect(normalizeState(show({ title: '' }))).not.toBeNull();
    expect(normalizeState(show({ title: '  ', body: '' }))).toBeNull();
    expect(normalizeState(show({ title: '', body: '   ' }))).toBeNull();
    expect(normalizeState({ action: 'show', kind: 'lowerthird' })).toBeNull();
  });

  it('still lets Hide and Clear through with no text, so nothing can get stuck on air', () => {
    expect(normalizeState({ action: 'hide', kind: 'lowerthird', title: '', body: '' })).not.toBeNull();
    expect(normalizeState({ action: 'clear' })).not.toBeNull();
  });

  it('keeps a valid placement and replaces an unknown one with left', () => {
    expect(normalizeState(show({ lowerthird: { align: 'center' } })).lowerthird.align).toBe('center');
    expect(normalizeState(show({ lowerthird: { align: 'right' } })).lowerthird.align).toBe('right');
    expect(normalizeState(show({ lowerthird: { align: 'diagonal' } })).lowerthird.align).toBe('left');
    expect(normalizeState(show({ lowerthird: 'junk' })).lowerthird).toEqual({ align: 'left', logo: null });
  });

  it('keeps an image data URL and drops anything else, leaving the text', () => {
    expect(normalizeState(show({ lowerthird: { logo: PNG } })).lowerthird.logo).toBe(PNG);
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'http://example.com/a.png', '', 5, null, {}]) {
      const state = normalizeState(show({ lowerthird: { logo: bad } }));
      expect(state.lowerthird.logo).toBeNull();
      expect(state.title).toBe('Pastor John');
    }
  });

  it('drops a picture over the size limit', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_LOGO_DATA_URL);
    expect(isLogoDataUrl(huge)).toBe(false);
    expect(normalizeState(show({ lowerthird: { logo: huge } })).lowerthird.logo).toBeNull();
  });

  it('turns non-text title and body into empty text', () => {
    const state = normalizeState(show({ title: 5, body: { x: 1 } }));
    expect(state).toBeNull();
    expect(normalizeState(show({ title: 5, body: 'Info' }))).toMatchObject({ title: '', body: 'Info' });
  });

  it('does not touch other kinds', () => {
    expect(normalizeState({ action: 'show', kind: 'verse', body: 'x', lowerthird: 'junk' }).kind).toBe('verse');
  });
});

describe('isLogoDataUrl', () => {
  it('accepts png, jpeg, webp and gif data URLs only', () => {
    expect(isLogoDataUrl(PNG)).toBe(true);
    expect(isLogoDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isLogoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isLogoDataUrl('data:image/png;base64,not base64!')).toBe(false);
    expect(isLogoDataUrl(undefined)).toBe(false);
  });
});
