import { describe, it, expect } from 'vitest';
import { isValidLogoName, logoFileName, fitSize, LOGO_MAX_SIDE } from '../../src/plan/logos.js';

describe('isValidLogoName', () => {
  it('accepts a plain .png file name', () => {
    ['a.png', 'pastor_john.png', 'pastor_john (2).png', 'Church Logo.PNG'].forEach((n) => expect(isValidLogoName(n)).toBe(true));
  });
  it('rejects folders, other types, hidden names and non-text', () => {
    ['a/b.png', 'a\\b.png', '../a.png', 'a..png', 'a.jpg', 'a.png.exe', '.png', '', 'x'.repeat(90) + '.png', null, undefined, 5].forEach((n) => expect(isValidLogoName(n)).toBe(false));
  });
});

describe('logoFileName', () => {
  it('makes a safe .png name from the source file name', () => {
    expect(logoFileName('Pastor John.jpg', [])).toBe('Pastor_John.png');
    expect(logoFileName('a/b:c.webp', [])).toBe('a_b_c.png');
    expect(logoFileName('', [])).toBe('logo.png');
    expect(logoFileName('???.png', [])).toBe('logo.png');
  });
  it('never reuses a taken name, ignoring case', () => {
    expect(logoFileName('logo.png', ['logo.png'])).toBe('logo (2).png');
    expect(logoFileName('Logo.png', ['logo.png', 'logo (2).png'])).toBe('Logo (3).png');
  });
});

describe('logoFileName always makes a name the app accepts', () => {
  it('survives long stems added more than once, double dots and leading dots', () => {
    const long = 'x'.repeat(95) + '.jpg';
    const taken = [];
    for (let i = 0; i < 4; i += 1) { const name = logoFileName(long, taken); expect(isValidLogoName(name), name).toBe(true); taken.push(name); }
    for (const source of ['a..b.jpg', '.hidden.png', '..png', 'my.logo.v2.png', '  .jpg']) {
      expect(isValidLogoName(logoFileName(source, [])), source).toBe(true);
    }
  });
});

describe('fitSize', () => {
  it('scales the longest side down to the limit and keeps the proportions', () => {
    expect(fitSize(400, 200)).toEqual({ width: LOGO_MAX_SIDE, height: 80 });
    expect(fitSize(200, 400)).toEqual({ width: 80, height: LOGO_MAX_SIDE });
    expect(fitSize(1000, 1000, 100)).toEqual({ width: 100, height: 100 });
  });
  it('never makes a picture bigger and never returns zero', () => {
    expect(fitSize(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitSize(1000, 1)).toEqual({ width: LOGO_MAX_SIDE, height: 1 });
  });
  it('returns null for a size that is not positive', () => {
    expect(fitSize(0, 10)).toBeNull();
    expect(fitSize(-5, 10)).toBeNull();
    expect(fitSize(NaN, 10)).toBeNull();
  });
});
