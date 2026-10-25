import { test, expect } from '@playwright/test';
import { openPair } from '../helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const titles = (dock) => dock.locator('.plan-item .plan-title').allTextContents();

async function openEditor(dock) {
  await dock.click('#tab-plan');
  await dock.click('#btn-plan-add-lowerthird');
  await expect(dock.locator('#extras-editor')).toBeVisible();
}

async function fillLowerThird(dock, { name = '', info = '', hide = '' }) {
  await dock.fill('#ed-lt-name', name);
  await dock.fill('#ed-lt-info', info);
  await dock.fill('#ed-lt-hide', hide);
}

async function useFolder(context, dock) {
  await dock.click('#tab-songs');
  await dock.click('#btn-tools');
  await dock.click('#tool-choose-folder');
  await expect(dock.locator('#library-banner')).toBeHidden();
}

const folderInit = (context) => context.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });

async function addPicture(dock, name = 'Church Logo.png') {
  await dock.setInputFiles('#ed-lt-file', { name, mimeType: 'image/png', buffer: PNG });
}

test.describe('lower thirds: showing', () => {
  test('Show now puts a lower third on air at the bottom left without touching the plan', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await expect(dock.locator('#ed-show')).toBeDisabled();
    await expect(dock.locator('#ed-hint')).toHaveText('Enter a name or some info.');
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await expect(overlay.locator('#ov-body')).toHaveText('Guest speaker');
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    await expect(dock.locator('#status-what')).toHaveText('Lower third · Pastor John');
    await expect(dock.locator('#extras-editor')).toBeHidden();
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
    const box = await overlay.locator('#card').boundingBox();
    expect(box.x).toBeLessThan(110);
  });

  test('the placement switch moves the bar', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John' });
    await dock.click('#ed-lt-align button[data-value="center"]');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.lt-center')).toHaveCount(1);
  });

  test('Add to plan makes a row that Next item loads and Show puts on air', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-add');
    expect(await titles(dock)).toEqual(['Pastor John']);
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Pastor John');
    await expect(dock.locator('#preview-sub')).toHaveText('Lower third · Guest speaker');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
  });

  test('it replaces a card that was up, and a card replaces it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await dock.click('#tab-plan');
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Welcome everyone');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-announcement')).toHaveCount(1);
    await dock.click('#btn-plan-add-lowerthird');
    await fillLowerThird(dock, { name: 'Pastor John' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(1);
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Welcome back');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.kind-announcement')).toHaveCount(1);
    await expect(overlay.locator('#stage.kind-lowerthird')).toHaveCount(0);
  });
});

test.describe('lower thirds: the automatic hide', () => {
  test('hides itself after the set time', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', hide: '2' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1, { timeout: 6000 });
    await expect(dock.locator('#status-pill')).toHaveText('HIDDEN');
  });

  test('stays put with no time set', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John' });
    await dock.click('#ed-show');
    await dock.waitForTimeout(3000);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
  });

  test('never hides a different card that replaced it, or one shown after Hide', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', hide: '2' });
    await dock.click('#ed-show');
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Stays up');
    await dock.click('#ed-show');
    await dock.waitForTimeout(3500);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#ov-body')).toHaveText('Stays up');
    await dock.click('#btn-plan-add-lowerthird');
    await fillLowerThird(dock, { name: 'Second', hide: '2' });
    await dock.click('#ed-show');
    await dock.click('#btn-hide');
    await dock.click('#btn-plan-add-announcement');
    await dock.fill('#ed-text', 'Also stays');
    await dock.click('#ed-show');
    await dock.waitForTimeout(3500);
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(overlay.locator('#ov-body')).toHaveText('Also stays');
  });

  test('a bad hide time disables the buttons and says why', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock);
    await fillLowerThird(dock, { name: 'Pastor John', hide: '5000' });
    await expect(dock.locator('#ed-hint')).toHaveText('Hide after must be 1 to 3600 seconds.');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await dock.fill('#ed-lt-hide', '');
    await expect(dock.locator('#ed-add')).toBeEnabled();
  });
});

test.describe('lower thirds: pictures', () => {
  test('without a library folder the picture controls are disabled and say why', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-logo')).toBeDisabled();
    await expect(dock.locator('#ed-lt-add-logo')).toBeDisabled();
    await expect(dock.locator('#ed-lt-logo-hint')).toContainText('Choose a library folder');
  });

  test('a picture added through the folder is saved there and shown beside the text', async ({ context }) => {
    await folderInit(context);
    const { dock, overlay } = await openPair(context);
    await useFolder(context, dock);
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-logo')).toBeEnabled();
    await addPicture(dock);
    await expect(dock.locator('#ed-lt-logo option:checked')).toHaveText('Church_Logo.png');
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    await expect(overlay.locator('#ov-logo')).toBeVisible();
    expect(await overlay.locator('#ov-logo').getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    const saved = await dock.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('logos');
      const names = [];
      for await (const entry of dir.values()) names.push(entry.name);
      return names;
    });
    expect(saved).toEqual(['Church_Logo.png']);
  });

  test('a planned picture is read at Next item and is on air at Show, with no race', async ({ context }) => {
    await folderInit(context);
    const { dock, overlay } = await openPair(context);
    await useFolder(context, dock);
    await openEditor(dock);
    await addPicture(dock);
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker' });
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
  });

  test('a missing picture file still shows the name and says so on the row', async ({ context }) => {
    const seeded = { v: 1, id: 'p_seed', name: 'Seeded', items: [
      { id: 'i_lt', type: 'lowerthird', name: 'Pastor John', info: 'Guest speaker', align: 'left', logo: 'gone.png', hideAfter: null },
    ] };
    await context.addInitScript(([key, lastKey, value]) => {
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify([value])); localStorage.setItem(lastKey, value.id); }
    }, ['obs-stage-plans', 'obs-stage-last-plan', seeded]);
    const { dock, overlay } = await openPair(context);
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('picture missing');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await expect(overlay.locator('#ov-body')).toHaveText('Guest speaker');
    await expect(overlay.locator('#ov-logo')).toBeHidden();
  });
});

test.describe('lower thirds: editing and layout', () => {
  test('Edit from the row menu is filled in, and Save updates the row', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock);
    await dock.click('#ed-lt-align button[data-value="right"]');
    await fillLowerThird(dock, { name: 'Pastor John', info: 'Guest speaker', hide: '8' });
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('hides after 8s');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await expect(dock.locator('#ed-heading')).toHaveText('Edit lower third');
    await expect(dock.locator('#ed-lt-name')).toHaveValue('Pastor John');
    await expect(dock.locator('#ed-lt-info')).toHaveValue('Guest speaker');
    await expect(dock.locator('#ed-lt-hide')).toHaveValue('8');
    await expect(dock.locator('#ed-lt-align button[data-value="right"]')).toHaveClass('on');
    await dock.fill('#ed-lt-hide', '');
    await dock.fill('#ed-lt-info', 'Visiting pastor');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-sub')).toHaveText('Lower third · Visiting pastor');
  });

  test('the five add buttons and the editor fit a 380px dock', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.setViewportSize({ width: 380, height: 720 });
    await dock.click('#tab-plan');
    for (const id of ['song', 'verse', 'announcement', 'timer', 'lowerthird']) await expect(dock.locator('#btn-plan-add-' + id)).toBeVisible();
    const sideways = () => dock.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    await dock.click('#btn-plan-add-lowerthird');
    await fillLowerThird(dock, { name: 'A very long name that keeps going and going on and on', info: 'And an equally long title line for the guest', hide: '8' });
    expect(await sideways()).toBe(false);
  });
});
