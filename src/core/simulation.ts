import { Box, World, type Body } from 'planck';
import { GRAVITY, SIM_DT } from './constants';
import { createRng } from './rng';
import { TABLE_CENTER_X, createTable } from './table';

/*
 * PLACEHOLDER SIMULATION
 * A table and one bottle that drops onto it with a random tilt. It proves the pipeline
 * (physics -> rendering -> tests) and shows the patterns to follow. Agents replace it with the
 * real game as features land.
 */

/** Placeholder bottle size as half extents, in meters. */
export const BOTTLE_HALF_WIDTH = 0.35;
export const BOTTLE_HALF_HEIGHT = 1;

const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

/** JSON-safe view of a rigid body. */
export interface BodySnapshot {
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

/** Everything the renderer and the tests need to know about the simulation. */
export interface SimSnapshot {
  tick: number;
  seed: number;
  bottle: BodySnapshot;
}

export interface SimulationOptions {
  /** Same seed + same inputs = same result. */
  seed?: number;
}

export class Simulation {
  readonly seed: number;
  private readonly world: World;
  private readonly bottle: Body;
  private ticks = 0;

  constructor(options: SimulationOptions = {}) {
    this.seed = options.seed ?? 1;
    const rng = createRng(this.seed);
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    createTable(this.world);

    this.bottle = this.world.createBody({
      type: 'dynamic',
      position: { x: TABLE_CENTER_X, y: 2 },
      angle: rng.range(-0.5, 0.5),
      angularVelocity: rng.range(-2, 2),
      bullet: true,
    });
    this.bottle.createFixture({
      shape: new Box(BOTTLE_HALF_WIDTH, BOTTLE_HALF_HEIGHT),
      density: 1,
      friction: 0.6,
      restitution: 0.15,
    });
  }

  /** Number of fixed steps simulated so far. */
  get tick(): number {
    return this.ticks;
  }

  /** Advance the simulation by exactly one fixed step of SIM_DT seconds. */
  step(): void {
    this.world.step(SIM_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.ticks++;
  }

  snapshot(): SimSnapshot {
    return { tick: this.ticks, seed: this.seed, bottle: snapshotBody(this.bottle) };
  }
}

function snapshotBody(body: Body): BodySnapshot {
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
