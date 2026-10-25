import { test, expect } from '@playwright/test';
import { setupOverlay } from './helpers.js';

const setup = (page) => setupOverlay(page, { title: '', body: '', reference: '', theme: 'frosted', animation: 'cut' });

test.describe('overlay: announcement', () => {
  test('shows the title above the text and no reference', async ({ page }) => {
    const { push, errors, stage, body, title } = await setup(page);
    await push({ kind: 'announcement', title: 'Welcome', body: 'Please silence your phones.' });
    await expect(stage).toHaveClass(/kind-announcement/);
    await expect(title).toHaveText('Welcome');
    await expect(body).toHaveText('Please silence your phones.');
    await expect(page.locator('#ov-ref')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('hides the title line when the title is empty', async ({ page }) => {
    const { push, body, title } = await setup(page);
    await push({ kind: 'announcement', title: '', body: 'Offering' });
    await expect(body).toHaveText('Offering');
    await expect(title).toBeHidden();
  });
});

test.describe('overlay: timer', () => {
  test('counts down against the clock and keeps counting', async ({ page }) => {
    const { push, errors, stage, body, title } = await setup(page);
    await push({ kind: 'timer', title: 'Service starts in', timer: { endAt: Date.now() + 65_000 } });
    await expect(stage).toHaveClass(/kind-timer/);
    await expect(title).toHaveText('Service starts in');
    await expect(body).toHaveText(/^1:0[0-5]$/);
    const first = await body.textContent();
    await expect.poll(async () => body.textContent(), { timeout: 4000 }).not.toBe(first);
    expect(errors).toEqual([]);
  });

  test('shows hours from one hour up', async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() + 3_725_000 } });
    await expect(body).toHaveText(/^1:02:0[0-5]$/);
  });

  test('a paused timer is frozen', async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ kind: 'timer', timer: { remainingMs: 120_000 } });
    await expect(body).toHaveText('2:00');
    await page.waitForTimeout(1500);
    await expect(body).toHaveText('2:00');
  });

  test('an expired timer stays at 0:00 until it is hidden', async ({ page }) => {
    const { push, stage, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() - 60_000 } });
    await expect(body).toHaveText('0:00');
    await page.waitForTimeout(1200);
    await expect(body).toHaveText('0:00');
    await expect(stage).not.toHaveClass(/hidden/);
    await push({ action: 'hide', visible: false, kind: 'timer', timer: { endAt: Date.now() - 60_000 } });
    await expect(stage).toHaveClass(/hidden/);
  });

  test('a timer restored more than an hour after it ended renders nothing', async ({ page }) => {
    const { push, stage } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() - 2 * 3_600_000 } });
    await page.waitForTimeout(500);
    await expect(stage).toHaveClass(/hidden/);
  });

  test('an unusable timer field renders nothing and breaks nothing', async ({ page }) => {
    const { push, errors, stage } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: 'soon' } });
    await page.waitForTimeout(400);
    await expect(stage).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
  });

  test('a stale tick never repaints a hidden or replaced card', async ({ page }) => {
    const { push, stage, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() + 90_000 } });
    await expect(body).toHaveText(/^1:[23]\d$/);
    await push({ action: 'hide', visible: false, kind: 'timer', timer: { endAt: Date.now() + 90_000 } });
    await expect(stage).toHaveClass(/hidden/);
    const frozen = await body.textContent();
    await page.waitForTimeout(1500);
    expect(await body.textContent()).toBe(frozen);
    await push({ kind: 'announcement', title: 'Next', body: 'A different card' });
    await expect(body).toHaveText('A different card');
    await page.waitForTimeout(1200);
    await expect(body).toHaveText('A different card');
  });

  test('switching from a verse to a timer and back leaves the verse alone', async ({ page }) => {
    const { push, body } = await setup(page);
    await push({ kind: 'timer', timer: { endAt: Date.now() + 120_000 } });
    await expect(body).toHaveText(/^\d:\d\d$/);
    await push({ kind: 'verse', body: 'For God so loved the world', reference: 'John 3:16' });
    await expect(body).toHaveText('For God so loved the world');
    await page.waitForTimeout(1200);
    await expect(body).toHaveText('For God so loved the world');
  });
});
