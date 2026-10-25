const BACKSLASH = String.fromCharCode(92);

export function safeFilename(title, fallback = 'song') {
  return (title || 'untitled')
    .replace(/[<>:"/|?*\x00-\x1f]/g, '_').split(BACKSLASH).join('_').replace(/\s+/g, '_')
    .replace(/_+/g, '_').slice(0, 80).replace(/^_+|_+$/g, '') || fallback;
}

/** Write a file through a swap file, so a crash mid-write leaves the previous version intact. */
export async function writeFileAtomic(dirHandle, name, data) {
  const handle   = await dirHandle.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (err) {
    try { await writable.abort(); } catch { /* stream already closed; surface the original error */ }
    throw err;
  }
}

/**
 * One JSON file per record in a user-chosen directory. createWritable() writes
 * to a swap file and only replaces the original on close(), so a crash
 * mid-write leaves the previous version intact; we abort() on failure.
 * Files that are not records are reported by list() and never overwritten.
 */
export function createRecordFolder(dirHandle, { isRecord, toRecord, nameOf, label = 'song' }) {
  const fileOf   = new Map();   // record id to file name
  const occupied = new Set();   // lower-cased names of files that are not ours

  const writeText = (name, text) => writeFileAtomic(dirHandle, name, text);

  async function removeFile(name) {
    try {
      await dirHandle.removeEntry(name);
    } catch (err) {
      if (err.name !== 'NotFoundError') throw err;
    }
  }

  function unusedName(base, id) {
    const taken = new Set(occupied);
    for (const [otherId, name] of fileOf) if (otherId !== id) taken.add(name.toLowerCase());
    let name = `${base}.json`;
    let n = 2;
    while (taken.has(name.toLowerCase())) { name = `${base} (${n}).json`; n += 1; }
    return name;
  }

  async function list() {
    const records = [];
    const errors  = [];
    const seen    = new Set();   // ids already read, so a copied file cannot shadow the original
    fileOf.clear();
    occupied.clear();
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
      try {
        const file = await entry.getFile();
        const data = JSON.parse(await file.text());
        if (!isRecord(data)) throw new Error(`Not a ${label} file`);
        if (seen.has(data.id)) throw new Error('Duplicate id ' + data.id);
        seen.add(data.id);
        records.push(toRecord(data));
        fileOf.set(data.id, entry.name);
      } catch (err) {
        occupied.add(entry.name.toLowerCase());
        errors.push({ file: entry.name, message: err.message });
      }
    }
    return { records, errors };
  }

  async function write(record) {
    const clean = toRecord(record);
    const previous = fileOf.get(clean.id);
    const name = unusedName(safeFilename(nameOf(clean), label), clean.id);
    await writeText(name, JSON.stringify(clean, null, 2));
    fileOf.set(clean.id, name);
    if (previous && previous !== name) await removeFile(previous);
  }

  async function remove(id) {
    const name = fileOf.get(id);
    if (!name) return;
    await removeFile(name);
    fileOf.delete(id);
  }

  return { name: dirHandle.name, list, write, remove, writeText };
}
