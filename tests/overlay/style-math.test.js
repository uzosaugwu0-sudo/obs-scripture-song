import { describe, it, expect } from 'vitest';
import { hexToRgba, getScale, computeBodyFontSize } from '../../src/overlay/style-math.js';

describe('hexToRgba', () => {
  it('converts and clamps alpha', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#ff0000', 2)).toBe('rgba(255, 0, 0, 1)');
    expect(hexToRgba('#ff0000', -1)).toBe('rgba(255, 0, 0, 0)');
  });
  it('falls back to the dark card colour for invalid input', () => {
    expect(hexToRgba('red', 0.5)).toBe('rgba(10, 10, 20, 0.5)');
    expect(hexToRgba(undefined, 0.5)).toBe('rgba(10, 10, 20, 0.5)');
  });
});

describe('getScale', () => {
  it('defaults to 1 and clamps to 0.5 to 1.5', () => {
    expect(getScale({})).toBe(1);
    expect(getScale({ scale: 200 })).toBe(1.5);
    expect(getScale({ scale: 10 })).toBe(0.5);
    expect(getScale({ scale: 75 })).toBe(0.75);
  });
});

describe('computeBodyFontSize', () => {
  it('uses the max for short text, the min for long text, and interpolates between', () => {
    expect(computeBodyFontSize('x'.repeat(10), 'fs-md', 1)).toBe(46);
    expect(computeBodyFontSize('x'.repeat(300), 'fs-md', 1)).toBe(34);
    expect(computeBodyFontSize('x'.repeat(150), 'fs-md', 1)).toBe(40);
  });
  it('applies the scale and falls back to medium for unknown sizes', () => {
    expect(computeBodyFontSize('x', 'fs-md', 0.5)).toBe(23);
    expect(computeBodyFontSize('x', 'fs-bogus', 1)).toBe(46);
    expect(computeBodyFontSize(undefined, 'fs-md', 1)).toBe(46);
  });
});
