import { describe, it, expect, vi } from 'vitest';
import { initExtrasTab } from '../../../src/dock/plan/extras-tab.js';

function setup() {
  const clock = { t: new Date(2026, 9, 25, 9, 0, 0).getTime() };
  const session = { isLive: false, liveTab: null, activeTab: 'timer', updateLive: vi.fn() };
  const refresh = vi.fn();
  const tabs = initExtrasTab({ session, refresh, now: () => clock.t, startTicker: false });
  return { tabs, session, refresh, clock };
}
const timerItem = (seconds, title = '') => ({ id: 'i', type: 'timer', mode: 'duration', seconds, title });

describe('announcement tab', () => {
  it('loads trimmed content and previews it', () => {
    const { tabs, refresh } = setup();
    expect(tabs.announcement.preview().has).toBe(false);
    expect(tabs.announcement.load({ title: ' Welcome ', body: ' Hello there ' })).toBe(true);
    expect(tabs.announcement.getContent()).toEqual({ title: 'Welcome', body: 'Hello there' });
    expect(tabs.announcement.preview()).toMatchObject({ has: true, text: 'Hello there', sub: 'Announcement · Welcome', canNav: false });
    expect(refresh).toHaveBeenCalled();
  });
  it('refuses an empty announcement', () => {
    const { tabs } = setup();
    expect(tabs.announcement.load({ title: 'x', body: '   ' })).toBe(false);
  });
});

describe('timer tab', () => {
  it('previews the full time before Show and returns it as the content', () => {
    const { tabs } = setup();
    expect(tabs.timer.preview().has).toBe(false);
    expect(tabs.timer.load(timerItem(300, 'Back in'))).toBe(true);
    expect(tabs.timer.preview()).toMatchObject({ has: true, text: '5:00', sub: 'Timer · Back in' });
    expect(tabs.timer.getContent()).toEqual({ title: 'Back in', body: '', timer: { remainingMs: 300_000 } });
  });

  it('starts the clock at Show and returns the running end time', () => {
    const { tabs, clock } = setup();
    tabs.timer.load(timerItem(300));
    tabs.timer.markShown();
    expect(tabs.timer.getContent().timer).toEqual({ endAt: clock.t + 300_000 });
    clock.t += 60_000;
    expect(tabs.timer.preview().text).toBe('4:00');
  });

  it('refuses an invalid timer and keeps the loaded one', () => {
    const { tabs } = setup();
    tabs.timer.load(timerItem(60));
    expect(tabs.timer.load(timerItem(-1))).toBe(false);
    expect(tabs.timer.preview().text).toBe('1:00');
  });

  it('reports a live clock only while a timer is on air', () => {
    const { tabs, session } = setup();
    tabs.timer.load(timerItem(300, 'Back in'));
    tabs.timer.markShown();
    expect(tabs.timer.live()).toBeNull();
    session.isLive = true;
    session.liveTab = 'timer';
    expect(tabs.timer.live()).toEqual({ text: '5:00', title: 'Back in', paused: false, canControl: true });
    session.liveTab = 'scripture';
    expect(tabs.timer.live()).toBeNull();
  });

  it('pause, resume and reset act on the running clock through session.updateLive', () => {
    const { tabs, session, clock } = setup();
    session.isLive = true;
    session.liveTab = 'timer';
    tabs.timer.load(timerItem(300));
    tabs.timer.markShown();
    clock.t += 100_000;
    tabs.timer.pause();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { remainingMs: 200_000 } });
    expect(tabs.timer.live().paused).toBe(true);
    tabs.timer.resume();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { endAt: clock.t + 200_000 } });
    tabs.timer.reset();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { endAt: clock.t + 300_000 } });
  });

  it('loading a different timer while one is on air leaves the live clock alone', () => {
    const { tabs, session, clock } = setup();
    session.isLive = true;
    session.liveTab = 'timer';
    tabs.timer.load(timerItem(300, 'Live one'));
    tabs.timer.markShown();
    clock.t += 30_000;
    tabs.timer.load(timerItem(900, 'Next one'));
    expect(tabs.timer.live()).toMatchObject({ title: 'Live one', text: '4:30' });
    tabs.timer.pause();
    expect(session.updateLive).toHaveBeenLastCalledWith({ timer: { remainingMs: 270_000 } });
    expect(tabs.timer.getContent().timer).toEqual({ remainingMs: 900_000 });
  });

  it('does nothing when Pause is pressed and no timer is on air', () => {
    const { tabs, session } = setup();
    tabs.timer.load(timerItem(300));
    tabs.timer.markShown();
    tabs.timer.pause();
    expect(session.updateLive).not.toHaveBeenCalled();
  });
});
