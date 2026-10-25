/** Open the overlay first, then the dock, in the same browser context (so they share storage and channels). */
export async function openPair(context) {
  const overlay = await context.newPage();
  const dock = await context.newPage();
  await overlay.goto('/overlay.html');
  await dock.goto('/dock.html');
  return { dock, overlay };
}

/** Type into the smart box and press Enter. */
export async function lookup(dock, text) {
  await dock.click('#tab-scripture');
  await dock.fill('#smart-input', text);
  await dock.press('#smart-input', 'Enter');
}

/** Create a song through the editor, then leave the editor so its slide cards show. */
export async function createSong(dock, title, slides) {
  await dock.click('#tab-songs');
  await dock.click('#btn-new-song');
  await dock.fill('#song-title-input', title);
  for (const text of slides) {
    await dock.fill('#slide-textarea', text);
    await dock.click('#btn-add-slide');
  }
  await dock.click('#btn-done-edit');
}

/** Make every request to the Bible API fail, so verses must come from the bundled translations. */
export async function blockBibleApi(context) {
  await context.route('https://bolls.life/**', (route) => route.abort());
}

/** Open the overlay and return a push(state) that drives it the way the dock does, plus its main locators. */
export async function setupOverlay(page, defaults = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/overlay.html');
  let seq = Date.now();
  const push = (state) => page.evaluate(
    ([key, payload]) => localStorage.setItem(key, JSON.stringify(payload)),
    ['obs-stage-display-state', { action: 'show', version: 1, visible: true, ...defaults, ...state, seq: (seq += 1) }],
  );
  return { push, errors, stage: page.locator('#stage'), body: page.locator('#ov-body'), title: page.locator('#ov-title') };
}
