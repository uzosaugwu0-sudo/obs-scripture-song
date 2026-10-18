import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('dock loads over file:// with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.resolve('dist/dock.html')).href);
  await expect(page.locator('#live-bar')).toBeVisible();
  await expect(page.locator('#status-pill')).toHaveText('OFF');
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('tabs switch panels and keep aria-selected in step', async ({ page }) => {
  await page.goto('/dock.html');
  await expect(page.locator('#panel-scripture')).toBeVisible();
  await page.click('#tab-songs');
  await expect(page.locator('#panel-songs')).toBeVisible();
  await expect(page.locator('#panel-scripture')).toBeHidden();
  await expect(page.locator('#tab-songs')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-scripture')).toHaveAttribute('aria-selected', 'false');
  await page.click('#tab-style');
  await expect(page.locator('#panel-style')).toBeVisible();
  await expect(page.locator('#panel-songs')).toBeHidden();
});

test('with nothing loaded Show and Hide are disabled and the preview says so', async ({ page }) => {
  await page.goto('/dock.html');
  await expect(page.locator('#btn-show')).toBeDisabled();
  await expect(page.locator('#btn-hide')).toBeDisabled();
  await expect(page.locator('#preview-text')).toHaveText('Nothing loaded');
});

test.describe('narrow dock (380 x 700)', () => {
  test.use({ viewport: { width: 380, height: 700 } });

  for (const tab of ['scripture', 'songs', 'style']) {
    test(`${tab}: the live bar stays pinned and nothing scrolls sideways`, async ({ page }) => {
      await page.goto('/dock.html');
      await page.click(`#tab-${tab}`);
      await expect(page.locator(`#panel-${tab}`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const box = await page.locator('#live-bar').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeLessThan(2);
      expect(box.y + box.height).toBeLessThanOrEqual(700);
    });
  }

  test('Show and Hide are large targets', async ({ page }) => {
    await page.goto('/dock.html');
    for (const id of ['#btn-show', '#btn-hide']) {
      const box = await page.locator(id).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  });
});
