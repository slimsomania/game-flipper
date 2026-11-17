/** Helpers shared by the unit tests that drive a `Simulation`. (Poses and seeds: `tests/shared.ts`.) */
import { expect } from 'vitest';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import type { Tuning } from '../../src/core/tuning';
import { FLIPPED } from '../shared';

/** The result wait: 1.5 s at 60 steps per second. */
export const RESULT_STEPS = 90;

/** Step `steps` times and return the snapshot. */
export function run(sim: Simulation, steps: number): SimSnapshot {
  for (let i = 0; i < steps; i++) sim.step();
  return sim.snapshot();
}

/** Step until the outcome is decided (the phase is then `result`); returns the steps taken. */
export function runToOutcome(sim: Simulation, limit = 600): number {
  let steps = 0;
  while (sim.snapshot().outcome === null && steps < limit) {
    sim.step();
    steps++;
  }
  return steps;
}

/**
 * A simulation whose bottle has just been judged: placed as `pose` (by default a single flip, a
 * success), stepped to its outcome.
 */
export function judged(
  pose: Parameters<Simulation['placeBottle']>[0] = FLIPPED,
  options: { seed?: number; tuning?: Partial<Tuning> } = {},
): Simulation {
  const sim = new Simulation({ seed: options.seed ?? 5, tuning: options.tuning });
  expect(sim.placeBottle(pose)).toBe(true);
  runToOutcome(sim);
  return sim;
}

/** Check that `snapshot` is a bottle standing still in the hand: upright, at rest, not moving. */
export function expectHeld(snapshot: SimSnapshot): void {
  const { bottle } = snapshot;
  expect([bottle.x, bottle.y, bottle.angle]).toEqual([HAND_X, HAND_Y, 0]);
  expect([bottle.vx, bottle.vy, bottle.omega]).toEqual([0, 0, 0]);
}
