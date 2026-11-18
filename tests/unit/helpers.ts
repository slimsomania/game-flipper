/** Helpers shared by the unit tests that drive a `Simulation`. (Poses and seeds: `tests/shared.ts`.) */
import { expect } from 'vitest';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import type { Tuning } from '../../src/core/tuning';
import { FLIPPED, flipped, type PlacedPose } from '../shared';

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

/** A simulation with `pose` placed (and an optional water level and tuning), not yet stepped. */
export function placed(
  pose: Parameters<Simulation['placeBottle']>[0],
  options: { water?: number; tuning?: Partial<Tuning> } = {},
): Simulation {
  const sim = new Simulation({ seed: 1, tuning: options.tuning });
  if (options.water !== undefined) sim.setWater(options.water);
  expect(sim.placeBottle(pose)).toBe(true);
  return sim;
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

/** Place a bottle, let it be judged and sit out the result wait, as a player who throws on. */
export function play(sim: Simulation, pose: PlacedPose): void {
  expect(sim.placeBottle(pose)).toBe(true);
  runToOutcome(sim);
  run(sim, RESULT_STEPS);
}

/** Ten throws that all land (a double on the 5th, so 11 points), to bring a round to its end. */
export function playRound(sim: Simulation): void {
  for (let i = 0; i < 10; i++) play(sim, i === 4 ? flipped(2) : FLIPPED);
}

/** Check that `snapshot` is a bottle standing still in the hand: upright, at rest, not moving. */
export function expectHeld(snapshot: SimSnapshot): void {
  const { bottle } = snapshot;
  expect([bottle.x, bottle.y, bottle.angle]).toEqual([HAND_X, HAND_Y, 0]);
  expect([bottle.vx, bottle.vy, bottle.omega]).toEqual([0, 0, 0]);
}
