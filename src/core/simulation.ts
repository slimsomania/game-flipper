import { World, type Body } from 'planck';
import { Bottle, drawWaterLevel } from './bottle';
import { GRAVITY, SIM_DT } from './constants';
import { createRng, type Rng } from './rng';
import { createTable } from './table';
import { clampPower, throwImpulse, type ThrowSource } from './throw';
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

/**
 * Where the current throw is: `aiming` while the bottle waits in the hand, `flying` once it has
 * been thrown. Landing judgement (F004) and the result screens add later phases.
 */
export type Phase = 'aiming' | 'flying';

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
  bottle: BottleSnapshot;
  /** Null until the first throw. */
  lastThrow: LastThrow | null;
}

export interface SimulationOptions {
  /** Same seed + same inputs = same result. */
  seed?: number;
  /** Overrides for the defaults in `DEFAULT_TUNING`. */
  tuning?: Partial<Tuning>;
}

export class Simulation {
  readonly seed: number;
  private currentTuning: Tuning;
  private readonly world: World;
  private readonly rng: Rng;
  private readonly bottle: Bottle;
  private currentPhase: Phase = 'aiming';
  private thrown: LastThrow | null = null;
  private ticks = 0;

  constructor(options: SimulationOptions = {}) {
    this.seed = options.seed ?? 1;
    this.currentTuning = resolveTuning(options.tuning);
    this.rng = createRng(this.seed);
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    createTable(this.world);
    this.bottle = new Bottle(
      this.world,
      this.currentTuning,
      drawWaterLevel(this.rng, this.currentTuning),
    );
  }

  /** The tuning in effect: the defaults, the constructor's overrides and any `setTuning` calls. */
  get tuning(): Tuning {
    return this.currentTuning;
  }

  get phase(): Phase {
    return this.currentPhase;
  }

  /** Number of fixed steps simulated so far. */
  get tick(): number {
    return this.ticks;
  }

  /**
   * Change tuning values. They apply to the held bottle (its mass and surface) and to every later
   * throw, but never to a bottle already in flight: a throw is a launch impulse computed from the
   * tuning at that moment, and a flying bottle keeps the body it was launched with.
   */
  setTuning(overrides: Partial<Tuning>): void {
    this.currentTuning = { ...this.currentTuning, ...overrides };
    if (this.currentPhase === 'aiming') this.bottle.applyTuning(this.currentTuning);
  }

  /**
   * Throw the held bottle with `power` (clamped to 0..100): it flies up and a little toward the
   * table, spinning clockwise. Does nothing, and returns false, unless the phase is `aiming` (or
   * the power isn't a number).
   */
  throwBottle(power: number, source: ThrowSource = 'keyboard'): boolean {
    if (this.currentPhase !== 'aiming' || Number.isNaN(power)) return false;
    const used = clampPower(power);
    this.bottle.launch(throwImpulse(used, this.currentTuning));
    this.thrown = { power: used, water: this.bottle.water, source };
    this.currentPhase = 'flying';
    return true;
  }

  /** Advance the simulation by exactly one fixed step of SIM_DT seconds. */
  step(): void {
    this.world.step(SIM_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.ticks++;
  }

  /**
   * Set the held bottle's water level (clamped to 0..1). For tests and tuning tools. Ignored
   * once the bottle is thrown, so a flying bottle never changes mass.
   */
  setWater(level: number): void {
    if (this.currentPhase === 'aiming') this.bottle.setWater(level);
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.ticks,
      seed: this.seed,
      phase: this.currentPhase,
      bottle: { ...snapshotBody(this.bottle.body), water: this.bottle.water },
      lastThrow: this.thrown && { ...this.thrown },
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
