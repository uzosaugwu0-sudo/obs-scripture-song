import { describe, it, expect } from 'vitest';
import { createRecordFolder, safeFilename } from '../../src/core/record-folder.js';
import { createFakeDir } from '../helpers/fake-dir.js';

const opts = { isRecord: (x) => !!x && typeof x.id === 'string', toRecord: (x) => ({ ...x }), nameOf: (r) => r.name, label: 'thing' };

describe('safeFilename', () => {
  it('uses the given fallback when nothing safe is left', () => {
    expect(safeFilename('???', 'plan')).toBe('plan');
    expect(safeFilename('???')).toBe('song');
    expect(safeFilename('')).toBe('untitled');
  });
});

describe('createRecordFolder', () => {
  it('writes and lists records, and names the label in the message for other files', async () => {
    const dir = createFakeDir({ 'x.json': '{"nope":1}' });
    const folder = createRecordFolder(dir, opts);
    await folder.write({ id: '1', name: 'A/B' });
    expect(dir.files.has('A_B.json')).toBe(true);
    const { records, errors } = await folder.list();
    expect(records).toEqual([{ id: '1', name: 'A/B' }]);
    expect(errors).toEqual([{ file: 'x.json', message: 'Not a thing file' }]);
  });

  it('writes plain text files and falls back to the label for an unusable name', async () => {
    const dir = createFakeDir();
    const folder = createRecordFolder(dir, opts);
    await folder.writeText('notes.txt', 'hi');
    expect(dir.files.get('notes.txt')).toBe('hi');
    await folder.write({ id: '2', name: '???' });
    expect(dir.files.has('thing.json')).toBe(true);
  });

  it('ignores subfolders when listing', async () => {
    const dir = createFakeDir();
    await dir.getDirectoryHandle('plans', { create: true });
    const { records, errors } = await createRecordFolder(dir, opts).list();
    expect(records).toEqual([]);
    expect(errors).toEqual([]);
  });
});
