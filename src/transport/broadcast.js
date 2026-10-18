import { DEFAULTS, STATE_VERSION, nextSeq, normalizeState } from '../core/state.js';

export const CHANNEL_NAME  = 'obs-stage-display';
export const STATE_KEY     = 'obs-stage-display-state';
export const POLL_INTERVAL = 80;

/**
 * Dock → overlay transport over BroadcastChannel, with a localStorage
 * `storage` event and a polling fallback for OBS builds where the first two
 * are unreliable between browser sources. Same interface as the future
 * WebSocket transport: send, subscribe, start, status, dispose.
 */
export function createBroadcastTransport({
  role, channel = null, storage = null,
  pollMs = POLL_INTERVAL, onError = () => {}, now = Date.now,
}) {
  const listeners = new Set();
  let lastSeq = 0;
  let timer   = null;
  let storageListener = null;

  const readStored = () => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      onError(err);
      return null;
    }
  };

  // The dock continues numbering from whatever was last stored, so seq keeps
  // rising across dock restarts. The overlay starts at 0 so it can restore.
  if (role === 'dock') {
    const stored = readStored();
    if (stored && typeof stored.seq === 'number') lastSeq = stored.seq;
  }

  function dispatch(raw) {
    const state = normalizeState(raw);
    if (!state || state.seq <= lastSeq) return;
    lastSeq = state.seq;
    for (const fn of listeners) {
      try { fn(state); } catch (err) { onError(err); }
    }
  }

  function send(partial) {
    const seq = nextSeq(lastSeq, now());
    const payload = {
      ...DEFAULTS, ...partial, version: STATE_VERSION, seq,
      customColors: { ...DEFAULTS.customColors, ...(partial.customColors || {}) },
    };
    lastSeq = seq;
    if (channel) { try { channel.postMessage(payload); } catch (err) { onError(err); } }
    if (storage) { try { storage.setItem(STATE_KEY, JSON.stringify(payload)); } catch (err) { onError(err); } }
    return payload;
  }

  function start() {
    if (channel) channel.onmessage = (e) => dispatch(e.data);

    if (typeof globalThis.addEventListener === 'function') {
      storageListener = (e) => {
        if (e.key !== STATE_KEY || !e.newValue) return;
        try { dispatch(JSON.parse(e.newValue)); } catch (err) { onError(err); }
      };
      globalThis.addEventListener('storage', storageListener);
    }

    // On load the overlay restores whatever was last on screen, so an OBS
    // restart mid-service brings the verse or slide straight back.
    if (role === 'overlay') {
      const stored = readStored();
      if (stored && stored.visible) dispatch(stored);
    }

    timer = setInterval(() => {
      const stored = readStored();
      if (stored) dispatch(stored);
    }, pollMs);
  }

  function dispose() {
    if (timer) clearInterval(timer);
    timer = null;
    if (channel) channel.onmessage = null;
    if (storageListener && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('storage', storageListener);
    }
    listeners.clear();
  }

  return {
    send,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start,
    status: () => ({ kind: 'broadcast', hasChannel: !!channel, lastSeq }),
    dispose,
  };
}
