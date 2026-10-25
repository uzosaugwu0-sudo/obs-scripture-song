import { writeFileAtomic } from '../../core/record-folder.js';
import { MAX_LOGO_DATA_URL } from '../../core/state.js';
import { isValidLogoName, logoFileName, fitSize } from '../../plan/logos.js';

const LOGOS_DIR = 'logos';
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;   // refuse huge originals before decoding them

/** Shrink a picture file to the logo size and encode it as PNG bytes. Runs in the browser. */
export async function encodeLogo(file) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('That file is not a picture.');
  if (file.size > MAX_PICTURE_BYTES) throw new Error('That picture is too large.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('That picture could not be read.'); }
  const size = fitSize(bitmap.width, bitmap.height);
  if (!size) throw new Error('That picture could not be read.');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('That picture could not be converted.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (Math.ceil(bytes.length / 3) * 4 > MAX_LOGO_DATA_URL) throw new Error('That picture is too detailed. Try a simpler one.');
  return bytes;
}

/** Picture bytes as a PNG data URL, the form the overlay is sent. */
export const logoDataUrl = (bytes) => 'data:image/png;base64,' + toBase64(bytes);

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

async function listNames(dir) {
  const names = [];
  for await (const entry of dir.values()) if (entry.kind === 'file' && isValidLogoName(entry.name)) names.push(entry.name);
  return names.sort();
}

/**
 * The pictures for lower thirds. They come from a picture folder the person
 * chose once anywhere on the PC, or else from logos/ inside the library folder.
 * The overlay cannot read either, so the dock reads a picture here, shrinks it,
 * and sends it inline with the lower third.
 */
export function createLogoStore({ onError = () => {}, encode = encodeLogo } = {}) {
  let libraryDir = null;   // logos/ inside the library folder, the fallback
  let pictureDir = null;   // the folder the person chose, used first
  let names = [];

  const active = () => pictureDir || libraryDir;

  /** Look at the folder again, so pictures added outside the app show up. */
  async function refresh() {
    const dir = active();
    try {
      names = dir ? await listNames(dir) : [];
    } catch (err) {
      onError(err);
      names = [];
    }
  }

  return {
    async attach(libraryHandle) {
      libraryDir = await libraryHandle.getDirectoryHandle(LOGOS_DIR, { create: true });
      await refresh();
    },
    detach() {
      libraryDir = null;
      if (!pictureDir) names = [];
    },
    /** Use a folder chosen by the person (null goes back to the library folder). */
    async usePictureFolder(handle) {
      pictureDir = handle;
      await refresh();
    },
    pictureFolderName: () => (pictureDir ? pictureDir.name : ''),
    refresh,
    available: () => active() !== null,
    list: () => names.slice(),
    has: (name) => names.includes(name),
    async add(file) {
      const dir = active();
      if (!dir) throw new Error('Choose a picture folder first.');
      const bytes = await encode(file);
      const name = logoFileName(file.name, names);
      await writeFileAtomic(dir, name, bytes);
      names = [...names, name].sort();
      return name;
    },
    async read(name) {
      const dir = active();
      if (!dir || !isValidLogoName(name)) return null;
      try {
        const handle = await dir.getFileHandle(name);
        return logoDataUrl(await encode(await handle.getFile()));
      } catch (err) {
        if (err.name !== 'NotFoundError') onError(err);
        return null;
      }
    },
  };
}
