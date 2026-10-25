import { describe, it, expect, vi } from 'vitest';
import { createDiagnostics } from '../../../src/dock/shared/diagnostics.js';

describe('diagnostics', () => {
  it('records the message of Errors and strings, newest last', () => {
    const d = createDiagnostics();
    d.log('transport', new Error('boom'));
    d.log('library', 'plain text');
    expect(d.entries().map((e) => [e.context, e.message])).toEqual([['transport', 'boom'], ['library', 'plain text']]);
    expect(typeof d.entries()[0].at).toBe('string');
  });

  it('caps the number of entries', () => {
    const d = createDiagnostics({ max: 3 });
    for (let i = 0; i < 5; i += 1) d.log('x', `e${i}`);
    expect(d.entries().map((e) => e.message)).toEqual(['e2', 'e3', 'e4']);
  });

  it('notifies subscribers and supports clear and unsubscribe', () => {
    const d = createDiagnostics();
    const fn = vi.fn();
    const off = d.subscribe(fn);
    d.log('x', 'a');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    d.log('x', 'b');
    expect(fn).toHaveBeenCalledTimes(1);
    d.clear();
    expect(d.entries()).toEqual([]);
  });
});
