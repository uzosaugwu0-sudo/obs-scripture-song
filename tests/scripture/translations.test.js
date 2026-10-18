import { describe, it, expect } from 'vitest';
import { TRANSLATIONS, LANGUAGES, translationById } from '../../src/scripture/translations.js';
import { FONTS } from '../../src/core/fonts.js';

describe('translations', () => {
  it('has 31 unique keys', () => {
    expect(TRANSLATIONS).toHaveLength(31);
    expect(new Set(TRANSLATIONS.map((t) => t.key)).size).toBe(31);
  });
  it('derives languages in first-seen order', () => {
    expect(LANGUAGES).toEqual(['English', 'Português', 'Русский', '中文']);
  });
  it('maps CSB to its API id and falls back to KJV', () => {
    expect(translationById('CSB').id).toBe('CSB17');
    expect(translationById('nope').key).toBe('KJV');
  });
});

describe('FONTS', () => {
  it('lists Open Sans first and carries no google flag any more', () => {
    expect(FONTS[0].value).toBe('Open Sans');
    expect(FONTS.every((f) => !('google' in f))).toBe(true);
    expect(FONTS).toHaveLength(12);
  });
});
