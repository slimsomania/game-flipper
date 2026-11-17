import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { waterSequence } from '../shared';
import { runToOutcome } from './helpers';

/** Throw the held bottle, let it be judged and bring the next bottle: returns that bottle's water. */
function nextWater(sim: Simulation): number {
  expect(sim.throwBottle(50)).toBe(true);
  runToOutcome(sim);
  expect(sim.skip()).toBe(true);
  return sim.snapshot().bottle.water;
}

describe('Simulation.lockWater', () => {
  it('starts unlocked, with the seed’s random levels', () => {
    const sim = new Simulation({ seed: 5 });
    expect(sim.lockedWater).toBeNull();
    expect(sim.snapshot().bottle.water).toBe(waterSequence(5, 1)[0]);
  });

  it('gives the next bottles the locked level, however many are thrown', () => {
    const sim = new Simulation({ seed: 5 });
    sim.lockWater(0.5);
    expect(sim.lockedWater).toBe(0.5);
    expect([nextWater(sim), nextWater(sim), nextWater(sim)]).toEqual([0.5, 0.5, 0.5]);
  });

  it('puts the level on the held bottle at once, with its mass', () => {
    const sim = new Simulation({ seed: 5 });
    sim.lockWater(0.9);
    expect(sim.snapshot().bottle.water).toBe(0.9);
    // The water is real mass: a fuller bottle launches slower than a nearly empty one.
    const full = new Simulation({ seed: 5 });
    full.lockWater(0.9);
    const light = new Simulation({ seed: 5 });
    light.lockWater(0.1);
    full.throwBottle(60);
    light.throwBottle(60);
    full.step();
    light.step();
    expect(full.snapshot().bottle.vy).toBeGreaterThan(light.snapshot().bottle.vy); // vy is negative: up
  });

  it('can be set from the start with the `lockedWater` option', () => {
    const sim = new Simulation({ seed: 5, lockedWater: 0.3 });
    expect(sim.lockedWater).toBe(0.3);
    expect(sim.snapshot().bottle.water).toBe(0.3);
    expect(nextWater(sim)).toBe(0.3);
  });

  it('goes back to random levels with null, and the seed’s sequence is not disturbed', () => {
    const sim = new Simulation({ seed: 9, lockedWater: 0.5 });
    expect(nextWater(sim)).toBe(0.5);
    expect(nextWater(sim)).toBe(0.5);
    sim.lockWater(null);
    expect(sim.lockedWater).toBeNull();
    // The held bottle keeps its level; the bottles after it follow the seed as if no lock had been
    // set (the sequence is the held bottle's draw first, then one per bottle: here the 4th, 5th, ...).
    const sequence = waterSequence(9, 6);
    expect(nextWater(sim)).toBe(sequence[3]);
    expect(nextWater(sim)).toBe(sequence[4]);
  });

  it('keeps the same draws with and without a lock, so a lock never changes later throws’ order', () => {
    const locked = new Simulation({ seed: 3, lockedWater: 0.5 });
    const free = new Simulation({ seed: 3 });
    for (let i = 0; i < 3; i++) {
      nextWater(locked);
      nextWater(free);
    }
    locked.lockWater(null);
    expect(nextWater(locked)).toBe(nextWater(free));
  });

  it('clamps the level to 0..1 and ignores a number that is not finite', () => {
    const sim = new Simulation({ seed: 5 });
    sim.lockWater(1.7);
    expect(sim.lockedWater).toBe(1);
    sim.lockWater(-0.2);
    expect(sim.lockedWater).toBe(0);
    sim.lockWater(0.4);
    sim.lockWater(Number.NaN);
    sim.lockWater(Number.POSITIVE_INFINITY);
    expect(sim.lockedWater).toBe(0.4);
    expect(new Simulation({ seed: 5, lockedWater: Number.NaN }).lockedWater).toBeNull();
  });

  it('never changes a bottle in flight (as setWater and setTuning)', () => {
    const sim = new Simulation({ seed: 5, lockedWater: 0.3 });
    sim.throwBottle(50);
    sim.lockWater(0.8);
    expect(sim.snapshot().bottle.water).toBe(0.3);
    expect(sim.snapshot().lastThrow?.water).toBe(0.3);
    runToOutcome(sim);
    sim.skip();
    expect(sim.snapshot().bottle.water).toBe(0.8); // from the next bottle on
  });

  it('is only about the water: the tuning is untouched', () => {
    const sim = new Simulation({ seed: 5 });
    const before = { ...sim.tuning };
    sim.lockWater(0.5);
    expect(sim.tuning).toEqual(before);
  });
});
