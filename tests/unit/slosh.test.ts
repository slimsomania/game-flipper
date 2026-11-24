import { World } from 'planck';
import { describe, expect, it } from 'vitest';
import { Bottle } from '../../src/core/bottle';
import { bottleMassProperties } from '../../src/core/bottleShape';
import { GRAVITY, SIM_DT } from '../../src/core/constants';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { SLOSH_RELEASE_MARGIN, shouldReleaseWater, sloshLimit } from '../../src/core/slosh';
import { Simulation } from '../../src/core/simulation';
import { TABLE_LEFT_X, TABLE_TOP_Y, createTable } from '../../src/core/table';
import { throwImpulse } from '../../src/core/throw';
import { DEFAULT_TUNING, resolveTuning } from '../../src/core/tuning';

/*
 * Sloshing water (F023): the water as a separate body on a prismatic joint, behind the `sloshing`
 * tuning switch (0 = solid water, the default). Since F025 the water is pinned to the base through
 * the free flight and becomes the sliding body only as the bottle comes down to the table.
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
  it('is on by default since F025, and a normal throw then shows the water offset moving', () => {
    expect(DEFAULT_TUNING.sloshing).toBe(1);
    const { offsets } = fly(0.3, 60, {}, 60);
    expect(Math.max(...offsets)).toBeGreaterThan(0.03);
  });

  it('with the switch on, snapshots match the default exactly', () => {
    const a = fly(0.5, 70, {}, 30).sim.snapshot();
    const b = fly(0.5, 70, SLOSH, 30).sim.snapshot();
    expect(b).toEqual(a);
  });

  it('with the switch off, the snapshot reports no water offset', () => {
    const { offsets } = fly(0.3, 60, { sloshing: 0 }, 60);
    expect(offsets.every((o) => o === 0)).toBe(true);
  });
});

describe('sloshing water', () => {
  it('slides toward the cap during a spinning throw', () => {
    const { offsets } = fly(0.1, 50, SLOSH);
    expect(Math.max(...offsets)).toBeGreaterThan(0.05);
  });

  it('returns to the base within 1 s once the bottle stands at rest', () => {
    // A throw at the center of the 30% bottle's single-flip window lands upright (slosh on), and
    // the result stays up for 60 steps.
    const single = widestWindow(findWindows(sweepPowers(0.3, SLOSH)), 1);
    expect(single).not.toBeNull();
    const { sim, offsets } = fly(0.3, Math.round(single!.center), SLOSH, 55);
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
    const solid = fly(0.5, 60, { sloshing: 0 }).sim;
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
        const solid = fly(level, power, { sloshing: 0 }).sim.snapshot().outcome;
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

describe('sloshing water is pinned to the base in the air (F025)', () => {
  /** A bottle thrown at `power` from the hand, in a world with the table; `step` runs one sim step. */
  function thrown(level: number, power: number, overrides: object) {
    const tuning = resolveTuning(overrides);
    const world = new World({ gravity: { x: 0, y: GRAVITY } });
    const table = createTable(world);
    const bottle = new Bottle(world, tuning, level);
    bottle.launch(throwImpulse(power, tuning));
    const step = (): void => {
      bottle.beforeStep();
      world.step(SIM_DT);
    };
    return { bottle, table, step };
  }

  const pose = (bottle: Bottle) => {
    const p = bottle.body.getPosition();
    const v = bottle.body.getLinearVelocity();
    return {
      x: p.x,
      y: p.y,
      angle: bottle.body.getAngle(),
      vx: v.x,
      vy: v.y,
      omega: bottle.body.getAngularVelocity(),
    };
  };

  it('flies exactly like solid water until it nears the table, then is released', () => {
    for (const level of [0.1, 0.5, 0.9]) {
      for (const power of [20, 50, 80, 100]) {
        const solid = thrown(level, power, { sloshing: 0 });
        const wet = thrown(level, power, SLOSH);
        let steps = 0;
        while (wet.bottle.isWaterPinned && steps < 400) {
          expect(pose(wet.bottle), `${level} water, power ${power}`).toEqual(pose(solid.bottle));
          expect(wet.bottle.waterOffset).toBe(0);
          solid.step();
          wet.step();
          steps++;
        }
        expect(wet.bottle.isWaterPinned, `${level} water, power ${power}`).toBe(false);
        expect(steps).toBeGreaterThan(20); // a real flight, not a release at the hand
      }
    }
  });

  it('keeps the spin in free flight: no damping means no loss', () => {
    // Two bodies on a joint lost about 40% of the angular momentum in five steps at power 80.
    // Power 60 keeps every level under planck's cap of a quarter turn per step (94 rad/s), which
    // would clamp the spin of solid water just the same.
    for (const level of [0.1, 0.5, 0.9]) {
      const { bottle, step } = thrown(level, 60, {
        ...SLOSH,
        bottleAngularDamping: 0,
        bottleLinearDamping: 0,
      });
      const start = bottle.body.getAngularVelocity();
      for (let i = 0; i < 40; i++) step();
      expect(bottle.isWaterPinned).toBe(true);
      expect(bottle.body.getAngularVelocity()).toBeCloseTo(start, 9);
    }
  });

  it('is released before the bottle first touches the table, at every level and power', () => {
    for (let tenth = 1; tenth <= 9; tenth++) {
      for (let power = 0; power <= 100; power += 10) {
        const { bottle, table, step } = thrown(tenth / 10, power, SLOSH);
        let steps = 0;
        while (!bottle.touches(table) && steps < 400) {
          step();
          steps++;
        }
        if (!bottle.touches(table)) continue; // off the end of the table: nothing to check
        expect(bottle.isWaterPinned, `${tenth * 10}% water, power ${power}`).toBe(false);
      }
    }
  }, 60_000);

  it('releases the water without changing the bottle’s motion', () => {
    // No damping, so the one beforeStep() that releases the water changes nothing else.
    const tuning = resolveTuning({ ...SLOSH, bottleAngularDamping: 0, bottleLinearDamping: 0 });
    const world = new World({ gravity: { x: 0, y: GRAVITY } });
    createTable(world);
    const bottle = new Bottle(world, tuning, 0.4);
    const mass = (() => {
      bottle.release();
      return bottle.totalMass;
    })();
    bottle.place({
      x: TABLE_LEFT_X + 2,
      y: TABLE_TOP_Y - 0.02,
      angle: 0.3,
      vx: 1,
      vy: 2,
      omega: -4,
    });
    const center = bottle.body.getWorldCenter().clone();
    const before = pose(bottle);
    bottle.beforeStep();
    expect(bottle.isWaterPinned).toBe(false);
    expect(bottle.totalMass).toBeCloseTo(mass, 9);
    // The shell's own center moved (the water is a body of its own now), but it turns with the same
    // spin, and its velocity is the rigid motion of the old center: v + omega x (c - center).
    const c = bottle.body.getWorldCenter();
    const v = bottle.body.getLinearVelocity();
    expect(bottle.body.getAngularVelocity()).toBeCloseTo(before.omega, 9);
    expect(v.x).toBeCloseTo(before.vx - before.omega * (c.y - center.y), 9);
    expect(v.y).toBeCloseTo(before.vy + before.omega * (c.x - center.x), 9);
    expect(bottle.waterOffset).toBe(0);
  });
});

describe('shouldReleaseWater', () => {
  it('waits while the bottle is high up, and releases within the margin of the tabletop', () => {
    expect(shouldReleaseWater(TABLE_TOP_Y - 1, 0)).toBe(false);
    expect(shouldReleaseWater(TABLE_TOP_Y - SLOSH_RELEASE_MARGIN - 0.001, 0)).toBe(false);
    expect(shouldReleaseWater(TABLE_TOP_Y - SLOSH_RELEASE_MARGIN, 0)).toBe(true);
    expect(shouldReleaseWater(TABLE_TOP_Y + 0.5, 0)).toBe(true); // below the top: off the table
  });

  it('looks two steps ahead when falling, and not when rising', () => {
    const y = TABLE_TOP_Y - SLOSH_RELEASE_MARGIN - 0.1;
    expect(shouldReleaseWater(y, 3)).toBe(true); // 3 m/s down covers 0.1 m in two steps
    expect(shouldReleaseWater(y, 2)).toBe(false);
    expect(shouldReleaseWater(y, -3)).toBe(false);
  });
});
