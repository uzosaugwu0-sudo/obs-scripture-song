import { createRecordFolder } from '../core/record-folder.js';
import { isPlanRecord, toPlanRecord } from './model.js';

export const PLANS_DIR = 'plans';

/** Plans live in a plans/ folder inside the library folder, so song files stay where they are. */
export async function createPlanFolder(dirHandle) {
  const dir = await dirHandle.getDirectoryHandle(PLANS_DIR, { create: true });
  return createRecordFolder(dir, { isRecord: isPlanRecord, toRecord: toPlanRecord, nameOf: (p) => p.name, label: 'plan' });
}
