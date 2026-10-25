import { test, expect } from '@playwright/test';
import { openPair, createSong, lookup, blockBibleApi } from '../helpers.js';

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

async function runningPlan(context) {
  await blockBibleApi(context);
  const { dock, overlay } = await openPair(context);
  await addSongToPlan(dock, 'Amazing Grace', ['Amazing grace', 'How sweet the sound']);
  await addVerseToPlan(dock, 'John 3:16');
  await dock.click('#tab-plan');
  return { dock, overlay };
}

const currentTitle = (dock) => dock.locator('.plan-item.cur .plan-title');

test.describe('plan tab: running a plan', () => {
  test('an empty plan shows no plan line and Next item is disabled', async ({ context }) => {
    const { dock } = await openPair(context);
    await expect(dock.locator('#plan-line')).toBeHidden();
    await expect(dock.locator('#btn-next-item')).toBeDisabled();
  });

  test('Next item loads the first item into the live bar without putting it on air', async ({ context }) => {
    const { dock, overlay } = await runningPlan(context);
    await dock.click('#btn-next-item');
    await expect(currentTitle(dock)).toHaveText('Amazing Grace');
    await expect(dock.locator('#preview-text')).toHaveText('Amazing grace');
    await expect(dock.locator('#status-pill')).toHaveText('OFF');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await expect(dock.locator('#plan-line')).toContainText('1 of 2');
    await expect(dock.locator('#plan-line')).toContainText('Next: John 3:16');
  });

  test('arrows step slides and never change the current item', async ({ context }) => {
    const { dock, overlay } = await runningPlan(context);
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-body')).toContainText('Amazing grace');
    await dock.keyboard.press('ArrowRight');
    await expect(overlay.locator('#ov-body')).toContainText('How sweet the sound');
    await expect(currentTitle(dock)).toHaveText('Amazing Grace');
    await expect(dock.locator('.plan-item.cur .plan-status')).toHaveText('slide 2/2');
  });

  test('Next item while live keeps the old slide on air until Show', async ({ context }) => {
    const { dock, overlay } = await runningPlan(context);
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await dock.keyboard.press('ArrowRight');
    await expect(overlay.locator('#ov-body')).toContainText('How sweet the sound');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-sub')).toContainText('John 3:16');
    await expect(overlay.locator('#ov-body')).toContainText('How sweet the sound');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-body')).toContainText('God so loved');
    await expect(dock.locator('#btn-next-item')).toHaveText('End of plan');
    await expect(dock.locator('#btn-next-item')).toBeDisabled();
  });

  test('PageDown and PageUp move between items', async ({ context }) => {
    const { dock } = await runningPlan(context);
    await dock.keyboard.press('PageDown');
    await expect(currentTitle(dock)).toHaveText('Amazing Grace');
    await dock.keyboard.press('PageDown');
    await expect(currentTitle(dock)).toContainText('John 3:16');
    await dock.keyboard.press('PageUp');
    await expect(currentTitle(dock)).toHaveText('Amazing Grace');
  });

  test('tapping a row jumps straight to it', async ({ context }) => {
    const { dock } = await runningPlan(context);
    await dock.locator('.plan-item').nth(1).locator('.plan-title').click();
    await expect(currentTitle(dock)).toContainText('John 3:16');
    await expect(dock.locator('#preview-text')).toContainText('God so loved');
  });

  test('a reading loads in the translation it was planned with', async ({ context }) => {
    const { dock } = await runningPlan(context);
    await dock.click('#tab-scripture');
    await dock.selectOption('#translation-sel', 'WEB');
    await expect(dock.locator('#status-bar')).toContainText('WEB');
    await dock.click('#tab-plan');
    await dock.locator('.plan-item').nth(1).locator('.plan-title').click();
    await expect(dock.locator('#translation-sel')).toHaveValue('KJV');
  });

  test('Next item skips a song that was deleted from the library', async ({ context }) => {
    await blockBibleApi(context);
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Song A', ['a']);
    await addSongToPlan(dock, 'Song B', ['b']);
    await dock.click('#btn-all-songs');
    dock.once('dialog', (d) => d.accept());
    await dock.locator('#song-list .song-item', { hasText: 'Song B' }).locator('.del').click();
    await addVerseToPlan(dock, 'John 3:16');
    await dock.click('#tab-plan');
    await dock.click('#btn-next-item');
    await expect(currentTitle(dock)).toHaveText('Song A');
    await dock.click('#btn-next-item');
    await expect(currentTitle(dock)).toContainText('John 3:16');
  });

  test('Next item refuses while the song editor holds unsaved text', async ({ context }) => {
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Amazing Grace', ['Amazing grace']);
    await dock.click('#btn-edit-song');
    await dock.fill('#slide-textarea', 'words I have not saved');
    await dock.click('#tab-plan');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#status-bar')).toContainText('Finish or discard');
    await expect(dock.locator('.plan-item.cur')).toHaveCount(0);
    await dock.click('#tab-songs');
    await expect(dock.locator('#slide-textarea')).toHaveValue('words I have not saved');
  });

  test('two Next item presses in the same instant load one item, not two', async ({ context }) => {
    await blockBibleApi(context);
    const { dock } = await openPair(context);
    await addVerseToPlan(dock, 'John 3:16');
    await addVerseToPlan(dock, 'Romans 8:28');
    await dock.click('#tab-plan');
    await dock.evaluate(() => {
      const button = document.getElementById('btn-next-item');
      button.click();
      button.click();
    });
    await expect(dock.locator('.plan-item.cur')).toHaveCount(1);
    await expect(currentTitle(dock)).toContainText('John 3:16');
  });
});

async function threeSongs(context) {
  const { dock, overlay } = await openPair(context);
  await addSongToPlan(dock, 'Song A', ['text of A']);
  await addSongToPlan(dock, 'Song B', ['text of B']);
  await addSongToPlan(dock, 'Song C', ['text of C']);
  await dock.click('#tab-plan');
  return { dock, overlay };
}

const rowOf = (dock, title) => dock.locator('.plan-item', { hasText: title });

test.describe('plan tab: changing a plan while it runs', () => {
  test('Move up from a row menu reorders and the current item follows its item', async ({ context }) => {
    const { dock } = await threeSongs(context);
    await dock.click('#btn-next-item');
    await expect(currentTitle(dock)).toHaveText('Song A');
    await rowOf(dock, 'Song C').locator('.plan-more').click();
    await rowOf(dock, 'Song C').getByRole('button', { name: 'Move up' }).click();
    expect(await titles(dock)).toEqual(['Song A', 'Song C', 'Song B']);
    await rowOf(dock, 'Song C').getByRole('button', { name: 'Move up' }).click();
    expect(await titles(dock)).toEqual(['Song C', 'Song A', 'Song B']);
    await expect(currentTitle(dock)).toHaveText('Song A');
  });

  test('dragging a row by its grip reorders the plan', async ({ context }) => {
    const { dock } = await threeSongs(context);
    await dock.locator('.plan-item').nth(2).locator('.plan-grip').dragTo(dock.locator('.plan-item').nth(0));
    expect(await titles(dock)).toEqual(['Song C', 'Song A', 'Song B']);
  });

  test('removing the current item leaves it on air and current falls back', async ({ context }) => {
    const { dock, overlay } = await threeSongs(context);
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-body')).toContainText('text of A');
    await dock.locator('.plan-item.cur .plan-more').click();
    await dock.locator('.plan-item.cur').getByRole('button', { name: 'Remove' }).click();
    expect(await titles(dock)).toEqual(['Song B', 'Song C']);
    await expect(dock.locator('.plan-item.cur')).toHaveCount(0);
    await expect(overlay.locator('#ov-body')).toContainText('text of A');
    await expect(dock.locator('#plan-line')).toContainText('Next: Song B');
    await dock.click('#btn-next-item');
    await expect(currentTitle(dock)).toHaveText('Song B');
  });

  test('a song added while the plan runs lands right after the current item', async ({ context }) => {
    const { dock } = await openPair(context);
    await addSongToPlan(dock, 'Song A', ['a']);
    await addSongToPlan(dock, 'Song B', ['b']);
    await dock.click('#tab-plan');
    await dock.click('#btn-next-item');
    await addSongToPlan(dock, 'Song C', ['c']);
    await dock.click('#tab-plan');
    expect(await titles(dock)).toEqual(['Song A', 'Song C', 'Song B']);
    await expect(currentTitle(dock)).toHaveText('Song A');
  });

  test('opening another plan while live leaves the screen alone', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await addSongToPlan(dock, 'Song A', ['text of A']);
    await dock.click('#tab-plan');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    dock.once('dialog', (d) => d.accept('Evening'));
    await planMenu(dock, 'plan-new');
    await expect(dock.locator('#plan-select option:checked')).toHaveText('Evening');
    await expect(dock.locator('.plan-item.cur')).toHaveCount(0);
    await expect(overlay.locator('#ov-body')).toContainText('text of A');
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
  });
});

test.describe('plan tab: nothing reaches the screen without Show', () => {
  test('looking up a verse in picker mode never puts it on air, even with Auto Show', async ({ context }) => {
    await blockBibleApi(context);
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-scripture');
    await dock.check('#auto-show-cb');
    await dock.click('#tab-plan');
    await dock.click('#btn-plan-add-verse');
    await dock.fill('#smart-input', 'John 3:16');
    await dock.press('#smart-input', 'Enter');
    await expect(dock.locator('#verse-text')).not.toHaveValue('');
    await expect(dock.locator('#status-pill')).toHaveText('OFF');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
  });

  test('a style change after Next item keeps the on-air slide, not the loaded one', async ({ context }) => {
    const { dock, overlay } = await runningPlan(context);
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-body')).toContainText('Amazing grace');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-sub')).toContainText('John 3:16');
    await dock.click('#tab-style');
    await dock.click('#position-seg button[data-value="top"]');
    await expect(overlay.locator('#stage.pos-top')).toHaveCount(1);
    await expect(overlay.locator('#ov-body')).toContainText('Amazing grace');
    await expect(overlay.locator('#ov-body')).not.toContainText('God so loved');
  });
});