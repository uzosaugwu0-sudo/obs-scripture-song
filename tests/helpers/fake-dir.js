const err = (name) => Object.assign(new Error(name), { name });

export function createFakeDir(initial = {}) {
  const files = new Map(Object.entries(initial));
  const dir = {
    name: 'songs',
    files,
    denied: false,
    guard() { if (dir.denied) throw err('NotAllowedError'); },
    async getFileHandle(name, { create = false } = {}) {
      dir.guard();
      if (!files.has(name)) {
        if (!create) throw err('NotFoundError');
        files.set(name, '');
      }
      return {
        kind: 'file',
        name,
        async getFile() { return { text: async () => files.get(name) }; },
        async createWritable() {
          dir.guard();
          let buffer = '';
          return {
            async write(text) { buffer += text; },
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
      for (const name of [...files.keys()]) {
        yield { kind: 'file', name, getFile: async () => ({ text: async () => files.get(name) }) };
      }
    },
  };
  return dir;
}
