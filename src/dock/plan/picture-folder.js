import { ensurePermission, saveHandle, loadHandle } from '../../songs/folder.js';

const PICKER_ID = 'obs-pictures';

/**
 * The picture folder: chosen once, remembered across restarts. After a restart
 * the browser may need one click to confirm access again (state "needs-permission").
 */
export function createPictureFolder({
  logoStore, kv, report = () => {}, onChange = () => {},
  canPick = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
  showPicker = (options) => window.showDirectoryPicker(options),
}) {
  let handle = null;
  let state = 'none';   // 'none' | 'ready' | 'needs-permission'

  async function activate(chosen) {
    handle = chosen;
    await logoStore.usePictureFolder(chosen);
    state = 'ready';
    onChange();
  }

  return {
    supported: canPick,
    status: () => ({ state, name: handle ? handle.name : '' }),

    /** Ask for a folder. False when the person closes the chooser without picking one. */
    async choose() {
      let chosen;
      try {
        chosen = await showPicker({ id: PICKER_ID, mode: 'readwrite' });
      } catch (err) {
        if (err.name === 'AbortError') return false;
        report(err);
        throw err;
      }
      await saveHandle(kv, chosen);
      await activate(chosen);
      return true;
    },

    /** At startup: use the remembered folder if access is still granted, else wait for a click. */
    async restore() {
      try {
        const remembered = await loadHandle(kv);
        if (!remembered) return;
        handle = remembered;
        if (await ensurePermission(remembered)) await activate(remembered);
        else { state = 'needs-permission'; onChange(); }
      } catch (err) {
        report(err);
        handle = null;
        state = 'none';
      }
    },

    /** Ask the browser for access again. Must run from a click. */
    async reconnect() {
      if (!handle) return false;
      try {
        if (!(await ensurePermission(handle, { request: true }))) return false;
        await activate(handle);
        return true;
      } catch (err) {
        report(err);
        return false;
      }
    },

    async forget() {
      handle = null;
      state = 'none';
      await saveHandle(kv, null);
      await logoStore.usePictureFolder(null);
      onChange();
    },
  };
}
