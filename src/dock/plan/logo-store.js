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
 * The pictures for lower thirds: PNG files in logos/ inside the library folder.
 * The overlay cannot read the folder, so the dock reads a picture here and sends
 * it inline with the lower third.
 */
export function createLogoStore({ onError = () => {}, encode = encodeLogo } = {}) {
  let dir = null;
  let names = [];

  return {
    async attach(dirHandle) {
      const logos = await dirHandle.getDirectoryHandle(LOGOS_DIR, { create: true });
      names = await listNames(logos);
      dir = logos;
    },
    detach() { dir = null; names = []; },
    available: () => dir !== null,
    list: () => names.slice(),
    has: (name) => names.includes(name),
    async add(file) {
      if (!dir) throw new Error('Choose a library folder first.');
      const bytes = await encode(file);
      const name = logoFileName(file.name, names);
      await writeFileAtomic(dir, name, bytes);
      names = [...names, name].sort();
      return name;
    },
    async read(name) {
      if (!dir || !isValidLogoName(name)) return null;
      try {
        const handle = await dir.getFileHandle(name);
        const file = await handle.getFile();
        return logoDataUrl(new Uint8Array(await file.arrayBuffer()));
      } catch (err) {
        if (err.name !== 'NotFoundError') onError(err);
        return null;
      }
    },
  };
}
