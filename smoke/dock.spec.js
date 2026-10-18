import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test.beforeEach(async ({ context }) => {
  // Prove scripture works offline: any request to the Bible API fails.
  await context.route('https://bolls.life/**', (route) => route.abort());
});

test('dock loads over file:// with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.resolve('dist/dock.html')).href);
  await expect(page.locator('#btn-lookup')).toBeVisible();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('an offline verse looked up in the dock appears on the overlay, then hides', async ({ context }) => {
  const dock = await context.newPage();
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');

  await dock.fill('#ref-input', 'John 3:16');
  await dock.press('#ref-input', 'Enter');
  await expect(dock.locator('#verse-text')).toHaveValue(/For God so loved the world/);

  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved the world');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:16');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);

  await dock.click('#btn-hide');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('stepping to the next verse while live updates the overlay', async ({ context }) => {
  const dock = await context.newPage();
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');

  await dock.fill('#ref-input', 'John 3:16');
  await dock.press('#ref-input', 'Enter');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.click('#btn-show');
  await dock.click('#btn-next');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:17');
});

test('a late-opened overlay restores the live verse', async ({ context }) => {
  const dock = await context.newPage();
  await dock.goto('/dock.html');
  await dock.fill('#ref-input', 'Psalm 23:1');
  await dock.press('#ref-input', 'Enter');
  await expect(dock.locator('#verse-text')).toHaveValue(/shepherd/i);
  await dock.click('#btn-show');

  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await expect(overlay.locator('#ov-body')).toContainText(/shepherd/i);
});

test('a song created in the dock goes live on the overlay', async ({ context }) => {
  const dock = await context.newPage();
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');

  await dock.click('#tab-songs');
  await dock.fill('#song-title-input', 'Test Song');
  await dock.fill('#slide-textarea', 'Line one\nLine two');
  await dock.click('#btn-add-slide');
  await dock.click('#btn-show');

  await expect(overlay.locator('#ov-title')).toHaveText('Test Song');
  await expect(overlay.locator('#ov-body')).toContainText('Line two');
});

test('without a folder the dock warns that songs are browser-only', async ({ page }) => {
  await page.goto('/dock.html');
  await expect(page.locator('#library-banner')).toBeVisible();
  await expect(page.locator('#library-banner')).toContainText('this browser only');
});

test('choosing a folder writes song JSON and lyrics.txt', async ({ page }) => {
  await page.addInitScript(() => {
    // A real directory handle without a native picker: the origin-private file system.
    window.showDirectoryPicker = async () => navigator.storage.getDirectory();
  });
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.click('#btn-set-folder');
  await expect(page.locator('#library-banner')).toBeHidden();

  await page.fill('#song-title-input', 'Folder Song');
  await page.fill('#slide-textarea', 'La la la');
  await page.click('#btn-add-slide');
  await expect(page.locator('#status-bar')).toContainText('Slide added');

  const written = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const out = {};
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') out[name] = await (await handle.getFile()).text();
    }
    return out;
  });
  expect(Object.keys(written)).toContain('Folder_Song.json');
  expect(JSON.parse(written['Folder_Song.json']).slides).toEqual(['La la la']);
  expect(written['lyrics.txt']).toContain('Folder Song');
  expect(written['lyrics.txt']).toContain('La la la');
});

test('a bad import file is reported instead of failing silently', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.setInputFiles('#import-file-input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.locator('#status-bar')).toContainText('Could not read bad.json');
});
