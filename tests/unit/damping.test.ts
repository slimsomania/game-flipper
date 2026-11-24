import { World } from 'planck';
import { describe, expect, it } from 'vitest';
import { Bottle } from '../../src/core/bottle';
import { GRAVITY, SIM_DT } from '../../src/core/constants';
import { TABLE_LEFT_X, TABLE_TOP_Y, createTable } from '../../src/core/table';
import { throwImpulse } from '../../src/core/throw';
import { resolveTuning, type Tuning } from '../../src/core/tuning';

/*
 * The bottle's damping (F009): how fast its spin and its travel die away. Damping is a property
 * of the body, so it works in the air and on the table without any rule moving the bottle.
 */

function bottleWith(overrides: Partial<Tuning>): { world: World; bottle: Bottle; tuning: Tuning } {
  const tuning = resolveTuning(overrides);
  const world = new World({ gravity: { x: 0, y: GRAVITY } });
  createTable(world);
  return { world, bottle: new Bottle(world, tuning, 0.5), tuning };
}

/** A bottle thrown at power 60; its first 30 steps are free flight (it rises from 1 m up). */
function thrown(overrides: Partial<Tuning>) {
  const { world, bottle, tuning } = bottleWith(overrides);
  bottle.launch(throwImpulse(60, tuning));
  const step = (steps: number): void => {
    for (let i = 0; i < steps; i++) world.step(SIM_DT);
  };
  return { bottle, step };
}

describe('bottle damping', () => {
  it('gives the body the damping from the tuning, also after applyTuning', () => {
    const { bottle, tuning } = bottleWith({ bottleAngularDamping: 1.5, bottleLinearDamping: 0.25 });
    expect(bottle.body.getAngularDamping()).toBe(1.5);
    expect(bottle.body.getLinearDamping()).toBe(0.25);
    bottle.applyTuning({ ...tuning, bottleAngularDamping: 4, bottleLinearDamping: 0.5 });
    expect(bottle.body.getAngularDamping()).toBe(4);
    expect(bottle.body.getLinearDamping()).toBe(0.5);
  });

  it('slows the spin in flight by the damping, step by step', () => {
    const damping = 2.5;
    const free = thrown({ bottleAngularDamping: 0 });
    const damped = thrown({ bottleAngularDamping: damping });
    const start = damped.bottle.body.getAngularVelocity();
    expect(start).toBeGreaterThan(0);
    expect(free.bottle.body.getAngularVelocity()).toBeCloseTo(start, 12); // the same throw
    const steps = 30;
    free.step(steps);
    damped.step(steps);
    expect(free.bottle.body.getAngularVelocity()).toBeCloseTo(start, 9); // nothing slows it
    // Box2D damps with v / (1 + dt * damping) once per step.
    expect(damped.bottle.body.getAngularVelocity()).toBeCloseTo(
      start / Math.pow(1 + SIM_DT * damping, steps),
      9,
    );
  });

  it('slows the sideways travel in flight', () => {
    const damping = 0.4;
    const free = thrown({ bottleLinearDamping: 0 });
    const damped = thrown({ bottleLinearDamping: damping });
    const vx = damped.bottle.body.getLinearVelocity().x;
    expect(vx).toBeGreaterThan(0);
    const steps = 30;
    free.step(steps);
    damped.step(steps);
    expect(free.bottle.body.getLinearVelocity().x).toBeCloseTo(vx, 9);
    expect(damped.bottle.body.getLinearVelocity().x).toBeCloseTo(
      vx / Math.pow(1 + SIM_DT * damping, steps),
      9,
    );
  });

  it('does not move a bottle that is held in the hand', () => {
    const { world, bottle } = bottleWith({ bottleAngularDamping: 5, bottleLinearDamping: 5 });
    const before = { ...bottle.body.getPosition() };
    for (let i = 0; i < 30; i++) world.step(SIM_DT);
    expect(bottle.body.getPosition()).toEqual(before);
    expect(bottle.body.getAngle()).toBe(0);
  });
});

describe('bottle damping with sloshing water', () => {
  /** Spin decay rate (1/s) over 20 free-flight steps after a power 35 throw. */
  function decay(level: number, sloshing: number): number {
    const tuning = resolveTuning({ sloshing });
    const world = new World({ gravity: { x: 0, y: GRAVITY } });
    createTable(world);
    const bottle = new Bottle(world, tuning, level);
    bottle.launch(throwImpulse(35, tuning));
    const start = bottle.body.getAngularVelocity();
    for (let i = 0; i < 20; i++) {
      bottle.beforeStep();
      world.step(SIM_DT);
    }
    return -Math.log(bottle.body.getAngularVelocity() / start) / (20 * SIM_DT);
  }

  it('decays the spin in flight exactly like solid water, at every water level', () => {
    // History: before the water was damped with the shell, the rate fell from 4.3/s (10% water) to
    // 2.3/s (90%). After that fix it was 4.9 to 5.4/s against solid water's 4.8/s; the rest was not
    // the water's slide (the water never left the base) but spin leaking out of the joint between
    // the two bodies. Since F025 the water is pinned to the base in the air, so the bottle flies as
    // one body and decays exactly like solid water.
    for (const level of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(decay(level, 1), `${level * 100}% water`).toBeCloseTo(decay(level, 0), 9);
    }
  });

  it('once the water is released near the table, damps shell and water as one body', () => {
    // A slow spin, placed with its base 2 cm above the tabletop and moving up, so the water is
    // released at once and the bottle is then in free flight for the steps measured.
    const damping = 2.5;
    const tuning = resolveTuning({ sloshing: 1, bottleAngularDamping: damping });
    const world = new World({ gravity: { x: 0, y: GRAVITY } });
    createTable(world);
    const bottle = new Bottle(world, tuning, 0.5);
    bottle.place({ x: TABLE_LEFT_X + 2, y: TABLE_TOP_Y - 0.02, angle: 0, vy: -3, omega: 2 });
    bottle.beforeStep();
    expect(bottle.isWaterPinned).toBe(false);
    world.step(SIM_DT);
    const start = bottle.body.getAngularVelocity();
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      bottle.beforeStep();
      world.step(SIM_DT);
    }
    expect(bottle.body.getAngularVelocity() / start).toBeCloseTo(
      Math.pow(1 + SIM_DT * damping, -steps),
      2,
    );
  });
});
