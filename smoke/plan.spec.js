import { test, expect } from '@playwright/test';
import { openPair, createSong, lookup, blockBibleApi } from './helpers.js';

const titles = (dock) => dock.locator('.plan-item .plan-title').allTextContents();

async function addSongToPlan(dock, title, slides) {
  await createSong(dock, title, slides);
  await dock.click('#btn-song-to-plan');
}

async function addVerseToPlan(dock, ref) {
  await lookup(dock, ref);
  await expect(dock.locator('#verse-text')).not.toHaveValue('');
  await dock.click('#btn-verse-to-plan');
}

const planMenu = async (dock, itemId) => {
  await dock.click('#btn-plan-menu');
  await dock.click('#' + itemId);
};

test.describe('plan tab: building a plan', () => {
  test('Plan is the first tab and an empty plan says what to do', async ({ context }) => {
    const { dock } = await openPair(context);
    await expect(dock.locator('#panel-plan')).toBeVisible();
    await expect(dock.locator('#tab-plan')).toHaveAttribute('aria-selected', 'true');
    await expect(dock.locator('#panel-scripture')).toBeHidden();
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
  });

  test('+ Plan on a song and on a verse add rows in order', async ({ context }) => {
    await blockBibleApi(context);
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Amazing Grace', ['Amazing grace', 'How sweet the sound']);
    await addVerseToPlan(dock, 'John 3:16');
    await dock.click('#tab-plan');
    const list = await titles(dock);
    expect(list[0]).toBe('Amazing Grace');
    expect(list[1].startsWith('John 3:16')).toBe(true);
    await expect(dock.locator('.plan-item').first().locator('.plan-status')).toHaveText('2 slides');
    await expect(dock.locator('.plan-item').nth(1).locator('.plan-status')).toHaveText('KJV');
  });

  test('+ Song from the plan opens Songs as a picker and returns after one add', async ({ context }) => {
    const { dock } = await openPair(context);
    await createSong(dock, 'Amazing Grace', ['Amazing grace']);
    await dock.click('#tab-plan');
    await dock.click('#btn-plan-add-song');
    await expect(dock.locator('#panel-songs')).toBeVisible();
    await expect(dock.locator('#picker-banner')).toContainText('Adding to Untitled plan');
    await dock.click('#btn-all-songs');
    await dock.locator('#song-list .song-item .add').first().click();
    await expect(dock.locator('#panel-plan')).toBeVisible();
    await expect(dock.locator('#picker-banner')).toBeHidden();
    expect(await titles(dock)).toEqual(['Amazing Grace']);
  });

  test('Shift keeps the picker open and Back to plan leaves it', async ({ context }) => {
    const { dock } = await openPair(context);
    await createSong(dock, 'First Song', ['one']);
    await createSong(dock, 'Second Song', ['two']);
    await dock.click('#tab-plan');
    await dock.click('#btn-plan-add-song');
    await dock.click('#btn-all-songs');
    await dock.locator('#song-list .song-item .add').nth(0).click({ modifiers: ['Shift'] });
    await expect(dock.locator('#panel-songs')).toBeVisible();
    await dock.locator('#song-list .song-item .add').nth(1).click({ modifiers: ['Shift'] });
    await dock.click('#picker-back');
    await expect(dock.locator('#panel-plan')).toBeVisible();
    expect((await titles(dock)).sort()).toEqual(['First Song', 'Second Song']);
  });

  test('new, rename, duplicate and delete plans from the Plan menu', async ({ context }) => {
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Amazing Grace', ['a']);
    await dock.click('#tab-plan');
    dock.once('dialog', (d) => d.accept('Sunday 26 Oct'));
    await planMenu(dock, 'plan-rename');
    await expect(dock.locator('#plan-select option:checked')).toHaveText('Sunday 26 Oct');
    await planMenu(dock, 'plan-duplicate');
    await expect(dock.locator('#plan-select option:checked')).toHaveText('Sunday 26 Oct (copy)');
    expect(await titles(dock)).toEqual(['Amazing Grace']);
    dock.once('dialog', (d) => d.accept('Evening'));
    await planMenu(dock, 'plan-new');
    await expect(dock.locator('#plan-select option:checked')).toHaveText('Evening');
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
    await expect(dock.locator('#plan-select option')).toHaveCount(3);
    dock.once('dialog', (d) => d.accept());
    await planMenu(dock, 'plan-delete');
    await expect(dock.locator('#plan-select option:checked')).toHaveText('Untitled plan');
    await dock.selectOption('#plan-select', { label: 'Sunday 26 Oct' });
    expect(await titles(dock)).toEqual(['Amazing Grace']);
  });

  test('the plan survives a reload and the last plan reopens', async ({ context }) => {
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Amazing Grace', ['a']);
    await dock.click('#tab-plan');
    dock.once('dialog', (d) => d.accept('Keep me'));
    await planMenu(dock, 'plan-rename');
    await dock.reload();
    await expect(dock.locator('#plan-select option:checked')).toHaveText('Keep me');
    expect(await titles(dock)).toEqual(['Amazing Grace']);
  });

  test('a song deleted from the library shows as missing in the plan', async ({ context }) => {
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Gone Song', ['a']);
    await dock.click('#btn-all-songs');
    dock.once('dialog', (d) => d.accept());
    await dock.locator('#song-list .song-item .del').first().click();
    await dock.click('#tab-plan');
    const row = dock.locator('.plan-item').first();
    await expect(row).toHaveClass('plan-item missing');
    await expect(row.locator('.plan-title')).toHaveText('Song missing');
    await expect(row.locator('.plan-status')).toHaveText('missing');
  });

  test('the narrow dock does not scroll sideways with a very long title', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.setViewportSize({ width: 380, height: 720 });
    await addSongToPlan(dock, 'A very long hymn title that keeps going and going until it cannot fit in the narrow dock at all', ['la']);
    const sideways = () => dock.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await dock.click('#btn-all-songs');
    expect(await sideways()).toBe(false);
    await dock.click('#tab-plan');
    expect(await sideways()).toBe(false);
  });

  test('with a library folder, plans are written to plans/ as their own files', async ({ context }) => {
    await context.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
    const { dock } = await openPair(context);
    await dock.click('#tab-songs');
    await dock.click('#btn-tools');
    await dock.click('#tool-choose-folder');
    await expect(dock.locator('#library-banner')).toBeHidden();
    await addSongToPlan(dock, 'Folder Hymn', ['la la']);
    const readPlans = () => dock.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      try {
        const dir = await root.getDirectoryHandle('plans');
        const out = {};
        for await (const entry of dir.values()) out[entry.name] = await (await entry.getFile()).text();
        return out;
      } catch { return {}; }
    });
    await expect.poll(async () => Object.keys(await readPlans())).toContain('Untitled_plan.json');
    const saved = JSON.parse((await readPlans())['Untitled_plan.json']);
    expect(saved.name).toBe('Untitled plan');
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ type: 'song' });
  });
});
