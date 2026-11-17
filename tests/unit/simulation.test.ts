import { describe, expect, it } from 'vitest';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { Simulation } from '../../src/core/simulation';
import { TABLE_TOP_Y } from '../../src/core/table';
import { run } from './helpers';

describe('Simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    run(a, 300);
    run(b, 300);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('starts differently for different seeds', () => {
    const levels = [1, 2, 3, 4, 5, 6].map(
      (seed) => new Simulation({ seed }).snapshot().bottle.water,
    );
    expect(new Set(levels).size).toBeGreaterThan(1);
  });

  it('counts fixed steps', () => {
    const sim = new Simulation({ seed: 7 });
    expect(sim.snapshot().tick).toBe(0);
    run(sim, 30);
    expect(sim.tick).toBe(30);
    expect(sim.snapshot().tick).toBe(30);
  });

  it('starts with the bottle held in the hand, above the table, with a water level', () => {
    const { bottle, seed } = new Simulation({ seed: 7 }).snapshot();
    expect(seed).toBe(7);
    expect([bottle.x, bottle.y, bottle.angle]).toEqual([HAND_X, HAND_Y, 0]);
    expect(bottle.y).toBeLessThan(TABLE_TOP_Y);
    expect(bottle.water).toBeGreaterThanOrEqual(0.1);
    expect(bottle.water).toBeLessThanOrEqual(0.9);
  });

  it('setWater changes the water level in the snapshot', () => {
    const sim = new Simulation({ seed: 7 });
    sim.setWater(0.9);
    expect(sim.snapshot().bottle.water).toBe(0.9);
    sim.setWater(0.1);
    expect(sim.snapshot().bottle.water).toBe(0.1);
  });

  it('accepts tuning overrides', () => {
    const sim = new Simulation({ seed: 7, tuning: { waterMin: 0.5, waterMax: 0.5 } });
    expect(sim.tuning.waterMin).toBe(0.5);
    expect(sim.snapshot().bottle.water).toBe(0.5);
  });
});
