import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('can continue a sequence from its saved state', () => {
    const a = createRng(9);
    a.next();
    const resumed = createRng(a.state);
    expect(resumed.next()).toEqual(a.next());
  });

  it('keeps values within the requested ranges', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      const n = rng.int(1, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});
