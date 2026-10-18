import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { build } from '../../build.mjs';

beforeAll(async () => { await build(); }, 120000);

describe('build', () => {
  it('produces the overlay page, bundle, styles and background', () => {
    for (const file of ['overlay.html', 'overlay.js', 'css/overlay.css', 'css/dock.css', 'css/fonts.css', 'assets/bg1.png']) {
      expect(existsSync(`dist/${file}`), file).toBe(true);
    }
  });

  it('emits a classic script, not an ES module', () => {
    const html = readFileSync('dist/overlay.html', 'utf8');
    expect(html).toContain('<script src="overlay.js"></script>');
    expect(html).not.toContain('type="module"');
    expect(readFileSync('dist/overlay.js', 'utf8')).not.toMatch(/^\s*import\s/m);
  });

  it('bundles local woff2 fonts and no remote font URLs', () => {
    const css = readFileSync('dist/css/fonts.css', 'utf8');
    expect(css).toContain('@font-face');
    expect(css).not.toMatch(/https?:\/\//);
    const woff = readdirSync('dist/fonts').filter((f) => f.endsWith('.woff2'));
    expect(woff.length).toBeGreaterThan(20);
    expect(css).toContain("font-family: 'Open Sans'");
  });

  it('makes every url() in fonts.css point at a file that exists', () => {
    const css = readFileSync('dist/css/fonts.css', 'utf8');
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(existsSync(`dist/css/${u}`), u).toBe(true);
  });
});
