import { describe, it, expect } from 'vitest';
import {
  createPlan, songItem, readingItem, addItem, moveItem, moveItemTo, removeItem,
  renamePlan, uniqueName, isPlanRecord, toPlanRecord, DEFAULT_PLAN_NAME, PLAN_VERSION,
} from '../../src/plan/model.js';

const counter = () => { let n = 0; return () => 'u' + (n += 1); };
const planOf = (...ids) => ({ v: 1, id: 'p', name: 'P', items: ids.map((id) => ({ id, type: 'song', songId: 's' + id })) });
const order = (plan) => plan.items.map((i) => i.id);

describe('plan model', () => {
  it('creates an empty versioned plan with a trimmed name or the default', () => {
    expect(createPlan('  Sunday  ', counter())).toEqual({ v: PLAN_VERSION, id: 'p_u1', name: 'Sunday', items: [] });
    expect(createPlan('   ', counter()).name).toBe(DEFAULT_PLAN_NAME);
    expect(createPlan(undefined, counter()).name).toBe(DEFAULT_PLAN_NAME);
  });

  it('builds song and reading items with prefixed ids', () => {
    const uid = counter();
    expect(songItem('abc', uid)).toEqual({ id: 'i_u1', type: 'song', songId: 'abc' });
    expect(readingItem('John 3:16', 'KJV', uid)).toEqual({ id: 'i_u2', type: 'reading', ref: 'John 3:16', translation: 'KJV' });
  });

  it('adds after the anchor, or at the end without a usable anchor, and never mutates', () => {
    const plan = Object.freeze(planOf('a', 'b', 'c'));
    const item = { id: 'n', type: 'song', songId: 'sn' };
    expect(order(addItem(plan, item, 'a'))).toEqual(['a', 'n', 'b', 'c']);
    expect(order(addItem(plan, item, 'c'))).toEqual(['a', 'b', 'c', 'n']);
    expect(order(addItem(plan, item, null))).toEqual(['a', 'b', 'c', 'n']);
    expect(order(addItem(plan, item, 'gone'))).toEqual(['a', 'b', 'c', 'n']);
    expect(order(plan)).toEqual(['a', 'b', 'c']);
  });

  it('moves an item by an offset, clamping, and returns the same plan when nothing changes', () => {
    const plan = planOf('a', 'b', 'c');
    expect(order(moveItem(plan, 'a', 1))).toEqual(['b', 'a', 'c']);
    expect(order(moveItem(plan, 'c', -1))).toEqual(['a', 'c', 'b']);
    expect(moveItem(plan, 'a', -1)).toBe(plan);
    expect(moveItem(plan, 'c', 1)).toBe(plan);
    expect(moveItem(plan, 'zzz', 1)).toBe(plan);
  });

  it('moves an item to an index for drag and drop', () => {
    const plan = planOf('a', 'b', 'c');
    expect(order(moveItemTo(plan, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(order(moveItemTo(plan, 'c', 0))).toEqual(['c', 'a', 'b']);
    expect(order(moveItemTo(plan, 'a', 99))).toEqual(['b', 'c', 'a']);
    expect(moveItemTo(plan, 'b', 1)).toBe(plan);
  });

  it('removes an item, or returns the same plan for an unknown id', () => {
    const plan = planOf('a', 'b', 'c');
    expect(order(removeItem(plan, 'b'))).toEqual(['a', 'c']);
    expect(removeItem(plan, 'zzz')).toBe(plan);
  });

  it('renames with trimming and falls back to the default name', () => {
    const plan = planOf('a');
    expect(renamePlan(plan, '  Easter ').name).toBe('Easter');
    expect(renamePlan(plan, '').name).toBe(DEFAULT_PLAN_NAME);
    expect(plan.name).toBe('P');
  });

  it('makes names unique case-insensitively, ignoring the plan being renamed', () => {
    const plans = [{ id: '1', name: 'Sunday' }, { id: '2', name: 'Sunday (2)' }];
    expect(uniqueName(plans, 'sunday')).toBe('sunday (3)');
    expect(uniqueName(plans, 'Sunday', '1')).toBe('Sunday');
    expect(uniqueName(plans, 'Evening')).toBe('Evening');
    expect(uniqueName(plans, '  ')).toBe(DEFAULT_PLAN_NAME);
  });

  it('validates plan records and keeps items of unknown types', () => {
    const good = { v: 1, id: 'p', name: 'P', items: [{ id: 'i', type: 'timer', seconds: 60 }] };
    expect(isPlanRecord(good)).toBe(true);
    expect(isPlanRecord({ ...good, v: undefined })).toBe(true);
    expect(isPlanRecord({ ...good, v: 2 })).toBe(false);
    expect(isPlanRecord({ ...good, items: undefined })).toBe(false);
    expect(isPlanRecord({ ...good, items: [{ type: 'song' }] })).toBe(false);
    expect(isPlanRecord({ ...good, name: 5 })).toBe(false);
    expect(isPlanRecord(null)).toBe(false);
    const copy = toPlanRecord({ ...good, v: undefined });
    expect(copy).toEqual(good);
    expect(copy.items[0]).not.toBe(good.items[0]);
  });
});