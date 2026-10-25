import { test, expect } from '@playwright/test';
import { openPair, createSong, blockBibleApi } from '../helpers.js';

test.beforeEach(async ({ context }) => { await blockBibleApi(context); });

test('a song created in the dock goes live when its slide card is clicked', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Test Song', ['Line one\nLine two']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-title')).toHaveText('Test Song');
  await expect(overlay.locator('#ov-body')).toContainText('Line two');
  await expect(dock.locator('#status-pill')).toHaveText('LIVE');
  await expect(dock.locator('#status-what')).toContainText('Test Song');
});

test('arrow keys step through slides live and Space hides', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Parity Song', ['First slide', 'Second slide']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.locator('#song-name').click();
  await dock.keyboard.press('ArrowRight');
  await expect(overlay.locator('#ov-body')).toHaveText('Second slide');
  await dock.keyboard.press('ArrowRight');
  await expect(overlay.locator('#ov-body')).toHaveText('Second slide');
  await dock.keyboard.press('ArrowLeft');
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.keyboard.press('Space');
  await expect(overlay.locator('#stage')).toHaveClass(/hidden/);
});

test('songs survive a reload of the dock', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Parity Song', ['First slide']);
  await dock.reload();
  await dock.click('#tab-songs');
  await expect(dock.locator('#song-list')).toContainText('Parity Song');
});

test('the Edit drawer updates and deletes slides', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Edit Me', ['First', 'Second']);
  await dock.click('#btn-edit-song');
  await dock.locator('.slide-chip').first().click();
  await dock.fill('#slide-textarea', 'First changed');
  await dock.click('#btn-update-slide');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('.card').first()).toContainText('First changed');

  await dock.click('#btn-edit-song');
  await dock.locator('.slide-chip').first().click();
  await dock.click('#btn-delete-slide');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('.card')).toHaveCount(1);
  await expect(dock.locator('.card').first()).toContainText('Second');
});

test('one search box finds songs by title, a lyric fragment or loose words', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Amazing Grace', ['Amazing grace how sweet the sound', 'That saved a wretch like me']);
  await createSong(dock, 'How Great Thou Art', ['Then sings my soul my Saviour God to Thee']);
  await createSong(dock, 'Know', ["I don't know why"]);
  const items = dock.locator('#song-list .song-item');

  await dock.fill('#song-search', 'amazing');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Amazing Grace');

  await dock.fill('#song-search', 'wretch');
  await expect(items).toHaveCount(1);
  await expect(items.first().locator('.excerpt')).toContainText('wretch');
  await expect(items.first().locator('.excerpt mark')).toHaveText('wretch');

  await dock.fill('#song-search', 'saviour sings soul');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('How Great Thou Art');

  await dock.fill('#song-search', 'grace wretch');
  await expect(items.first()).toContainText('Amazing Grace');

  await dock.fill('#song-search', 'dont know');
  await expect(items.first()).toContainText('Know');

  await dock.fill('#song-search', 'zebra');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('No songs match');
});

test('title matches rank above lyric matches', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Zzz Lullaby', ['grace abounds here']);
  await createSong(dock, 'Grace Alone', ['nothing relevant']);
  await dock.fill('#song-search', 'grace');
  const items = dock.locator('#song-list .song-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Grace Alone');
  await expect(items.nth(1)).toContainText('Zzz Lullaby');
});

test('picking a search result opens the song and hostile titles stay inert', async ({ context }) => {
  const { dock } = await openPair(context);
  const errors = [];
  dock.on('pageerror', (e) => errors.push(e.message));
  await createSong(dock, '<img src=x onerror=alert(1)> Song', ['safe text']);
  await dock.fill('#song-search', 'song');
  await expect(dock.locator('#song-list img')).toHaveCount(0);
  await dock.locator('#song-list .song-item').first().click();
  await expect(dock.locator('#slide-cards .card')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('without a folder the Songs tab warns that songs are browser-only', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await expect(page.locator('#library-banner')).toBeVisible();
  await expect(page.locator('#library-banner')).toContainText('this browser only');
});

test('Library tools opens from its button and closes on outside click and Escape', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.click('#btn-tools');
  await expect(page.locator('#tools-menu')).toBeVisible();
  await expect(page.locator('#btn-tools')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#song-search').click();
  await expect(page.locator('#tools-menu')).toBeHidden();
  await page.click('#btn-tools');
  await expect(page.locator('#tools-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tools-menu')).toBeHidden();
});

test('choosing a folder writes song JSON and lyrics.txt', async ({ page }) => {
  await page.addInitScript(() => {
    // A real directory handle without a native picker: the origin-private file system.
    window.showDirectoryPicker = async () => navigator.storage.getDirectory();
  });
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  await page.click('#btn-tools');
  await page.click('#tool-choose-folder');
  await expect(page.locator('#library-banner')).toBeHidden();

  await createSong(page, 'Folder Song', ['La la la']);
  await expect.poll(async () => page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const names = [];
    for await (const [name] of dir.entries()) names.push(name);
    return names.sort().join(',');
  })).toContain('Folder_Song.json');

  const written = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const out = {};
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') out[name] = await (await handle.getFile()).text();
    }
    return out;
  });
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

test('importing a lyrics file shows a preview and adds the songs', async ({ page }) => {
  await page.goto('/dock.html');
  await page.click('#tab-songs');
  const text = '#OBS-LYRICS-V1\n\nFirst Hymn\n\nLine a\n\n==========\n\nSecond Hymn\n\nLine b\n';
  await page.setInputFiles('#import-file-input', { name: 'lyrics.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.locator('#import-panel')).toBeVisible();
  await expect(page.locator('#import-song-list li')).toHaveCount(2);
  await page.click('#btn-import-confirm');
  await expect(page.locator('#import-panel')).toBeHidden();
  await expect(page.locator('#status-bar')).toContainText('2 added');
  await page.fill('#song-search', 'hymn');
  await expect(page.locator('#song-list .song-item')).toHaveCount(2);
});

test('find duplicates keeps the fullest copy after confirming', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Dup', ['one']);
  await createSong(dock, 'Dup', ['one', 'two']);
  dock.once('dialog', (dialog) => dialog.accept());
  await dock.click('#btn-tools');
  await dock.click('#tool-duplicates');
  await expect(dock.locator('#status-bar')).toContainText('Removed 1 duplicate song.');
  await dock.fill('#song-search', 'dup');
  await expect(dock.locator('#song-list .song-item')).toHaveCount(1);
  await expect(dock.locator('#song-list .song-item .count')).toHaveText('2 slides');
});

test.describe('narrow dock with real-world content', () => {
  test.use({ viewport: { width: 380, height: 700 } });

  test('long titles, a 500-character slide and 30 songs never scroll sideways', async ({ page }) => {
    const songs = Array.from({ length: 30 }, (_, i) => ({
      id: 's' + i, altTitle: null,
      title: 'Song number ' + i + ' ' + 'with a very long title '.repeat(4),
      slides: ['Slide text ' + 'long '.repeat(100), 'Second slide'],
    }));
    await page.addInitScript((data) => {
      if (!localStorage.getItem('obs-stage-songs')) localStorage.setItem('obs-stage-songs', JSON.stringify(data));
    }, songs);
    await page.goto('/dock.html');
    await page.click('#tab-songs');
    await expect(page.locator('#song-list .song-item')).toHaveCount(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);

    await page.locator('#song-list .song-item').first().click();
    await expect(page.locator('#slide-cards .card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await page.locator('#live-bar').boundingBox();
    expect(box.y).toBeLessThan(2);
  });
});

test('Escape closes Library tools without taking the live slide off screen', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Live Song', ['First slide']);
  await dock.locator('.card').first().click();
  await expect(overlay.locator('#ov-body')).toHaveText('First slide');
  await dock.click('#btn-tools');
  await expect(dock.locator('#tools-menu')).toBeVisible();
  await dock.keyboard.press('Escape');
  await expect(dock.locator('#tools-menu')).toBeHidden();
  await expect(dock.locator('#status-pill')).toHaveText('LIVE');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);
});

test('editing a song while a slide is live does not blank the screen on the next style change', async ({ context }) => {
  const { dock, overlay } = await openPair(context);
  await createSong(dock, 'Edit Live', ['First', 'Second']);
  await dock.locator('.card').nth(1).click();
  await expect(overlay.locator('#ov-body')).toHaveText('Second');
  await dock.click('#btn-edit-song');
  await dock.click('#btn-done-edit');
  await dock.click('#tab-style');
  await dock.click('#size-seg button[data-value="xl"]');
  await expect(overlay.locator('#stage')).toHaveClass(/fs-xl/);
  await expect(overlay.locator('#ov-body')).toHaveText('Second');
  await expect(overlay.locator('#stage')).not.toHaveClass(/hidden/);
});

test('Done warns about unsaved editor text and discards it on the second press', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Keep', ['One']);
  await dock.click('#btn-edit-song');
  await dock.fill('#slide-textarea', 'typed but not added');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('#song-editor')).toBeVisible();
  await expect(dock.locator('#status-bar')).toContainText('unsaved');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('#song-editor')).toBeHidden();
  await expect(dock.locator('.card')).toHaveCount(1);
});

test('Done does not nag when everything is saved', async ({ context }) => {
  const { dock } = await openPair(context);
  await createSong(dock, 'Clean', ['One']);
  await dock.click('#btn-edit-song');
  await dock.click('#btn-done-edit');
  await expect(dock.locator('#song-editor')).toBeHidden();
});