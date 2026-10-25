const err = (name) => Object.assign(new Error(name), { name });

const bytesOf = (value) => {
  if (value instanceof Uint8Array) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new TextEncoder().encode(String(value)).buffer;
};

export function createFakeDir(initial = {}) {
  const files = new Map(Object.entries(initial));
  const readable = (name) => ({ text: async () => String(files.get(name)), arrayBuffer: async () => bytesOf(files.get(name)) });
  const dir = {
    name: 'songs',
    files,
    subdirs: new Map(),
    denied: false,
    guard() { if (dir.denied) throw err('NotAllowedError'); },
    async getDirectoryHandle(name, { create = false } = {}) {
      dir.guard();
      if (!dir.subdirs.has(name)) {
        if (!create) throw err('NotFoundError');
        dir.subdirs.set(name, createFakeDir());
      }
      return dir.subdirs.get(name);
    },
    async getFileHandle(name, { create = false } = {}) {
      dir.guard();
      if (!files.has(name)) {
        if (!create) throw err('NotFoundError');
        files.set(name, '');
      }
      return {
        kind: 'file',
        name,
        async getFile() { return readable(name); },
        async createWritable() {
          dir.guard();
          let buffer = '';
          return {
            async write(data) { buffer = typeof data === 'string' ? buffer + data : data; },
            async close() { files.set(name, buffer); },
            async abort() {},
          };
        },
      };
    },
    async removeEntry(name) {
      dir.guard();
      if (!files.has(name)) throw err('NotFoundError');
      files.delete(name);
    },
    async *values() {
      dir.guard();
      for (const name of [...files.keys()]) yield { kind: 'file', name, getFile: async () => readable(name) };
      for (const name of dir.subdirs.keys()) yield { kind: 'directory', name };
    },
  };
  return dir;
}
