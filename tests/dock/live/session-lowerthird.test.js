import { describe, it, expect } from 'vitest';
import { createSession } from '../../../src/dock/live/session.js';

function setup() {
  const sent = [];
  let content = { title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'center', logo: 'data:image/png;base64,AAAA' } };
  const session = createSession({
    transport: { send: (s) => { sent.push(s); return s; } },
    readSettings: () => ({ theme: 'frosted' }),
    providers: { lowerthird: () => content },
  });
  return { session, sent, setContent: (c) => { content = c; } };
}

describe('lowerthird tab', () => {
  it('is a known tab and sends the lowerthird kind with its field', () => {
    const { session, sent } = setup();
    session.setTab('lowerthird');
    expect(session.activeTab).toBe('lowerthird');
    session.show();
    expect(sent.at(-1)).toMatchObject({ action: 'show', kind: 'lowerthird', title: 'Pastor John', body: 'Guest speaker', lowerthird: { align: 'center', logo: 'data:image/png;base64,AAAA' } });
  });

  it('a restyle re-sends the same picture and placement, even if another one was loaded since', () => {
    const { session, sent, setContent } = setup();
    session.setTab('lowerthird');
    session.show();
    setContent({ title: 'Someone Else', body: '', lowerthird: { align: 'right', logo: null } });
    session.resendIfLive();
    expect(sent.at(-1)).toMatchObject({ title: 'Pastor John', lowerthird: { align: 'center', logo: 'data:image/png;base64,AAAA' } });
  });
});
