import { test, expect } from '@playwright/test';
import { openPair } from '../helpers.js';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');

async function openEditor(dock) {
  await dock.click('#tab-plan');
  await dock.click('#btn-plan-add-lowerthird');
  await expect(dock.locator('#extras-editor')).toBeVisible();
}

const pickerInit = (context) => context.addInitScript(() => {
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('pics', { create: true });
});

/** Put picture files into the pretend "Pictures" folder (a folder in the browser's private storage). */
async function seed(dock, files) {
  await dock.evaluate(async (list) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('pics', { create: true });
    for (const [name, b64] of list) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(bytes);
      await writable.close();
    }
  }, files);
}

async function seedJpeg(dock, name) {
  await dock.evaluate(async (fileName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 200;
    canvas.getContext('2d').fillRect(0, 0, 400, 200);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('pics', { create: true });
    const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(blob);
    await writable.close();
  }, name);
}

const options = (dock) => dock.locator('#ed-lt-logo option').allTextContents();

test.describe('lower thirds: a picture folder chosen once', () => {
  test('choose the folder once, then pick pictures from it by name', async ({ context }) => {
    await pickerInit(context);
    const { dock, overlay } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64], ['b_logo.png', PNG_B64], ['notes.txt', 'aGk=']]);
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-folder-name')).toHaveText('No picture folder chosen.');
    await dock.click('#ed-lt-choose-folder');
    await expect(dock.locator('#ed-lt-folder-name')).toHaveText('Picture folder: pics');
    expect(await options(dock)).toEqual(['No picture', 'a_logo.png', 'b_logo.png']);
    await dock.selectOption('#ed-lt-logo', 'b_logo.png');
    await dock.fill('#ed-lt-name', 'Pastor John');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    expect(await overlay.locator('#ov-logo').getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  test('the next lower third reuses the folder without choosing it again', async ({ context }) => {
    await pickerInit(context);
    const { dock, overlay } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.selectOption('#ed-lt-logo', 'a_logo.png');
    await dock.fill('#ed-lt-name', 'First');
    await dock.click('#ed-show');
    await dock.click('#btn-plan-add-lowerthird');
    await expect(dock.locator('#ed-lt-folder-name')).toHaveText('Picture folder: pics');
    expect(await options(dock)).toEqual(['No picture', 'a_logo.png']);
    await dock.selectOption('#ed-lt-logo', 'a_logo.png');
    await dock.fill('#ed-lt-name', 'Second');
    await dock.click('#ed-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Second');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
  });

  test('the folder is remembered after a reload', async ({ context }) => {
    await pickerInit(context);
    const { dock } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.reload();
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-folder-name')).toHaveText('Picture folder: pics');
    expect(await options(dock)).toEqual(['No picture', 'a_logo.png']);
  });

  test('a picture added to the folder outside the app shows the next time the editor opens', async ({ context }) => {
    await pickerInit(context);
    const { dock } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.click('#ed-cancel');
    await seed(dock, [['new_logo.png', PNG_B64]]);
    await dock.click('#btn-plan-add-lowerthird');
    await expect.poll(() => options(dock)).toEqual(['No picture', 'a_logo.png', 'new_logo.png']);
  });

  test('a JPEG in the folder works and goes out as a small PNG', async ({ context }) => {
    await pickerInit(context);
    const { dock, overlay } = await openPair(context);
    await seedJpeg(dock, 'photo.jpg');
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.selectOption('#ed-lt-logo', 'photo.jpg');
    await dock.fill('#ed-lt-name', 'Pastor John');
    await dock.click('#ed-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    expect(await overlay.locator('#ov-logo').getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  test('a planned lower third points at the file by name and survives a reload', async ({ context }) => {
    await pickerInit(context);
    const { dock, overlay } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.selectOption('#ed-lt-logo', 'a_logo.png');
    await dock.fill('#ed-lt-name', 'Pastor John');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.reload();
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('stays');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#stage.has-logo')).toHaveCount(1);
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
  });

  test('a file missing from the folder still shows the name and says so on the row', async ({ context }) => {
    const seeded = { v: 1, id: 'p_seed', name: 'Seeded', items: [
      { id: 'i_lt', type: 'lowerthird', name: 'Pastor John', info: '', align: 'left', logo: 'gone.png', hideAfter: null },
    ] };
    await context.addInitScript(([key, lastKey, value]) => {
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify([value])); localStorage.setItem(lastKey, value.id); }
    }, ['obs-stage-plans', 'obs-stage-last-plan', seeded]);
    await pickerInit(context);
    const { dock, overlay } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.click('#ed-cancel');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('picture missing');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Pastor John');
    await expect(overlay.locator('#ov-logo')).toBeHidden();
  });

  test('Add picture saves into the chosen folder', async ({ context }) => {
    await pickerInit(context);
    const { dock } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.setInputFiles('#ed-lt-file', { name: 'Church Logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(dock.locator('#ed-lt-logo option:checked')).toHaveText('Church_Logo.png');
    const saved = await dock.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('pics');
      const names = [];
      for await (const entry of dir.values()) names.push(entry.name);
      return names.sort();
    });
    expect(saved).toEqual(['Church_Logo.png', 'a_logo.png']);
  });

  test('Clear stops using the folder', async ({ context }) => {
    await pickerInit(context);
    const { dock } = await openPair(context);
    await seed(dock, [['a_logo.png', PNG_B64]]);
    await openEditor(dock);
    await dock.click('#ed-lt-choose-folder');
    await dock.click('#ed-lt-forget-folder');
    await expect(dock.locator('#ed-lt-folder-name')).toHaveText('No picture folder chosen.');
    expect(await options(dock)).toEqual(['No picture']);
    await dock.reload();
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-folder-name')).toHaveText('No picture folder chosen.');
  });

  test('without folder picking support the button is hidden and pictures are kept inside the lower third', async ({ context }) => {
    await context.addInitScript(() => { Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }); });
    const { dock } = await openPair(context);
    await openEditor(dock);
    await expect(dock.locator('#ed-lt-choose-folder')).toBeHidden();
    await dock.setInputFiles('#ed-lt-file', { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(dock.locator('#ed-lt-logo option:checked')).toHaveText('Picture from this computer');
  });
});