import { describe, it, expect } from 'vitest';
import { createSession } from '../../src/dock/session.js';

function setup() {
  const sent = [];
  let timer = { endAt: 5000 };
  const providers = {
    scripture: () => ({ body: 'verse text', reference: 'John 3:16' }),
    songs: () => ({ title: 'Song', body: 'la la' }),
    announcement: () => ({ title: 'Welcome', body: 'Hello' }),
    timer: () => ({ title: 'Back in', body: '', timer }),
  };
  const session = createSession({
    transport: { send: (s) => { sent.push(s); return s; } },
    readSettings: () => ({ theme: 'frosted' }),
    providers,
  });
  return { session, sent, setTimer: (t) => { timer = t; } };
}

describe('announcement and timer tabs', () => {
  it('accepts the new tab names and sends the matching kinds', () => {
    const { session, sent } = setup();
    session.setTab('announcement');
    expect(session.activeTab).toBe('announcement');
    session.show();
    expect(sent.at(-1)).toMatchObject({ action: 'show', kind: 'announcement', title: 'Welcome', body: 'Hello' });
    session.setTab('timer');
    session.show();
    expect(sent.at(-1)).toMatchObject({ kind: 'timer', title: 'Back in', timer: { endAt: 5000 } });
  });

  it('still ignores unknown tabs', () => {
    const { session } = setup();
    session.setTab('nonsense');
    expect(session.activeTab).toBe('scripture');
  });

  it('keeps the timer field in the on-air snapshot, so a restyle keeps the same clock', () => {
    const { session, sent, setTimer } = setup();
    session.setTab('timer');
    session.show();
    setTimer({ endAt: 9999 });
    session.resendIfLive();
    expect(sent.at(-1).timer).toEqual({ endAt: 5000 });
  });
});

describe('updateLive and liveContent', () => {
  it('merges a patch into the on-air snapshot and re-sends it as a show', () => {
    const { session, sent } = setup();
    session.setTab('timer');
    session.show();
    session.updateLive({ timer: { remainingMs: 1000 } });
    expect(sent.at(-1)).toMatchObject({ action: 'show', visible: true, kind: 'timer', title: 'Back in', timer: { remainingMs: 1000 } });
    expect(session.liveContent.timer).toEqual({ remainingMs: 1000 });
    session.resendIfLive();
    expect(sent.at(-1).timer).toEqual({ remainingMs: 1000 });
  });

  it('does nothing when nothing is live or after Clear', () => {
    const { session, sent } = setup();
    session.updateLive({ timer: { remainingMs: 1 } });
    expect(sent).toHaveLength(0);
    session.setTab('timer');
    session.show();
    session.clear();
    const count = sent.length;
    session.updateLive({ timer: { remainingMs: 1 } });
    expect(sent).toHaveLength(count);
    expect(session.liveContent).toBeNull();
  });
});
