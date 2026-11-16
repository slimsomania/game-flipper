import { World, type Body } from 'planck';
import { Bottle, drawWaterLevel } from './bottle';
import { GRAVITY, SIM_DT } from './constants';
import { createRng, type Rng } from './rng';
import { createTable } from './table';
import { resolveTuning, type Tuning } from './tuning';

const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

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
}

/** Everything the renderer and the tests need to know about the simulation. */
export interface SimSnapshot {
  tick: number;
  seed: number;
  bottle: BottleSnapshot;
}

export interface SimulationOptions {
  /** Same seed + same inputs = same result. */
  seed?: number;
  /** Overrides for the defaults in `DEFAULT_TUNING`. */
  tuning?: Partial<Tuning>;
}

export class Simulation {
  readonly seed: number;
  readonly tuning: Tuning;
  private readonly world: World;
  private readonly rng: Rng;
  private readonly bottle: Bottle;
  private ticks = 0;

  constructor(options: SimulationOptions = {}) {
    this.seed = options.seed ?? 1;
    this.tuning = resolveTuning(options.tuning);
    this.rng = createRng(this.seed);
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    createTable(this.world);
    this.bottle = new Bottle(this.world, this.tuning, drawWaterLevel(this.rng, this.tuning));
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

  /** Set the held bottle's water level (clamped to 0..1). For tests and tuning tools. */
  setWater(level: number): void {
    this.bottle.setWater(level);
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.ticks,
      seed: this.seed,
      bottle: { ...snapshotBody(this.bottle.body), water: this.bottle.water },
    };
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
