import { describe, it, expect } from 'vitest';
import { createPlanFolder, PLANS_DIR } from '../../src/plan/folder.js';
import { createFakeDir } from '../helpers/fake-dir.js';

const plan = (id, name) => ({ v: 1, id, name, items: [{ id: 'i1', type: 'song', songId: 's' }] });

describe('createPlanFolder', () => {
  it('keeps plans in a plans/ subfolder, one JSON file each', async () => {
    const dir = createFakeDir();
    const folder = await createPlanFolder(dir);
    await folder.write(plan('p1', 'Sunday 26 Oct'));
    expect([...dir.files.keys()]).toEqual([]);
    expect([...dir.subdirs.get(PLANS_DIR).files.keys()]).toEqual(['Sunday_26_Oct.json']);
    const { records, errors } = await (await createPlanFolder(dir)).list();
    expect(records).toEqual([plan('p1', 'Sunday 26 Oct')]);
    expect(errors).toEqual([]);
  });

  it('lists foreign, broken and newer-version files as unreadable and never overwrites them', async () => {
    const dir = createFakeDir();
    const sub = await dir.getDirectoryHandle(PLANS_DIR, { create: true });
    sub.files.set('Hymn.json', '{"version":1,"songs":[]}');
    sub.files.set('broken.json', 'nope');
    sub.files.set('Future.json', JSON.stringify({ ...plan('p9', 'Future'), v: 2 }));
    const folder = await createPlanFolder(dir);
    const { records, errors } = await folder.list();
    expect(records).toEqual([]);
    expect(errors.map((e) => e.file).sort()).toEqual(['Future.json', 'Hymn.json', 'broken.json']);
    await folder.write(plan('p1', 'Hymn'));
    expect(sub.files.get('Hymn.json')).toBe('{"version":1,"songs":[]}');
    expect(sub.files.has('Hymn (2).json')).toBe(true);
  });

  it('does not read song files that sit next to the plans folder', async () => {
    const dir = createFakeDir({ 'Amazing_Grace.json': JSON.stringify({ id: 's', title: 'Amazing Grace', slides: ['a'] }) });
    const { records, errors } = await (await createPlanFolder(dir)).list();
    expect(records).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('surfaces permission errors from writes', async () => {
    const dir = createFakeDir();
    const folder = await createPlanFolder(dir);
    dir.subdirs.get(PLANS_DIR).denied = true;
    await expect(folder.write(plan('p1', 'X'))).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});
