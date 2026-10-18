import { describe, it, expect, vi } from 'vitest';
import { createSession } from '../../src/dock/session.js';

function setup() {
  const sent = [];
  const transport = { send: (s) => { sent.push(s); return s; } };
  const onChange = vi.fn();
  const content = {
    verse: { body: 'For God so loved', reference: 'John 3:16 — KJV' },
    song:  { title: 'Amazing Grace', body: 'Amazing grace' },
  };
  const session = createSession({
    transport,
    readSettings: () => ({ theme: 'dark', opacity: 88 }),
    providers: { scripture: () => content.verse, songs: () => content.song },
    onChange,
  });
  return { session, sent, onChange };
}

describe('session', () => {
  it('starts off on the scripture tab', () => {
    const { session } = setup();
    expect(session).toMatchObject({ activeTab: 'scripture', isLive: false, liveTab: null, phase: 'off' });
  });

  it('shows the current tab as a verse', () => {
    const { session, sent } = setup();
    session.show();
    expect(sent[0]).toMatchObject({ action: 'show', visible: true, kind: 'verse', body: 'For God so loved', reference: 'John 3:16 — KJV', title: '', theme: 'dark' });
    expect(session).toMatchObject({ isLive: true, liveTab: 'scripture', phase: 'live' });
  });

  it('shows the songs tab as a song', () => {
    const { session, sent } = setup();
    session.setTab('songs');
    session.show();
    expect(sent[0]).toMatchObject({ kind: 'song', title: 'Amazing Grace', body: 'Amazing grace', reference: '' });
  });

  it('keeps restyling the LIVE content after the operator switches tabs', () => {
    const { session, sent } = setup();
    session.show();
    session.setTab('songs');
    session.resendIfLive();
    expect(sent.at(-1)).toMatchObject({ kind: 'verse', body: 'For God so loved' });
  });

  it('swaps content only when Show is pressed again', () => {
    const { session, sent } = setup();
    session.show();
    session.setTab('songs');
    session.show();
    expect(sent.at(-1)).toMatchObject({ kind: 'song' });
    expect(session.liveTab).toBe('songs');
  });

  it('does nothing on resend when nothing is live', () => {
    const { session, sent } = setup();
    session.resendIfLive();
    expect(sent).toHaveLength(0);
  });

  it('hides and clears', () => {
    const { session, sent } = setup();
    session.show();
    session.hide();
    expect(sent.at(-1)).toMatchObject({ action: 'hide', visible: false });
    expect(session).toMatchObject({ isLive: false, phase: 'hidden' });
    session.clear();
    expect(sent.at(-1)).toMatchObject({ action: 'clear', visible: false });
    expect(session).toMatchObject({ isLive: false, liveTab: null, phase: 'off' });
  });

  it('notifies on change and ignores unknown tabs', () => {
    const { session, onChange } = setup();
    session.setTab('songs');
    expect(onChange).toHaveBeenLastCalledWith({ activeTab: 'songs', isLive: false, liveTab: null, phase: 'off' });
    onChange.mockClear();
    session.setTab('nonsense');
    expect(onChange).not.toHaveBeenCalled();
    expect(session.activeTab).toBe('songs');
  });
});
