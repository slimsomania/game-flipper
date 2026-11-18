import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { WaterSupply } from '../../src/core/waterSupply';
import { waterSequence } from '../shared';

const supply = (seed: number, lockedWater?: number | null) =>
  new WaterSupply(createRng(seed), () => DEFAULT_TUNING, lockedWater);

describe('WaterSupply', () => {
  it('hands out the seed’s draws in order while nothing is locked', () => {
    const water = supply(4);
    expect(water.locked).toBeNull();
    expect([water.next(), water.next(), water.next()]).toEqual(waterSequence(4, 3));
  });

  it('gives the locked level instead, and still makes every draw', () => {
    const water = supply(4);
    water.lock(0.25);
    expect([water.next(), water.next()]).toEqual([0.25, 0.25]);
    water.lock(null);
    // Two draws were spent while locked: the third value of the seed's sequence is next.
    expect(water.next()).toBe(waterSequence(4, 3)[2]);
  });

  it('returns the level a call locked, clamped to 0..1', () => {
    const water = supply(4);
    expect(water.lock(0.6)).toBe(0.6);
    expect(water.lock(1.7)).toBe(1);
    expect(water.lock(-3)).toBe(0);
    expect(water.locked).toBe(0);
  });

  it('returns null, and keeps the lock, for a number that is not finite', () => {
    const water = supply(4);
    water.lock(0.4);
    expect(water.lock(Number.NaN)).toBeNull();
    expect(water.lock(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(water.locked).toBe(0.4);
  });

  it('returns null and unlocks for null', () => {
    const water = supply(4, 0.4);
    expect(water.lock(null)).toBeNull();
    expect(water.locked).toBeNull();
  });

  it('can start locked, and ignores a starting level that is not finite', () => {
    expect(supply(4, 0.9).locked).toBe(0.9);
    expect(supply(4, 2).locked).toBe(1);
    expect(supply(4, Number.NaN).locked).toBeNull();
  });

  it('reads the tuning on every draw', () => {
    let tuning = DEFAULT_TUNING;
    const water = new WaterSupply(createRng(4), () => tuning);
    const first = water.next();
    tuning = { ...DEFAULT_TUNING, waterMin: 0.9, waterMax: 0.9 };
    const second = water.next();
    expect(first).toBe(waterSequence(4, 1)[0]);
    expect(second).toBe(0.9);
  });
});
