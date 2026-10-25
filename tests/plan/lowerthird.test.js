import { describe, it, expect } from 'vitest';
import { isValidLowerThird, describeLowerThird, lowerThirdFromInputs, MAX_HIDE_AFTER, MAX_ITEM_LOGO_DATA } from '../../src/plan/extras.js';
import { lowerThirdItem, isPlanRecord, replaceItem } from '../../src/plan/model.js';
import { itemStatus, itemTitle, nextLoadable, planSummary } from '../../src/plan/cursor.js';

const library = { get: () => null };
const ok = { id: 'a', type: 'lowerthird', name: 'Pastor John', info: 'Guest speaker', align: 'left', logo: null, hideAfter: null };

describe('isValidLowerThird', () => {
  it('accepts name and info, either one alone, and the optional parts', () => {
    expect(isValidLowerThird(ok)).toBe(true);
    expect(isValidLowerThird({ ...ok, info: '' })).toBe(true);
    expect(isValidLowerThird({ ...ok, name: '' })).toBe(true);
    expect(isValidLowerThird({ ...ok, align: 'right', logo: 'john.png', hideAfter: 8 })).toBe(true);
    expect(isValidLowerThird({ ...ok, hideAfter: MAX_HIDE_AFTER })).toBe(true);
  });
  it('accepts a hand-written item that leaves out the optional parts', () => {
    expect(isValidLowerThird({ id: 'x', type: 'lowerthird', name: 'A' })).toBe(true);
  });
  it('rejects no text, bad placement, bad picture names and bad hide times', () => {
    expect(isValidLowerThird({ ...ok, name: '  ', info: '' })).toBe(false);
    expect(isValidLowerThird({ ...ok, name: 5 })).toBe(false);
    expect(isValidLowerThird({ ...ok, info: true })).toBe(false);
    expect(isValidLowerThird({ ...ok, align: 'diagonal' })).toBe(false);
    for (const logo of ['a/b.png', '../a.png', 'a.jpg', '']) expect(isValidLowerThird({ ...ok, logo })).toBe(false);
    for (const hideAfter of [0, -1, 1.5, MAX_HIDE_AFTER + 1, '8']) expect(isValidLowerThird({ ...ok, hideAfter })).toBe(false);
    expect(isValidLowerThird(null)).toBe(false);
  });
});

const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('a picture kept inside the lower third', () => {
  it('is valid when it is a small image data URL, and invalid otherwise', () => {
    expect(isValidLowerThird({ ...ok, logoData: DATA })).toBe(true);
    for (const logoData of ['http://example.com/a.png', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 5, '']) {
      expect(isValidLowerThird({ ...ok, logoData }), String(logoData)).toBe(false);
    }
    expect(isValidLowerThird({ ...ok, logoData: 'data:image/png;base64,' + 'A'.repeat(MAX_ITEM_LOGO_DATA) })).toBe(false);
    expect(isValidLowerThird({ ...ok, logoData: null })).toBe(true);
  });

  it('comes through the editor draft and the item, and replaces any folder picture name', () => {
    const base = { name: 'Pastor John', info: '', align: 'left', logo: 'old.png', hideAfter: '', logoData: DATA };
    const result = lowerThirdFromInputs(base);
    expect(result.ok).toBe(true);
    expect(result.draft).toMatchObject({ logo: null, logoData: DATA });
    expect(lowerThirdItem(result.draft, () => 'u1')).toMatchObject({ logo: null, logoData: DATA });
    expect(lowerThirdFromInputs({ ...base, logoData: 'nope' })).toEqual({ ok: false, hint: 'That picture could not be used. Choose it again.' });
    expect(lowerThirdFromInputs({ ...base, logoData: '' }).draft).toMatchObject({ logo: 'old.png', logoData: null });
  });

  it('defaults to no embedded picture on a new item', () => {
    expect(lowerThirdItem({ name: 'A' }, () => 'u2').logoData).toBeNull();
  });
});

describe('describeLowerThird', () => {
  it('says how it goes away', () => {
    expect(describeLowerThird(ok)).toBe('stays');
    expect(describeLowerThird({ ...ok, hideAfter: 8 })).toBe('hides after 8s');
  });
});

describe('lowerThirdFromInputs', () => {
  const base = { name: ' Pastor John ', info: ' Guest speaker ', align: 'center', logo: '', hideAfter: '' };
  it('builds a draft, trimming text and turning blanks into null', () => {
    expect(lowerThirdFromInputs(base)).toEqual({ ok: true, draft: { type: 'lowerthird', name: 'Pastor John', info: 'Guest speaker', align: 'center', logo: null, logoData: null, hideAfter: null } });
    expect(lowerThirdFromInputs({ ...base, logo: 'john.png', hideAfter: ' 8 ' }).draft).toMatchObject({ logo: 'john.png', hideAfter: 8 });
  });
  it('needs some text', () => {
    expect(lowerThirdFromInputs({ ...base, name: '  ', info: '' })).toEqual({ ok: false, hint: 'Enter a name or some info.' });
  });
  it('explains a bad hide time', () => {
    for (const hideAfter of ['0', '3601', '1.5', '-2', 'soon']) {
      expect(lowerThirdFromInputs({ ...base, hideAfter })).toEqual({ ok: false, hint: 'Hide after must be 1 to 3600 seconds.' });
    }
  });
  it('falls back to left for an unknown placement', () => {
    expect(lowerThirdFromInputs({ ...base, align: 'up' }).draft.align).toBe('left');
  });
});

describe('lowerThirdItem', () => {
  it('builds an item with a prefixed id that a plan record accepts', () => {
    const item = lowerThirdItem({ name: ' A ', info: ' B ', align: 'right', logo: 'a.png', hideAfter: 5 }, () => 'u1');
    expect(item).toEqual({ id: 'i_u1', type: 'lowerthird', name: 'A', info: 'B', align: 'right', logo: 'a.png', logoData: null, hideAfter: 5 });
    expect(isPlanRecord({ v: 1, id: 'p', name: 'P', items: [item] })).toBe(true);
  });
  it('defaults placement, picture and hide time', () => {
    expect(lowerThirdItem({ name: 'A' }, () => 'u2')).toMatchObject({ align: 'left', logo: null, hideAfter: null, info: '' });
  });
  it('can be swapped in place with replaceItem', () => {
    const plan = { v: 1, id: 'p', name: 'P', items: [ok] };
    const next = replaceItem(plan, 'a', lowerThirdItem({ name: 'New' }, () => 'zz'));
    expect(next.items[0]).toMatchObject({ id: 'a', type: 'lowerthird', name: 'New' });
  });
});

describe('cursor', () => {
  it('loads valid lower thirds and treats invalid ones as unsupported', () => {
    expect(itemStatus(ok, library)).toBe('ok');
    expect(itemStatus({ ...ok, hideAfter: 0 }, library)).toBe('unsupported');
    expect(itemStatus({ ...ok, logo: 'a/b.png' }, library)).toBe('unsupported');
    expect(itemStatus({ ...ok, name: '', info: '' }, library)).toBe('unsupported');
  });
  it('titles by name, else info, else a plain word', () => {
    expect(itemTitle(ok, library)).toBe('Pastor John');
    expect(itemTitle({ ...ok, name: '' }, library)).toBe('Guest speaker');
    expect(itemTitle({ ...ok, hideAfter: 0 }, library)).toBe('Unsupported item');
  });
  it('Next item skips a bad one and the summary names the next good one', () => {
    const plan = { v: 1, id: 'p', name: 'P', items: [{ ...ok, id: 'bad', hideAfter: -3 }, ok] };
    expect(nextLoadable(plan, null, library).id).toBe('a');
    expect(planSummary(plan, null, library)).toBe('2 items · Next: Pastor John');
  });
});
