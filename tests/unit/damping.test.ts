import { World } from 'planck';
import { describe, expect, it } from 'vitest';
import { Bottle } from '../../src/core/bottle';
import { GRAVITY, SIM_DT } from '../../src/core/constants';
import { createTable } from '../../src/core/table';
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

  it('decays the spin at nearly the same rate at every water level, close to solid water', () => {
    // Before the water was damped with the shell, the rate fell from 4.3/s (10% water) to 2.3/s
    // (90%) while solid water decays at 4.8/s at every level. What is left (4.9 to 5.4/s) is the
    // water's own slide changing the bottle's inertia, which is real.
    const solid = decay(0.5, 0);
    const rates = [0.1, 0.3, 0.5, 0.7, 0.9].map((level) => decay(level, 1));
    for (const rate of rates) expect(Math.abs(rate - solid) / solid).toBeLessThan(0.15);
    expect((Math.max(...rates) - Math.min(...rates)) / solid).toBeLessThan(0.15);
  });
});
