import { test, expect } from '@playwright/test';

const KEY = 'obs-stage-display-state';
const THEMES = ['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom'];
const ANIMATIONS = ['rise', 'wipe', 'lines', 'cut'];
const VERSE = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';

async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/overlay.html');
  let seq = Date.now();
  const push = (state) => page.evaluate(
    ([key, payload]) => localStorage.setItem(key, JSON.stringify(payload)),
    [KEY, { action: 'show', kind: 'verse', version: 1, visible: true, body: VERSE, reference: 'John 3:16 KJV', ...state, seq: (seq += 1) }],
  );
  return { push, errors, stage: page.locator('#stage'), body: page.locator('#ov-body') };
}

test('every theme and animation renders a verse and hides again', async ({ page }) => {
  test.setTimeout(120000);
  const { push, errors, stage } = await setup(page);
  for (const theme of THEMES) {
    for (const animation of ANIMATIONS) {
      await push({ theme, animation });
      await expect(stage).not.toHaveClass(/hidden/);
      await expect(stage).toHaveClass(new RegExp(`theme-${theme}( |$)`));
      await expect(stage).toHaveClass(new RegExp(`anim-${animation}( |$)`));
      await expect(page.locator('#ov-body')).toContainText('For God so loved the world');
      await push({ action: 'hide', visible: false, theme, animation });
      await expect(stage).toHaveClass(/hidden/);
    }
  }
  expect(errors).toEqual([]);
});

test('Line by line splits a verse at its clauses and a song at its line breaks', async ({ page }) => {
  const { push } = await setup(page);
  await push({ animation: 'lines' });
  await expect(page.locator('#ov-body .ln')).toHaveCount(4);
  await push({ kind: 'song', title: 'Song', body: 'A line\nB line\nC line', animation: 'lines' });
  await expect(page.locator('#ov-body .ln')).toHaveCount(3);
  await push({ animation: 'rise' });
  await expect(page.locator('#ov-body .ln')).toHaveCount(0);
  await expect(page.locator('#ov-body')).toContainText('For God so loved the world');
});

for (const animation of ['rise', 'wipe']) {
  test(`${animation}: a content change ends fully visible with the new text`, async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ animation, body: 'First text here' });
    await expect(body).toHaveText('First text here');
    await push({ animation, body: 'Second text here' });
    await expect(body).toHaveText('Second text here');
    await expect(page.locator('#wrap')).toHaveCSS('opacity', '1');
    await expect(page.locator('#card')).toHaveCSS('opacity', '1');
  });
}

test('rapid Next presses end on the last text', async ({ page }) => {
  const { push, stage, body } = await setup(page);
  for (const text of ['Text one', 'Text two', 'Text three', 'Text four', 'Text five']) {
    await push({ animation: 'rise', body: text });
    await page.waitForTimeout(25);
  }
  await expect(body).toHaveText('Text five');
  await expect(stage).not.toHaveClass(/hidden/);
  await expect(page.locator('#wrap')).toHaveCSS('opacity', '1');
});

test('show then an immediate hide ends hidden and stays hidden', async ({ page }) => {
  const { push, stage } = await setup(page);
  await push({ animation: 'wipe' });
  await page.waitForTimeout(100);
  await push({ action: 'hide', visible: false, animation: 'wipe' });
  await expect(stage).toHaveClass(/hidden/);
  await page.waitForTimeout(900);
  await expect(stage).toHaveClass(/hidden/);
});

test('hide then an immediate show ends visible with the new text', async ({ page }) => {
  const { push, stage, body } = await setup(page);
  await push({ animation: 'rise', body: 'First text here' });
  await expect(stage).not.toHaveClass(/hidden/);
  await push({ action: 'hide', visible: false, animation: 'rise' });
  await page.waitForTimeout(150);
  await push({ animation: 'rise', body: 'Second text here' });
  await expect(body).toHaveText('Second text here');
  await page.waitForTimeout(800);
  await expect(stage).not.toHaveClass(/hidden/);
  await expect(page.locator('#card')).toHaveCSS('opacity', '1');
});

test('legacy and unknown theme and animation names still render', async ({ page }) => {
  const { push, stage } = await setup(page);
  await push({ theme: 'neon', animation: 'slide' });
  await expect(stage).toHaveClass(/theme-frosted( |$)/);
  await expect(stage).toHaveClass(/anim-rise( |$)/);
  await push({ theme: 'weird', animation: 'spin' });
  await expect(stage).toHaveClass(/theme-frosted( |$)/);
  await push({ theme: 'white', animation: 'none' });
  await expect(stage).toHaveClass(/theme-frosted-light( |$)/);
  await expect(stage).toHaveClass(/anim-cut( |$)/);
});

test('Sacred Light shows the image card, Pure Type floats text, Frosted uses glass alpha', async ({ page }) => {
  const { push, stage } = await setup(page);
  await push({ theme: 'sacred-light' });
  await expect(page.locator('#card')).toHaveCSS('background-image', /bg1\.png/);

  await push({ theme: 'pure', showCard: false });
  await expect(stage).toHaveClass(/no-card/);
  await push({ theme: 'pure', showCard: true });
  await expect(stage).not.toHaveClass(/no-card/);
  await expect(page.locator('#card')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await push({ theme: 'frosted', showCard: true, opacity: 88 });
  await expect(page.locator('#card')).toHaveCSS('background-color', /rgba\(14, 18, 30, 0\.55\d*\)/);
});

test('empty text never throws', async ({ page }) => {
  const { push, errors, stage } = await setup(page);
  for (const animation of ANIMATIONS) {
    await push({ animation, body: '', reference: '' });
    await expect(stage).not.toHaveClass(/hidden/);
    await push({ animation, body: '   ', reference: '', kind: 'song', title: '' });
  }
  expect(errors).toEqual([]);
});
