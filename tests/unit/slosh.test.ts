import { World } from 'planck';
import { describe, expect, it } from 'vitest';
import { Bottle } from '../../src/core/bottle';
import { bottleMassProperties } from '../../src/core/bottleShape';
import { sloshLimit } from '../../src/core/slosh';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING, resolveTuning } from '../../src/core/tuning';

/*
 * Sloshing water (F023): the water as a separate body on a prismatic joint, behind the `sloshing`
 * tuning switch (0 = solid water, the default).
 */

const SLOSH = { sloshing: 1 };

/** Throw at `power` and step until the throw is decided; returns the offsets seen on the way. */
function fly(level: number, power: number, tuning: object, extraSteps = 0) {
  const sim = new Simulation({ seed: 3, tuning });
  sim.setWater(level);
  sim.throwBottle(power);
  const offsets: number[] = [];
  let guard = 0;
  while (sim.phase === 'flying' && guard++ < 400) {
    sim.step();
    offsets.push(sim.snapshot().bottle.waterOffset);
  }
  for (let i = 0; i < extraSteps; i++) {
    sim.step();
    offsets.push(sim.snapshot().bottle.waterOffset);
  }
  return { sim, offsets };
}

describe('sloshing switch', () => {
  it('is off by default, and the snapshot then reports no water offset', () => {
    expect(DEFAULT_TUNING.sloshing).toBe(0);
    const { offsets } = fly(0.3, 60, {});
    expect(offsets.every((o) => o === 0)).toBe(true);
  });

  it('with the switch off, snapshots match the default exactly', () => {
    const a = fly(0.5, 70, {}, 30).sim.snapshot();
    const b = fly(0.5, 70, { sloshing: 0 }, 30).sim.snapshot();
    expect(b).toEqual(a);
  });
});

describe('sloshing water', () => {
  it('slides toward the cap during a spinning throw', () => {
    const { offsets } = fly(0.1, 50, SLOSH);
    expect(Math.max(...offsets)).toBeGreaterThan(0.05);
  });

  it('returns to the base within 1 s once the bottle stands at rest', () => {
    // 0.3 water at power 50 lands upright (slosh on), and the result stays up for 60 steps.
    const { sim, offsets } = fly(0.3, 50, SLOSH, 55);
    const snap = sim.snapshot();
    expect(snap.outcome?.result).toBe('success');
    expect(Math.max(...offsets)).toBeGreaterThanOrEqual(0);
    expect(snap.bottle.waterOffset).toBeLessThan(0.001);
  });

  it('keeps the total mass of the solid model at every level', () => {
    for (let level = 0; level <= 1.0001; level += 0.05) {
      const solid = new Bottle(new World(), resolveTuning({ sloshing: 0 }), level);
      const slosh = new Bottle(new World(), resolveTuning(SLOSH), level);
      solid.release();
      slosh.release();
      expect(slosh.totalMass).toBeCloseTo(solid.totalMass, 9);
      expect(slosh.totalMass).toBeCloseTo(bottleMassProperties(level, DEFAULT_TUNING).mass, 9);
    }
  });

  it('gives the same launch speed as the solid bottle (same mass, same center)', () => {
    const solid = fly(0.5, 60, {}).sim;
    const slosh = new Simulation({ seed: 3, tuning: SLOSH });
    slosh.setWater(0.5);
    slosh.throwBottle(60);
    const a = solid.snapshot().lastThrow;
    expect(slosh.snapshot().lastThrow).toEqual(a);
    expect(slosh.snapshot().bottle.vy).toBeLessThan(0); // flung upward
  });

  it('is deterministic for the same seed, tuning and power', () => {
    const a = fly(0.4, 55, SLOSH, 20);
    const b = fly(0.4, 55, SLOSH, 20);
    expect(JSON.stringify(b.sim.snapshot())).toBe(JSON.stringify(a.sim.snapshot()));
    expect(b.offsets).toEqual(a.offsets);
  });

  it('changes some outcomes compared with solid water, and the offset stays within its limits', () => {
    let different = 0;
    for (const level of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const limit = sloshLimit(level);
      for (let power = 0; power <= 100; power += 5) {
        const solid = fly(level, power, {}).sim.snapshot().outcome;
        const wet = fly(level, power, SLOSH);
        const outcome = wet.sim.snapshot().outcome;
        if (solid?.result !== outcome?.result || solid?.turns !== outcome?.turns) different++;
        for (const o of wet.offsets) {
          expect(o).toBeGreaterThanOrEqual(0);
          expect(o).toBeLessThanOrEqual(limit);
        }
      }
    }
    expect(different).toBeGreaterThan(0);
  }, 60_000); // 210 full throws: over the 5 s default on a loaded machine

  it('limits the travel to the empty space above the water', () => {
    expect(sloshLimit(0.1)).toBeGreaterThan(sloshLimit(0.5));
    expect(sloshLimit(0.5)).toBeGreaterThan(sloshLimit(0.9));
    expect(sloshLimit(1)).toBe(0);
    expect(sloshLimit(0.9)).toBeGreaterThan(0);
  });

  it('works with placeBottle and with a bottle without water', () => {
    const sim = new Simulation({ seed: 1, tuning: SLOSH });
    sim.setWater(0);
    expect(sim.placeBottle({ x: 1, y: 2, angle: 0, omega: 3 })).toBe(true);
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.snapshot().bottle.waterOffset).toBe(0);
    const wet = new Simulation({ seed: 1, tuning: SLOSH });
    wet.setWater(0.4);
    expect(wet.placeBottle({ x: 1, y: 2, angle: 0, omega: 3 })).toBe(true);
    for (let i = 0; i < 30; i++) wet.step();
    expect(Number.isFinite(wet.snapshot().bottle.y)).toBe(true);
  });
});
