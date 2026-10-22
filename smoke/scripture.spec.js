import { test, expect } from '@playwright/test';
import { openPair, lookup, blockBibleApi } from './helpers.js';

test.beforeEach(async ({ context }) => { await blockBibleApi(context); });

test('an offline verse from the smart box reaches the overlay, then hides', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await dock.click('#tab-scripture');
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/For God so loved the world/);
  await expect(dock.locator('#smart-input')).toHaveValue('John 3:16');

  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved the world');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:16');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);

  await dock.click('#btn-hide');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('the live bar previews the loaded verse and enables Show', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await expect(dock.locator('#btn-show')).toBeDisabled();
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#preview-text')).toContainText('For God so loved');
  await expect(dock.locator('#preview-sub')).toContainText('John 3:16');
  await expect(dock.locator('#btn-show')).toBeEnabled();
});

test('stepping to the next verse while live updates the overlay', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await dock.click('#tab-scripture');
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.click('#btn-show');
  await dock.click('#btn-next');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:17');
  await dock.click('#btn-prev');
  await expect(overlay.locator('#ov-ref')).toContainText('John 3:16');
});

test('a late-opened overlay restores the live verse', async ({ context }) => {
  const dock = await context.newPage();
  await dock.goto('/dock.html');
  await lookup(dock, 'Psalm 23:1');
  await expect(dock.locator('#verse-text')).toHaveValue(/shepherd/i);
  await dock.click('#btn-show');
  const overlay = await context.newPage();
  await overlay.goto('/overlay.html');
  await expect(overlay.locator('#ov-body')).toContainText(/shepherd/i);
});

test('Space shows and hides when focus is not in a field', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await dock.click('#tab-scripture');
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.locator('#preview-text').click();
  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);
  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('editing the verse text changes what goes live', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await dock.click('#tab-scripture');
  await lookup(dock, 'John 3:16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  await dock.fill('#verse-text', 'My edited words');
  await dock.click('#btn-show');
  await expect(overlay.locator('#ov-body')).toHaveText('My edited words');
});

test('Auto Show sends the verse as soon as it is looked up', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.check('#auto-show-cb');
  await lookup(dock, 'John 3:16');
  await expect(overlay.locator('#ov-body')).toContainText('For God so loved the world');
});

test('Random fills the verse text from the bundled Bible', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.click('#btn-random');
  await expect(dock.locator('#verse-text')).toHaveValue(/.+/);
  await expect(dock.locator('#preview-sub')).toContainText('KJV');
});

test('translation and Auto Show survive a reload', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.selectOption('#translation-sel', 'WEB');
  await dock.check('#auto-show-cb');
  await dock.reload();
  await expect(dock.locator('#translation-sel')).toHaveValue('WEB');
  await expect(dock.locator('#auto-show-cb')).toBeChecked();
});
test('typing a book shows suggestions and picking one asks for a chapter', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.fill('#smart-input', 'joh');
  await expect(dock.locator('#smart-list li')).toHaveCount(1);
  await expect(dock.locator('#smart-list li').first()).toContainText('John');
  await dock.locator('#smart-list li').first().click();
  await expect(dock.locator('#smart-input')).toHaveValue('John ');
  await expect(dock.locator('#status-bar')).toContainText('John has 21 chapters');
});

test('Enter on a bare book name selects the book', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.fill('#smart-input', 'john');
  await dock.press('#smart-input', 'Enter');
  await expect(dock.locator('#smart-input')).toHaveValue('John ');
});

test('arrow keys and Enter pick a suggestion', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.fill('#smart-input', 'jo');
  await expect(dock.locator('#smart-list')).toBeVisible();
  await dock.press('#smart-input', 'ArrowDown');
  await dock.press('#smart-input', 'Enter');
  await expect(dock.locator('#smart-input')).toHaveValue(/^[A-Za-z0-9 ]+ $/);
});

test('Escape closes the dropdown without clearing the box', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.fill('#smart-input', 'joh');
  await expect(dock.locator('#smart-list')).toBeVisible();
  await dock.press('#smart-input', 'Escape');
  await expect(dock.locator('#smart-list')).toBeHidden();
  await expect(dock.locator('#smart-input')).toHaveValue('joh');
});

test('quick-book chips fill the box', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.locator('#quick-books button', { hasText: 'Romans' }).click();
  await expect(dock.locator('#smart-input')).toHaveValue('Romans ');
});

test('a blank Enter says what to type', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.press('#smart-input', 'Enter');
  await expect(dock.locator('#status-bar')).toContainText('Enter a reference or some words first.');
});

test('a word search lists matches and clicking one looks the verse up', async ({ context }) => {
  await context.route('https://bolls.life/search/NIV/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ book: 43, chapter: 3, verse: 16, text: 'For God so loved the world' }]),
  }));
  await context.route('https://bolls.life/get-verse/NIV/43/3/16/', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ text: 'Mocked verse text' }),
  }));
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  await dock.selectOption('#translation-sel', 'NIV');
  await lookup(dock, 'loved the world');
  await expect(dock.locator('#search-results li')).toHaveCount(1);
  await expect(dock.locator('#search-results li')).toContainText('John 3:16');
  await dock.locator('#search-results li').click();
  await expect(dock.locator('#verse-text')).toHaveValue('Mocked verse text');
  await expect(dock.locator('#smart-input')).toHaveValue('John 3:16');
  await expect(dock.locator('#search-results')).toBeHidden();
});

test('odd input never breaks the box', async ({ context }) => {
  const { dock } = await openPair(context);
  await dock.click('#tab-scripture');
  const errors = [];
  dock.on('pageerror', (e) => errors.push(e.message));
  for (const text of ['316', 'john  3 :16', '1 John', 'x'.repeat(2000), 'Hezekiah 1:1', '   ', 'John 3:99']) {
    await lookup(dock, text);
    await expect(dock.locator('#smart-input')).toBeEnabled();
  }
  await lookup(dock, 'john  3 :16');
  await expect(dock.locator('#verse-text')).toHaveValue(/God so loved/);
  expect(errors).toEqual([]);
});
