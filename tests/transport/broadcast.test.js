import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBroadcastTransport, STATE_KEY } from '../../src/transport/broadcast.js';
import { memoryStorage } from '../helpers/memory-storage.js';

function channelPair() {
  const a = { onmessage: null };
  const b = { onmessage: null };
  a.postMessage = (m) => queueMicrotask(() => b.onmessage?.({ data: m }));
  b.postMessage = (m) => queueMicrotask(() => a.onmessage?.({ data: m }));
  return [a, b];
}
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('broadcast transport', () => {
  it('delivers a sent state to the other side over the channel', async () => {
    const [ca, cb] = channelPair();
    const dock = createBroadcastTransport({ role: 'dock', channel: ca, storage: memoryStorage() });
    const overlay = createBroadcastTransport({ role: 'overlay', channel: cb, storage: memoryStorage() });
    const seen = [];
    overlay.subscribe((s) => seen.push(s));
    overlay.start();

    dock.send({ action: 'show', kind: 'verse', body: 'For God so loved', visible: true });
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ action: 'show', body: 'For God so loved', version: 1 });
    dock.dispose(); overlay.dispose();
  });

  it('restores a visible state when the overlay starts after the dock sent it', () => {
    const storage = memoryStorage();
    const dock = createBroadcastTransport({ role: 'dock', channel: null, storage });
    dock.send({ action: 'show', visible: true, body: 'x' });

    const overlay = createBroadcastTransport({ role: 'overlay', channel: null, storage });
    const seen = [];
    overlay.subscribe((s) => seen.push(s));
    overlay.start();

    expect(seen).toHaveLength(1);
    expect(seen[0].body).toBe('x');
    dock.dispose(); overlay.dispose();
  });

  it('delivers once when both the channel and the poll see the same state', async () => {
    const [ca, cb] = channelPair();
    const storage = memoryStorage();
    const dock = createBroadcastTransport({ role: 'dock', channel: ca, storage });
    const overlay = createBroadcastTransport({ role: 'overlay', channel: cb, storage });
    const seen = [];
    overlay.subscribe((s) => seen.push(s));
    overlay.start();

    dock.send({ action: 'show', visible: true, body: 'once' });
    await vi.advanceTimersByTimeAsync(500);

    expect(seen).toHaveLength(1);
    dock.dispose(); overlay.dispose();
  });

  it('keeps seq strictly increasing with a frozen clock and across restarts', () => {
    const frozen = () => 1000;
    const storage = memoryStorage({ [STATE_KEY]: JSON.stringify({ action: 'hide', seq: 5000, version: 1 }) });
    const dock = createBroadcastTransport({ role: 'dock', channel: null, storage, now: frozen });
    const first = dock.send({ action: 'show' }).seq;
    const second = dock.send({ action: 'hide' }).seq;
    expect(first).toBe(5001);
    expect(second).toBe(5002);
    dock.dispose();
  });

  it('survives a throwing listener, reports it, and still serves the others', () => {
    const storage = memoryStorage();
    const onError = vi.fn();
    const dock = createBroadcastTransport({ role: 'dock', channel: null, storage });
    dock.send({ action: 'show', visible: true, body: 'x' });
    const overlay = createBroadcastTransport({ role: 'overlay', channel: null, storage, onError });
    const good = vi.fn();
    overlay.subscribe(() => { throw new Error('render exploded'); });
    overlay.subscribe(good);
    overlay.start();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    dock.dispose(); overlay.dispose();
  });

  it.each([
    ['an unknown kind', JSON.stringify({ action: 'show', kind: 'banner', seq: 9, version: 1, visible: true })],
    ['a newer version', JSON.stringify({ action: 'show', kind: 'verse', seq: 9, version: 99, visible: true })],
    ['a pre-upgrade state with no seq', JSON.stringify({ action: 'show', kind: 'verse', timestamp: 123, visible: true })],
  ])('ignores %s without calling listeners', async (_label, raw) => {
    const overlay = createBroadcastTransport({ role: 'overlay', channel: null, storage: memoryStorage({ [STATE_KEY]: raw }) });
    const fn = vi.fn();
    overlay.subscribe(fn);
    overlay.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).not.toHaveBeenCalled();
    overlay.dispose();
  });

  it('reports unparseable storage and keeps running', async () => {
    const onError = vi.fn();
    const overlay = createBroadcastTransport({ role: 'overlay', channel: null, storage: memoryStorage({ [STATE_KEY]: '{garbage' }), onError });
    overlay.subscribe(() => {});
    overlay.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(onError).toHaveBeenCalled();
    overlay.dispose();
  });
});
