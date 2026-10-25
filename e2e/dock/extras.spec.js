import { test, expect } from '@playwright/test';
import { openPair } from '../helpers.js';

const titles = (dock) => dock.locator('.plan-item .plan-title').allTextContents();
const bodyOf = (overlay) => overlay.locator('#ov-body');

async function openEditor(dock, which) {
  await dock.click('#tab-plan');
  await dock.click('#btn-plan-add-' + which);
  await expect(dock.locator('#extras-editor')).toBeVisible();
}

async function fillAnnouncement(dock, { title = '', text }) {
  await dock.fill('#ed-title', title);
  await dock.fill('#ed-text', text);
}

async function fillDuration(dock, { title = '', minutes = '', seconds = '' }) {
  await dock.fill('#ed-title', title);
  await dock.fill('#ed-minutes', minutes);
  await dock.fill('#ed-seconds', seconds);
}

const nearMidnight = () => new Date(Date.now() + 5 * 60_000).getDate() !== new Date().getDate();

test.describe('announcements', () => {
  test('Show now puts the announcement on air without touching the plan', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await expect(dock.locator('#ed-show')).toBeDisabled();
    await expect(dock.locator('#ed-hint')).toHaveText('Write the text to show.');
    await fillAnnouncement(dock, { title: 'Welcome', text: 'Please silence your phones.' });
    await expect(dock.locator('#ed-show')).toBeEnabled();
    await dock.click('#ed-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Welcome');
    await expect(bodyOf(overlay)).toHaveText('Please silence your phones.');
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    await expect(dock.locator('#status-what')).toHaveText('Announcement · Welcome');
    await expect(dock.locator('#extras-editor')).toBeHidden();
    await expect(dock.locator('#plan-list')).toContainText('Nothing planned yet');
  });

  test('Add to plan creates a row that Next item loads and Show puts on air', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Offering', text: 'Please give generously.' });
    await dock.click('#ed-add');
    await expect(dock.locator('#extras-editor')).toBeHidden();
    expect(await titles(dock)).toEqual(['Offering']);
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Please give generously.');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText('Please give generously.');
  });

  test('Edit from the row menu changes the plan, not the screen', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Welcome', text: 'First version' });
    await dock.click('#ed-add');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText('First version');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await expect(dock.locator('#ed-heading')).toHaveText('Edit announcement');
    await expect(dock.locator('#ed-text')).toHaveValue('First version');
    await expect(dock.locator('#ed-add')).toHaveText('Save');
    await dock.fill('#ed-text', 'Second version');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item')).toHaveCount(1);
    await expect(bodyOf(overlay)).toHaveText('First version');
    await dock.locator('.plan-item .plan-title').click();
    await expect(dock.locator('#preview-text')).toHaveText('Second version');
  });
});

test.describe('timers', () => {
  test('Show now starts a duration timer that counts down on the overlay', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Back in', minutes: '5', seconds: '0' });
    await dock.click('#ed-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Back in');
    await expect(bodyOf(overlay)).toHaveText(/^(5:00|4:5\d)$/);
    await expect(dock.locator('#status-pill')).toHaveText('LIVE');
    await expect(dock.locator('#status-what')).toHaveText('Timer · Back in');
    const first = await bodyOf(overlay).textContent();
    await expect.poll(async () => bodyOf(overlay).textContent(), { timeout: 4000 }).not.toBe(first);
  });

  test('a clock-time timer counts down to that time today', async ({ context }) => {
    test.skip(nearMidnight(), 'the target time would fall on tomorrow');
    const { dock, overlay } = await openPair(context);
    const target = new Date(Date.now() + 5 * 60_000);
    const at = String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
    await openEditor(dock, 'timer');
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-title', 'Service starts in');
    await dock.fill('#ed-clock', at);
    await dock.click('#ed-show');
    await expect(bodyOf(overlay)).toHaveText(/^[3-5]:\d\d$/);
  });

  test('invalid timer input disables both buttons and says why', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock, 'timer');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await expect(dock.locator('#ed-hint')).toHaveText('Enter a time of at least 1 second.');
    await fillDuration(dock, { minutes: '0', seconds: '75' });
    await expect(dock.locator('#ed-hint')).toHaveText('Seconds go up to 59.');
    await expect(dock.locator('#ed-show')).toBeDisabled();
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-clock', '25:99');
    await expect(dock.locator('#ed-hint')).toHaveText('Enter a 24-hour time such as 10:30.');
    await expect(dock.locator('#ed-add')).toBeDisabled();
    await dock.fill('#ed-clock', '10:30');
    await expect(dock.locator('#ed-add')).toBeEnabled();
    await dock.click('#ed-cancel');
    await expect(dock.locator('#extras-editor')).toBeHidden();
  });

  test('a planned timer survives a reload, loads with its full time and starts at Show', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Prayer', minutes: '1', seconds: '30' });
    await dock.click('#ed-add');
    await dock.reload();
    expect(await titles(dock)).toEqual(['Prayer']);
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('1:30');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('1:30');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText(/^(1:30|1:2\d)$/);
  });

  test('editing a duration timer into a clock timer drops the old duration', async ({ context }) => {
    const { dock } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Prayer', minutes: '1', seconds: '30' });
    await dock.click('#ed-add');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-clock', '10:30');
    await dock.click('#ed-add');
    await expect(dock.locator('.plan-item .plan-status')).toHaveText('at 10:30');
    const stored = await dock.evaluate(() => localStorage.getItem('obs-stage-plans'));
    expect(stored).toContain('"at":"10:30"');
    expect(stored).not.toContain('"seconds"');
  });
});

test.describe('plan safety', () => {
  test('hand-edited invalid items are unsupported rows, skipped by Next item, and never rewritten', async ({ context }) => {
    const seeded = { v: 1, id: 'p_seed', name: 'Seeded', items: [
      { id: 'i_bad1', type: 'timer', mode: 'duration', seconds: -5, title: 'Bad' },
      { id: 'i_bad2', type: 'timer', mode: 'clock', at: '25:99', title: '' },
      { id: 'i_bad3', type: 'announcement', title: 'Empty', body: '  ' },
      { id: 'i_ok', type: 'announcement', title: 'Fine', body: 'Good text' },
    ] };
    await context.addInitScript(([key, lastKey, value]) => {
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify([value])); localStorage.setItem(lastKey, value.id); }
    }, ['obs-stage-plans', 'obs-stage-last-plan', seeded]);
    const { dock } = await openPair(context);
    const rows = dock.locator('.plan-item');
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 3; i += 1) await expect(rows.nth(i)).toHaveClass('plan-item missing');
    await dock.click('#btn-next-item');
    await expect(dock.locator('.plan-item.cur .plan-title')).toHaveText('Fine');
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Extra', text: 'Another' });
    await dock.click('#ed-add');
    await expect(rows).toHaveCount(5);
    const stored = await dock.evaluate(() => localStorage.getItem('obs-stage-plans'));
    expect(stored).toContain('"seconds":-5');
    expect(stored).toContain('"at":"25:99"');
  });
});

test.describe('layout', () => {
  test('the four add buttons and the timer editor fit a 380px dock', async ({ context }) => {
    const { dock } = await openPair(context);
    await dock.setViewportSize({ width: 380, height: 720 });
    await dock.click('#tab-plan');
    for (const id of ['song', 'verse', 'announcement', 'timer']) await expect(dock.locator('#btn-plan-add-' + id)).toBeVisible();
    const sideways = () => dock.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    await dock.click('#btn-plan-add-timer');
    await dock.click('#ed-mode button[data-value="clock"]');
    expect(await sideways()).toBe(false);
    await dock.click('#ed-mode button[data-value="duration"]');
    await fillDuration(dock, { title: 'A very long timer title that keeps going and going and going on', minutes: '5', seconds: '0' });
    expect(await sideways()).toBe(false);
  });
});

async function showTimerNow(dock, { title = 'Back in', minutes = '5', seconds = '0' } = {}) {
  await openEditor(dock, 'timer');
  await fillDuration(dock, { title, minutes, seconds });
  await dock.click('#ed-show');
}

test.describe('timer controls while on air', () => {
  test('the dock shows the live time, counting, with its title', async ({ context }) => {
    const { dock } = await openPair(context);
    await showTimerNow(dock);
    await expect(dock.locator('#timer-controls')).toBeVisible();
    await expect(dock.locator('#timer-live-text')).toContainText('Back in');
    await expect(dock.locator('#timer-live-text')).toContainText(/(5:00|4:5\d)/);
    const first = await dock.locator('#timer-live-text').textContent();
    await expect.poll(async () => dock.locator('#timer-live-text').textContent(), { timeout: 4000 }).not.toBe(first);
  });

  test('Pause freezes the overlay clock and Resume continues it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await expect(bodyOf(overlay)).toHaveText(/^(5:00|4:5\d)$/);
    await dock.click('#btn-timer-pause');
    await expect(dock.locator('#btn-timer-pause')).toHaveText('Resume');
    await expect(dock.locator('#timer-live-text')).toContainText('(paused)');
    await dock.waitForTimeout(500);
    const frozen = await bodyOf(overlay).textContent();
    await dock.waitForTimeout(1600);
    expect(await bodyOf(overlay).textContent()).toBe(frozen);
    await dock.click('#btn-timer-pause');
    await expect(dock.locator('#btn-timer-pause')).toHaveText('Pause');
    await expect.poll(async () => bodyOf(overlay).textContent(), { timeout: 4000 }).not.toBe(frozen);
  });

  test('Reset restarts from the full time', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await dock.waitForTimeout(2300);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-7]$/);
    await dock.click('#btn-timer-reset');
    await expect(bodyOf(overlay)).toHaveText(/^(5:00|4:59)$/);
  });

  test('pressing Show again restarts a duration timer', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await dock.waitForTimeout(2300);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-7]$/);
    await dock.click('#btn-show');
    await expect.poll(async () => bodyOf(overlay).textContent(), { timeout: 3000 }).toMatch(/^(5:00|4:59)$/);
  });

  test('an expired duration timer stays at 0:00 until Hide, then the controls go away', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock, { minutes: '0', seconds: '2' });
    await dock.waitForTimeout(3000);
    await expect(bodyOf(overlay)).toHaveText('0:00');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(0);
    await expect(dock.locator('#timer-live-text')).toContainText('0:00');
    await dock.click('#btn-hide');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await expect(dock.locator('#timer-controls')).toBeHidden();
  });

  test('a clock-time timer shows its digits but has no Pause or Reset', async ({ context }) => {
    test.skip(nearMidnight(), 'the target time would fall on tomorrow');
    const { dock } = await openPair(context);
    const target = new Date(Date.now() + 5 * 60_000);
    const at = String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
    await openEditor(dock, 'timer');
    await dock.click('#ed-mode button[data-value="clock"]');
    await dock.fill('#ed-clock', at);
    await dock.click('#ed-show');
    await expect(dock.locator('#timer-controls')).toBeVisible();
    await expect(dock.locator('#timer-live-text')).toContainText(/[3-5]:\d\d/);
    await expect(dock.locator('#btn-timer-pause')).toBeHidden();
    await expect(dock.locator('#btn-timer-reset')).toBeHidden();
  });

  test('Next item while a timer is on air leaves the live clock alone, and Pause still pauses the live one', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'timer');
    await fillDuration(dock, { title: 'Live clock', minutes: '5', seconds: '0' });
    await dock.click('#ed-add');
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Later', text: 'Coming up next' });
    await dock.click('#ed-add');
    await dock.click('#btn-next-item');
    await dock.click('#btn-show');
    await expect(overlay.locator('#ov-title')).toHaveText('Live clock');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Coming up next');
    await expect(overlay.locator('#ov-title')).toHaveText('Live clock');
    await expect(dock.locator('#timer-controls')).toBeVisible();
    await dock.click('#btn-timer-pause');
    await expect(dock.locator('#btn-timer-pause')).toHaveText('Resume');
    await expect(overlay.locator('#ov-title')).toHaveText('Live clock');
    await expect(bodyOf(overlay)).toHaveText(/^\d:\d\d$/);
    await expect(bodyOf(overlay)).not.toHaveText('Coming up next');
  });

  test('a style change keeps the clock running instead of restarting or swapping it', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await showTimerNow(dock);
    await dock.waitForTimeout(2300);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-7]$/);
    await dock.click('#tab-style');
    await dock.click('#position-seg button[data-value="top"]');
    await expect(overlay.locator('#stage.pos-top')).toHaveCount(1);
    await expect(bodyOf(overlay)).toHaveText(/^4:5[0-6]$/);
    await expect(overlay.locator('#ov-title')).toHaveText('Back in');
  });
});

test.describe('review fixes', () => {
  test('Save on the loaded item reloads it, so the next Show uses the edited text', async ({ context }) => {
    const { dock, overlay } = await openPair(context);
    await openEditor(dock, 'announcement');
    await fillAnnouncement(dock, { title: 'Welcome', text: 'Typo texxt' });
    await dock.click('#ed-add');
    await dock.click('#btn-next-item');
    await expect(dock.locator('#preview-text')).toHaveText('Typo texxt');
    await dock.locator('.plan-item .plan-more').click();
    await dock.getByRole('button', { name: 'Edit' }).click();
    await dock.fill('#ed-text', 'Fixed text');
    await dock.click('#ed-add');
    await expect(dock.locator('#preview-text')).toHaveText('Fixed text');
    await expect(overlay.locator('#stage.hidden')).toHaveCount(1);
    await dock.click('#btn-show');
    await expect(bodyOf(overlay)).toHaveText('Fixed text');
  });
});