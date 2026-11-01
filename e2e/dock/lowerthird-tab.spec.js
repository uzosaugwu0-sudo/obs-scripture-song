import { test, expect } from '@playwright/test';
import { openPair } from '../helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const rows = (dock) => dock.locator('#lt-list .lt-item');
const names = (dock) => dock.locator('#lt-list .lt-name').allTextContents();

async function saveOne(dock, { name, info = '', hide = '' }) {
  await dock.click('#btn-lt-new');
  await expect(dock.locator('#lt-editor-host #extras-editor')).toBeVisible();
  await dock.fill('#ed-lt-name', name);
  await dock.fill('#ed-lt-info', info);
  await dock.fill('#ed-lt-hide', hide);
  await dock.click('#ed-add');
}

test.describe('lower third tab: the saved list', () => {
  test('starts empty, New then Save adds a row, the plan stays empty, and it survives a reload', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await expect(dock.locator('#lt-empty')).toBeVisible();
    await dock.click('#btn-lt-new');
    await expect(dock.locator('#ed-add')).toHaveText('Save');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await dock.fill('#ed-lt-name', 'Pastor John');
    await dock.fill('#ed-lt-info', 'Guest speaker');
    await dock.click('#ed-add');
    expect(await names(dock)).toEqual(['Pastor John']);
    await expect(dock.locator('#lt-empty')).toBeHidden();
    await expect(dock.locator('#extras-editor')).toBeHidden();
    await dock.click('#tab-plan');
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
    await dock.reload();
    await dock.click('#tab-lowerthird');
    expect(await names(dock)).toEqual(['Pastor John']);
  });

  test('the editor goes back to the Plan tab afterwards, still adding to the plan', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await dock.click('#btn-lt-new');
    await dock.click('#tab-plan');
    await dock.click('#btn-plan-add-lowerthird');
    await expect(dock.locator('#panel-plan #extras-editor')).toBeVisible();
    await expect(dock.locator('#ed-add')).toHaveText('Add to plan');
    const above = await dock.evaluate(() => document.getElementById('extras-editor').compareDocumentPosition(document.getElementById('btn-next-item')) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(above).toBeTruthy();   // still above the Next item button
    await dock.fill('#ed-lt-name', 'Pastor John');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-title')).toHaveText('Pastor John');
    await dock.click('#tab-lowerthird');
    await expect(rows(dock)).toHaveCount(0);
  });

  test('Edit changes a row and Delete removes it after a confirmation', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await saveOne(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await rows(dock).first().getByRole('button', { name: 'Edit' }).click();
    await expect(dock.locator('#ed-heading')).toHaveText('Edit lower third');
    await expect(dock.locator('#ed-lt-name')).toHaveValue('Pastor John');
    await dock.fill('#ed-lt-name', 'Pastor Johnny');
    await dock.click('#ed-add');
    expect(await names(dock)).toEqual(['Pastor Johnny']);
    dock.once('dialog', (d) => d.dismiss());
    await rows(dock).first().getByRole('button', { name: /Delete/ }).click();
    await expect(rows(dock)).toHaveCount(1);
    dock.once('dialog', (d) => d.accept());
    await rows(dock).first().getByRole('button', { name: /Delete/ }).click();
    await expect(rows(dock)).toHaveCount(0);
    await expect(dock.locator('#lt-empty')).toBeVisible();
  });
});

test.describe('lower third tab: showing', () => {
  test('Show puts it on air and becomes Hide; Hide takes it off', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await saveOne(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await rows(dock).first().getByRole('button', { name: 'Show', exact: true }).click();
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await expect(overlay.locator('#ov-body')).toHaveText('Guest speaker');
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    const toggle = rows(dock).first().locator('button').first();
    await expect(toggle).toHaveText('Hide');
    await toggle.click();
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await expect(toggle).toHaveText('Show');
  });

  test('showing another replaces it, so only one row says Hide', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await saveOne(dock, { name: 'Pastor John' });
    await saveOne(dock, { name: 'Sister Mary' });
    await rows(dock).nth(0).locator('button').first().click();
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await rows(dock).nth(1).locator('button').first().click();
    await expect(overlay.locator('#ov-title')).toHaveText('Sister Mary');
    await expect(dock.locator('#lt-list .lt-item.cur')).toHaveCount(1);
    await expect(rows(dock).nth(0).locator('button').first()).toHaveText('Show');
    await expect(rows(dock).nth(1).locator('button').first()).toHaveText('Hide');
  });

  test('hide-after takes it off by itself and the row goes back to Show', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await saveOne(dock, { name: 'Pastor John', hide: '2' });
    await expect(rows(dock).first().locator('.lt-info')).toHaveText('hides after 2s');
    await rows(dock).first().locator('button').first().click();
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1, { timeout: 6000 });
    await expect(rows(dock).first().locator('button').first()).toHaveText('Show');
  });

  test('Show now in the editor puts the draft on air without saving it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await dock.click('#btn-lt-new');
    await dock.fill('#ed-lt-name', 'Visitor');
    await dock.click('#ed-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Visitor');
    await expect(rows(dock)).toHaveCount(0);
  });

  test('a picture kept inside the saved lower third is on air with it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-lowerthird');
    await dock.click('#btn-lt-new');
    await dock.setInputFiles('#ed-lt-file', { name: 'Church Logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(dock.locator('#ed-lt-logo option:checked')).toHaveText('Picture from this computer');
    await dock.fill('#ed-lt-name', 'Pastor John');
    await dock.click('#ed-add');
    await dock.reload();
    await dock.click('#tab-lowerthird');
    await rows(dock).first().locator('button').first().click();
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
  });
});

test.describe('lower third tab: library folder and layout', () => {
  test('with a library folder the list is written to lowerthirds.json', async ({ context }) => {
    await context.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
    const { dock } = await openPair(context);
    await dock.click('#tab-songs');
    await dock.click('#btn-tools');
    await dock.click('#tool-choose-folder');
    await expect(dock.locator('#library-banner')).toBeHidden();
    await dock.click('#tab-lowerthird');
    await saveOne(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await expect.poll(() => dock.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      try {
        const file = await (await root.getFileHandle('lowerthirds.json')).getFile();
        return JSON.parse(await file.text()).items.map((i) => i.name);
      } catch { return null; }
    })).toEqual(['Pastor John']);
  });

  test('five tabs and a long saved lower third fit a 380px dock', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.setViewportSize({ width: 380, height: 720 });
    await dock.click('#tab-lowerthird');
    await saveOne(dock, { name: 'A very long name that keeps going and going on and on', info: 'And an equally long title line for the guest', hide: '8' });
    const sideways = () => dock.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    const clipped = await dock.evaluate(() => [...document.querySelectorAll('.tab')].filter((t) => t.scrollWidth > t.clientWidth).map((t) => t.id));
    expect(clipped).toEqual([]);
    await dock.click('#btn-lt-new');
    expect(await sideways()).toBe(false);
  });
});
