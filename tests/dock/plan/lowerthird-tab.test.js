import { describe, it, expect, vi } from 'vitest';
import { initExtrasTab } from '../../../src/dock/plan/extras-tab.js';

const LOGO = 'data:image/png;base64,AAAA';
const item = (extra = {}) => ({ id: 'i', type: 'lowerthird', name: ' Pastor John ', info: ' Guest speaker ', align: 'center', logo: null, hideAfter: null, ...extra });

function setup({ withStore = true } = {}) {
  const timers = [];
  const session = { isLive: false, liveTab: null, activeTab: 'lowerthird', hide: vi.fn(), updateLive: vi.fn() };
  const logoStore = withStore ? { read: vi.fn(async (name) => (name === 'john.png' ? LOGO : null)) } : null;
  const refresh = vi.fn();
  const tabs = initExtrasTab({
    session, refresh, startTicker: false, logoStore,
    setTimer: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimer: (handle) => { timers[handle].cleared = true; },
  });
  const fire = (index = timers.length - 1) => { if (!timers[index].cleared) timers[index].fn(); };
  return { tab: tabs.lowerthird, session, logoStore, timers, fire, refresh };
}

describe('loading and content', () => {
  it('loads trimmed text and reports whether there is any', () => {
    const { tab } = setup();
    expect(tab.preview().has).toBe(false);
    expect(tab.load(item())).toBe(true);
    expect(tab.getContent()).toEqual({ title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'center', logo: null } });
    expect(tab.preview()).toMatchObject({ has: true, text: 'Pastor John', sub: 'Lower third · Guest speaker', canNav: false });
    expect(tab.load(item({ name: '', info: '' }))).toBe(false);
  });

  it('previews with just the info when there is no name', () => {
    const { tab } = setup();
    tab.load(item({ name: '' }));
    expect(tab.preview()).toMatchObject({ has: true, text: 'Guest speaker', sub: 'Lower third' });
  });
});

describe('the picture', () => {
  it('is read in the background and ready() resolves once it has arrived', async () => {
    const { tab, logoStore } = setup();
    tab.load(item({ logo: 'john.png' }));
    expect(tab.getContent().lowerthird.logo).toBeNull();
    await tab.ready();
    expect(logoStore.read).toHaveBeenCalledWith('john.png');
    expect(tab.getContent().lowerthird.logo).toBe(LOGO);
  });

  it('a missing file leaves the text and no picture', async () => {
    const { tab } = setup();
    tab.load(item({ logo: 'gone.png' }));
    await tab.ready();
    expect(tab.getContent()).toMatchObject({ title: 'Pastor John', lowerthird: { logo: null } });
  });

  it('with no logo store the text still loads and ready() resolves', async () => {
    const { tab } = setup({ withStore: false });
    expect(tab.load(item({ logo: 'john.png' }))).toBe(true);
    await tab.ready();
    expect(tab.getContent().lowerthird.logo).toBeNull();
  });

  it('a slow read for an earlier item never lands on a later one', async () => {
    const { tab, logoStore } = setup();
    let release;
    logoStore.read.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(LOGO); }));
    tab.load(item({ logo: 'john.png' }));
    tab.load(item({ name: 'Someone Else', logo: null }));
    release();
    await tab.ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tab.getContent()).toMatchObject({ title: 'Someone Else', lowerthird: { logo: null } });
  });
});

describe('ready() waits for the newest picture', () => {
  it('does not resolve on an older read while a newer item is still loading', async () => {
    const { tab, logoStore } = setup();
    const releases = [];
    logoStore.read.mockImplementation(() => new Promise((resolve) => { releases.push(() => resolve(LOGO)); }));
    tab.load(item({ logo: 'john.png' }));
    let done = false;
    const waiting = tab.ready().then(() => { done = true; });
    tab.load(item({ name: 'Second', logo: 'john.png' }));
    releases[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);
    releases[1]();
    await waiting;
    expect(done).toBe(true);
    expect(tab.getContent()).toMatchObject({ title: 'Second', lowerthird: { logo: LOGO } });
  });
});

describe('the automatic hide', () => {
  it('arms a timer at Show and hides once when it fires while that lower third is on air', () => {
    const { tab, session, timers, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(8000);
    session.isLive = true;
    session.liveTab = 'lowerthird';
    fire();
    expect(session.hide).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no hide time', () => {
    const { tab, timers } = setup();
    tab.load(item());
    tab.markShown();
    expect(timers).toHaveLength(0);
  });

  it('does nothing if Hide was pressed first', () => {
    const { tab, session, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    session.isLive = false;
    session.liveTab = 'lowerthird';
    fire();
    expect(session.hide).not.toHaveBeenCalled();
  });

  it('does nothing if something else is on air by then (another card, or Clear)', () => {
    const { tab, session, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    session.isLive = true;
    session.liveTab = 'announcement';
    fire();
    session.liveTab = null;
    fire();
    expect(session.hide).not.toHaveBeenCalled();
  });

  it('a newer Show cancels the older timer, so only the newest can hide', () => {
    const { tab, session, timers, fire } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    tab.load(item({ name: 'Second', hideAfter: 20 }));
    tab.markShown();
    expect(timers[0].cleared).toBe(true);
    session.isLive = true;
    session.liveTab = 'lowerthird';
    timers[0].fn();
    expect(session.hide).not.toHaveBeenCalled();
    fire(1);
    expect(session.hide).toHaveBeenCalledTimes(1);
  });

  it('a newer Show with no hide time cancels the older timer', () => {
    const { tab, session, timers } = setup();
    tab.load(item({ hideAfter: 8 }));
    tab.markShown();
    tab.load(item({ name: 'Stays' }));
    tab.markShown();
    expect(timers[0].cleared).toBe(true);
    session.isLive = true;
    session.liveTab = 'lowerthird';
    timers[0].fn();
    expect(session.hide).not.toHaveBeenCalled();
  });
});
