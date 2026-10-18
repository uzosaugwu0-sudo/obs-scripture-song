import { test, expect } from '@playwright/test';

async function makeSong(dock) {
  await dock.click('#tab-songs');
  await dock.fill('#song-title-input', 'Parity Song');
  await dock.fill('#slide-textarea', 'First slide');
  await dock.click('#btn-add-slide');
  await dock.fill('#slide-textarea', 'Second slide');
  await dock.click('#btn-add-slide');
}

test('arrow keys step through song slides live and Space hides', async ({ context }) => {
  const dock = await context.newPage();
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');
  await makeSong(dock);

  await dock.locator('.slide-chip').first().click();
  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');

  await dock.locator('body').click({ position: { x: 5, y: 5 } });
  await dock.keyboard.press('ArrowRight');
  await expect(overlay.locator('#ov-body')).toHaveText('Second slide');

  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('style changes keep the live song on screen after switching to the scripture tab', async ({ context }) => {
  const dock = await context.newPage();
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');
  await makeSong(dock);

  await dock.locator('.slide-chip').first().click();
  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');

  await dock.click('#tab-scripture');
  await dock.selectOption('#theme-sel', 'gold');
  await expect(overlay.locator('#stage')).toHaveClass(/theme-gold/);
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
});

test('display settings survive a reload of the dock', async ({ page }) => {
  await page.goto('/dock.html');
  await page.selectOption('#theme-sel', 'neon');
  await page.selectOption('#position-sel', 'top');
  await page.reload();
  await expect(page.locator('#theme-sel')).toHaveValue('neon');
  await expect(page.locator('#position-sel')).toHaveValue('top');
});

test('songs survive a reload of the dock in browser-only mode', async ({ page }) => {
  await page.goto('/dock.html');
  await makeSong(page);
  await page.reload();
  await page.click('#tab-songs');
  await expect(page.locator('#song-list')).toContainText('Parity Song');
});

test('quick reference boxes jump between fields and look the verse up', async ({ page }) => {
  await page.route('https://bolls.life/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: 'Mocked verse text' }) }));
  await page.goto('/dock.html');
  await page.selectOption('#translation-sel', 'NIV');

  await page.fill('#qr-book', 'john');
  await page.press('#qr-book', 'Tab');
  await expect(page.locator('#qr-chapter')).toBeFocused();
  await page.keyboard.type('3');
  await expect(page.locator('#qr-verse')).toBeFocused();
  await page.keyboard.type('16');
  await page.keyboard.press('Enter');

  await expect(page.locator('#verse-text')).toHaveValue('Mocked verse text');
  await expect(page.locator('#ref-input')).toHaveValue('John 3:16');
});
