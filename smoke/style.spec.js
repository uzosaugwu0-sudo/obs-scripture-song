import { test, expect } from '@playwright/test';
import { openPair, lookup, createSong, blockBibleApi } from './helpers.js';

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const swatch = (page, value) => page.locator(`#theme-swatches button[data-value="${value}"]`);

test.beforeEach(async ({ context }) => { await blockBibleApi(context); });

async function goLive(dock) {
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.click('#btn-show');
  await dock.click('#tab-style');
}

test('Frosted is selected by default and a new theme restyles the live overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await expect(swatch(dock, 'frosted')).toHaveAttribute('aria-pressed', 'true');
  await swatch(dock, 'frosted-light').click();
  await expect(swatch(dock, 'frosted-light')).toHaveClass(/on/);
  await expect(overlay.locator('#stage')).toHaveClass(/theme-frosted-light( |$)/);
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved');
});

test('Pure Type starts without a card and each theme resets the card default', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await swatch(dock, 'pure').click();
  await expect(dock.locator('#show-card-cb')).not.toBeChecked();
  await expect(overlay.locator('#stage')).toHaveClass(/no-card/);
  await dock.check('#show-card-cb');
  await expect(overlay.locator('#stage')).not.toHaveClass(/no-card/);
  await swatch(dock, 'frosted').click();
  await expect(dock.locator('#show-card-cb')).toBeChecked();
});

test('animation, position and size reach the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.click('#anim-seg button[data-value="lines"]');
  await expect(overlay.locator('#stage')).toHaveClass(/anim-lines( |$)/);
  await expect(overlay.locator('#ov-body .ln')).toHaveCount(4);
  await dock.click('#position-seg button[data-value="top"]');
  await expect(overlay.locator('#stage')).toHaveClass(/pos-top/);
  await dock.click('#size-seg button[data-value="xl"]');
  await expect(overlay.locator('#stage')).toHaveClass(/fs-xl/);
});

test('style changes keep the LIVE song on screen after switching to the Scripture tab', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Live Song', ['First slide']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.click('#tab-scripture');
  await dock.click('#tab-style');
  await swatch(dock, 'frosted-light').click();
  await expect(overlay.locator('#stage')).toHaveClass(/theme-frosted-light( |$)/);
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await expect(overlay.locator('#ov-title')).toHaveText('Live Song');
});

test('settings survive a reload', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-style');
  await swatch(dock, 'pure').click();
  await dock.click('#anim-seg button[data-value="wipe"]');
  await dock.click('#position-seg button[data-value="top"]');
  await dock.reload();
  await dock.click('#tab-style');
  await expect(swatch(dock, 'pure')).toHaveClass(/on/);
  await expect(dock.locator('#anim-seg button[data-value="wipe"]')).toHaveClass(/on/);
  await expect(dock.locator('#position-seg button[data-value="top"]')).toHaveClass(/on/);
});

for (const [saved, theme, animation] of [
  [{ theme: 'gold', animation: 'slide' }, 'frosted', 'rise'],
  [{ theme: 'white', animation: 'none' }, 'frosted-light', 'cut'],
  [{ theme: 'weird', animation: 'spin' }, 'frosted', 'rise'],
]) {
  test(`saved settings ${JSON.stringify(saved)} load as ${theme} / ${animation}`, async ({ page }) => {
    await page.addInitScript((value) => {
      if (!localStorage.getItem('obs-stage-display-settings')) localStorage.setItem('obs-stage-display-settings', JSON.stringify(value));
    }, saved);
    await page.goto('/dock.html');
    await page.click('#tab-style');
    await expect(swatch(page, theme)).toHaveClass(/on/);
    await expect(page.locator(`#anim-seg button[data-value="${animation}"]`)).toHaveClass(/on/);
  });
}
test('custom colours appear only for the Custom theme and reach the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await expect(dock.locator('#custom-colors-section')).toBeHidden();
  await swatch(dock, 'custom').click();
  await expect(dock.locator('#custom-colors-section')).toBeVisible();
  await dock.locator('#color-bg').fill('#112233');
  await expect(overlay.locator('#card')).toHaveCSS('background-color', /rgba\(17, 34, 51, 0\.88\d*\)/);
  await swatch(dock, 'frosted').click();
  await expect(dock.locator('#custom-colors-section')).toBeHidden();
});

test('the opacity slider updates its label and the glass alpha', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.locator('#opacity-slider').evaluate((el) => {
    el.value = '50';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(dock.locator('#opacity-value')).toHaveText('50%');
  await expect(overlay.locator('#card')).toHaveCSS('background-color', /rgba\(14, 18, 30, 0\.3\d*\)/);
});

test('italic and the reference toggle reach the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.click('#btn-italic');
  await expect(dock.locator('#btn-italic')).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay.locator('#ov-body')).toHaveCSS('font-style', 'italic');
  await expect(overlay.locator('#ov-ref')).toBeVisible();
  await dock.uncheck('#show-ref-cb');
  await expect(overlay.locator('#ov-ref')).toBeHidden();
});

test('a background image can be chosen and removed', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await goLive(dock);
  await dock.setInputFiles('#bg-image-input', { name: 'bg.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(dock.locator('#bg-image-name')).toHaveText('Custom image in use');
  await expect(dock.locator('#btn-bg-clear')).toBeVisible();
  await expect(overlay.locator('#card')).toHaveCSS('background-image', /url\(/);
  await dock.click('#btn-bg-clear');
  await expect(dock.locator('#bg-image-name')).toContainText('None');
  await expect(dock.locator('#btn-bg-clear')).toBeHidden();
});

test('an unreadable background image is reported and changes nothing', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-style');
  await dock.setInputFiles('#bg-image-input', { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(dock.locator('#status-bar')).toContainText('That image could not be read.');
  await expect(dock.locator('#bg-image-name')).toContainText('None');
});

test('Diagnostics lists reported errors and can be cleared', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-songs');
  await dock.setInputFiles('#import-file-input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(dock.locator('#status-bar')).toContainText('Could not read bad.json');
  await dock.click('#tab-style');
  await expect(dock.locator('#diag-count')).toHaveText('(1)');
  await dock.click('#diagnostics summary');
  await expect(dock.locator('#diag-list li')).toHaveCount(1);
  await expect(dock.locator('#diag-list li')).toContainText('songs');
  await dock.click('#diag-clear');
  await expect(dock.locator('#diag-list li')).toHaveCount(0);
  await expect(dock.locator('#diag-count')).toHaveText('');
});

test('every style control is reachable at 380px without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 700 });
  await page.goto('/dock.html');
  await page.click('#tab-style');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  await swatchCheck(page);
});

async function swatchCheck(page) {
  for (const value of ['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom']) {
    const box = await swatch(page, value).boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(380);
  }
}
