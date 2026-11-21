import type { Body } from 'planck';
import type { Outcome } from './outcome';
import type { ThrowSource } from './throw';

/*
 * What `Simulation.snapshot()` returns: plain JSON-safe data for the renderer and the tests. The
 * simulation re-exports these types, so importing them from './simulation' keeps working.
 */

/** JSON-safe view of a rigid body. */
export interface BodySnapshot {
  /** Position of the body's origin, in meters. For the bottle this is the center of its base. */
  x: number;
  y: number;
  /** Radians, clockwise positive. 0 means upright. */
  angle: number;
  vx: number;
  vy: number;
  /** Angular velocity in rad/s. */
  omega: number;
  /** False once the physics engine considers the body at rest. */
  awake: boolean;
}

export interface BottleSnapshot extends BodySnapshot {
  /** Water level: the filled fraction of the bottle body, 0 to 1. */
  water: number;
  /**
   * With the `sloshing` tuning switch on: how far the water has slid from the base toward the cap,
   * in meters (0 at rest, never more than the empty space above the water). Always 0 with solid water.
   */
  waterOffset: number;
}

/**
 * Where the current throw is: `aiming` while a bottle waits in the hand, `flying` once it has been
 * thrown (the landing is judged during this phase), and `result` from the step its `outcome` is
 * decided until the next bottle appears (after the result delay, or at once on `skip()`), which
 * returns the phase to `aiming`. After the last throw of a round the result wait leads to
 * `roundOver` instead: no bottle is in the hand and nothing more can be thrown, until
 * `restartRound()` starts the next round (back to `aiming`).
 */
export type Phase = 'aiming' | 'flying' | 'result' | 'roundOver';

/** The throw that launched the current bottle. */
export interface LastThrow {
  /** The power actually used, after clamping to 0..100. */
  power: number;
  /** The bottle's water level at the moment of the throw. */
  water: number;
  source: ThrowSource;
}

/** Everything the renderer and the tests need to know about the simulation. */
export interface SimSnapshot {
  tick: number;
  seed: number;
  phase: Phase;
  /**
   * The power bar, 0 to 100: what Space throws with. It keeps its value from bottle to bottle.
   * While the mouse holds the bottle (`dragging`) it shows the live push instead.
   */
  power: number;
  /** True from a press on the held bottle until the button comes up (or the grab is dropped). */
  dragging: boolean;
  bottle: BottleSnapshot;
  /** Null until the first throw. A bottle placed with `placeBottle` doesn't set it. */
  lastThrow: LastThrow | null;
  /**
   * How the current throw ended: null until it is decided, then fixed for that throw and kept
   * through the `result` phase. The next bottle starts with null again. `points` is what the throw
   * scored.
   */
  outcome: Outcome | null;
  /**
   * Steps since the outcome was decided: 0 in the step that decides it, then counting up for as
   * long as the `result` phase lasts. Null in every other phase. The result flash fades by it.
   */
  resultSteps: number | null;
  /**
   * Points so far this round: each upright landing adds its number of turns (`outcome.points`: 1
   * for a single flip, 2 for a double, ...). A fail, "no flip" included, adds nothing. Back to 0
   * on `restartRound()`.
   */
  score: number;
  /**
   * Throws made so far by this simulation, counted when the bottle is released: by `throwBottle`
   * or `placeBottle`, so a throw still in the air is already counted (and not yet in `score`).
   * It never goes back, not even on `restartRound()`: it counts bottles thrown, where
   * `throwNumber` says how far into the round the player is.
   */
  throws: number;
  /**
   * The number of the throw the player is on, 1 to `throwsPerRound`: the bottle in the hand (the
   * next throw) while `aiming`, the throw in the air or being judged during `flying` and `result`,
   * and the last throw once the round is over.
   */
  throwNumber: number;
  /** How many throws a round has (the tuning's `throwsPerRound`, a whole number of at least 1). */
  throwsPerRound: number;
  /** Upright landings (successes) so far this round. Back to 0 on `restartRound()`. */
  landings: number;
  /**
   * Consecutive landings up to now: a landing adds one, a fail sets it back to 0. It has no effect
   * on the score. Back to 0 on `restartRound()`.
   */
  streak: number;
}

/** The pose, speeds and sleep state of a planck body as plain numbers. */
export function snapshotBody(body: Body): BodySnapshot {
  const p = body.getPosition();
  const v = body.getLinearVelocity();
  return {
    x: p.x,
    y: p.y,
    angle: body.getAngle(),
    vx: v.x,
    vy: v.y,
    omega: body.getAngularVelocity(),
    awake: body.isAwake(),
  };
}
