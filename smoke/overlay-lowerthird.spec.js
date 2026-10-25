import { test, expect } from '@playwright/test';
import { setupOverlay } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const THEMES = ['frosted', 'frosted-light', 'pure', 'sacred-light', 'custom'];
const setup = (page) => setupOverlay(page, { title: '', body: '', reference: '', theme: 'frosted', animation: 'cut' });
const lt = (extra = {}, state = {}) => ({ kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'left', logo: null, ...extra }, ...state });

test.describe('overlay: lower third', () => {
  test('shows the name above the info, as a bar at the bottom left', async ({ page }) => {
    const { push, errors, stage, body, title } = await setup(page);
    await push(lt());
    await expect(stage).toHaveClass(/kind-lowerthird/);
    await expect(stage).toHaveClass(/lt-left/);
    await expect(title).toHaveText('Pastor John');
    await expect(body).toHaveText('Guest speaker');
    await expect(page.locator('#ov-ref')).toBeHidden();
    const box = await page.locator('#card').boundingBox();
    expect(box.x).toBeGreaterThan(20);
    expect(box.x).toBeLessThan(110);
    expect(box.width).toBeLessThan(700);
    expect(box.y + box.height).toBeGreaterThan(720 * 0.8);
    expect(errors).toEqual([]);
  });

  test('centres and right-aligns the bar', async ({ page }) => {
    const { push } = await setup(page);
    await push(lt({ align: 'center' }));
    await expect(page.locator('#card')).toBeVisible();
    let box = await page.locator('#card').boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(8);
    await push(lt({ align: 'right' }));
    await expect(page.locator('#stage.lt-right')).toHaveCount(1);
    box = await page.locator('#card').boundingBox();
    expect(1280 - (box.x + box.width)).toBeGreaterThan(20);
    expect(1280 - (box.x + box.width)).toBeLessThan(110);
  });

  test('always sits at the bottom, even when Position is top', async ({ page }) => {
    const { push } = await setup(page);
    await push(lt({}, { position: 'top' }));
    await expect(page.locator('#card')).toBeVisible();
    const box = await page.locator('#card').boundingBox();
    expect(box.y + box.height).toBeGreaterThan(720 * 0.8);
  });

  test('shows the picture beside the text, and drops a bad one but keeps the text', async ({ page }) => {
    const { push, body } = await setup(page);
    await push(lt({ logo: PNG }));
    await expect(page.locator('#stage.has-logo')).toHaveCount(1);
    await expect(page.locator('#ov-logo')).toBeVisible();
    await expect(page.locator('#ov-logo')).toHaveAttribute('src', PNG);
    await push(lt({ logo: 'javascript:alert(1)' }));
    await expect(page.locator('#stage.has-logo')).toHaveCount(0);
    await expect(page.locator('#ov-logo')).toBeHidden();
    await expect(body).toHaveText('Guest speaker');
  });

  test('the Song title setting does not hide a lower third name', async ({ page }) => {
    const { push, title, body } = await setup(page);
    await push(lt({}, { showTitle: false }));
    await expect(title).toHaveText('Pastor John');
    await expect(title).toBeVisible();
    await expect(body).toHaveText('Guest speaker');
  });

  test('name only and info only both work, and an empty one renders nothing', async ({ page }) => {
    const { push, stage, body, title } = await setup(page);
    await push(lt({}, { body: '' }));
    await expect(title).toHaveText('Pastor John');
    await expect(body).toBeHidden();
    await push(lt({}, { title: '', body: 'Just the info' }));
    await expect(title).toBeHidden();
    await expect(body).toHaveText('Just the info');
    await push({ action: 'hide', visible: false, kind: 'lowerthird', title: '', body: '', lowerthird: { align: 'left', logo: null } });
    await expect(stage).toHaveClass(/hidden/);
    await push(lt({}, { title: '   ', body: '' }));
    await page.waitForTimeout(300);
    await expect(stage).toHaveClass(/hidden/);
  });

  test('a Hide with no text still hides a lower third that is on air', async ({ page }) => {
    const { push, stage } = await setup(page);
    await push(lt());
    await expect(stage).not.toHaveClass(/hidden/);
    await push({ action: 'hide', visible: false, kind: 'lowerthird', title: '', body: '' });
    await expect(stage).toHaveClass(/hidden/);
  });

  test('a verse or announcement after a lower third has the normal wide card again', async ({ page }) => {
    const { push, stage } = await setup(page);
    await push(lt({ align: 'right', logo: PNG }));
    await expect(stage).toHaveClass(/lt-right/);
    await push({ kind: 'verse', body: 'For God so loved the world', reference: 'John 3:16' });
    await expect(stage).not.toHaveClass(/kind-lowerthird/);
    await expect(stage).not.toHaveClass(/lt-right/);
    await expect(stage).not.toHaveClass(/has-logo/);
    await expect(page.locator('#ov-logo')).toBeHidden();
    const wide = await page.locator('#card').boundingBox();
    expect(wide.width).toBeGreaterThan(1100);
    await push({ kind: 'announcement', title: 'Welcome', body: 'Hello' });
    const again = await page.locator('#card').boundingBox();
    expect(again.width).toBeGreaterThan(1100);
  });

  test('every theme renders a lower third without page errors', async ({ page }) => {
    const { push, errors, stage, title } = await setup(page);
    for (const theme of THEMES) {
      await push(lt({ logo: PNG }, { theme }));
      await expect(stage).toHaveClass(new RegExp('theme-' + theme + '( |$)'));
      await expect(title).toHaveText('Pastor John');
      await expect(page.locator('#ov-logo')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('Soft rise and Glass wipe still show it', async ({ page }) => {
    const { push, stage, title } = await setup(page);
    for (const animation of ['rise', 'wipe', 'lines']) {
      await push({ action: 'hide', visible: false, ...lt(), animation: 'cut' });
      await push(lt({}, { animation }));
      await expect(title).toHaveText('Pastor John');
      await expect(stage).not.toHaveClass(/hidden/);
    }
  });
});
