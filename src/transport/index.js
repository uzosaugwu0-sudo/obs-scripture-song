import { CHANNEL_NAME, createBroadcastTransport } from './broadcast.js';

/** Real BroadcastChannel + localStorage. A missing piece is reported, not fatal. */
export function createBrowserTransport(role, onError = () => {}) {
  let channel = null;
  try { channel = new BroadcastChannel(CHANNEL_NAME); } catch (err) { onError(err); }
  let storage = null;
  try { storage = window.localStorage; } catch (err) { onError(err); }
  return createBroadcastTransport({ role, channel, storage, onError });
}
