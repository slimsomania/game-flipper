import { Box, Edge, World, type Body } from 'planck';
import { GRAVITY, SIM_DT, WORLD_WIDTH_M } from './constants';
import { createRng } from './rng';

/*
 * PLACEHOLDER SIMULATION
 * A table and one bottle that drops onto it with a random tilt. It proves the pipeline
 * (physics -> rendering -> tests) and shows the patterns to follow. Agents replace it with the
 * real game as features land.
 */

/** Top surface of the table, in meters from the top of the screen. */
export const TABLE_Y = 11;
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

    const table = this.world.createBody({ type: 'static' });
    table.createFixture({
      shape: new Edge({ x: -WORLD_WIDTH_M, y: TABLE_Y }, { x: 2 * WORLD_WIDTH_M, y: TABLE_Y }),
      friction: 0.8,
    });

    this.bottle = this.world.createBody({
      type: 'dynamic',
      position: { x: WORLD_WIDTH_M / 2, y: 5 },
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
