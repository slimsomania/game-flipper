import { World, type Body } from 'planck';
import { Bottle, drawWaterLevel, type BottlePose } from './bottle';
import { GRAVITY, SIM_DT, stepsFor } from './constants';
import { LandingJudge, type LandingSample, type Outcome } from './outcome';
import { PowerMeter } from './powerMeter';
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
 * Where the current throw is: `aiming` while a bottle waits in the hand, `flying` once it has been
 * thrown (the landing is judged during this phase), and `result` from the step its `outcome` is
 * decided until the next bottle appears (after the result delay, or at once on `skip()`), which
 * returns the phase to `aiming`. Later features add the end-of-round phase.
 */
export type Phase = 'aiming' | 'flying' | 'result';

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
  /** The power bar, 0 to 100: what Space throws with. It keeps its value from bottle to bottle. */
  power: number;
  bottle: BottleSnapshot;
  /** Null until the first throw. A bottle placed with `placeBottle` doesn't set it. */
  lastThrow: LastThrow | null;
  /**
   * How the current throw ended: null until it is decided, then fixed for that throw and kept
   * through the `result` phase. The next bottle starts with null again.
   */
  outcome: Outcome | null;
  /** Successful throws so far. A fail adds nothing. */
  score: number;
  /**
   * Throws made so far, counted when the bottle is released: by `throwBottle` or `placeBottle`,
   * so a throw still in the air is already counted (and not yet in `score`).
   */
  throws: number;
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
  private readonly table: Body;
  /**
   * The power bar. The scene forwards key presses, releases and wheel notches to it, and any phase
   * may adjust it, so the player can set the next throw while a result is still showing.
   */
  readonly powerMeter: PowerMeter;
  private bottle: Bottle;
  private judge: LandingJudge | null = null;
  private result: Outcome | null = null;
  private currentPhase: Phase = 'aiming';
  private thrown: LastThrow | null = null;
  private points = 0;
  private throwCount = 0;
  /** Steps since the outcome was decided, counted during `result`. */
  private resultSteps = 0;
  private ticks = 0;

  constructor(options: SimulationOptions = {}) {
    this.seed = options.seed ?? 1;
    this.currentTuning = resolveTuning(options.tuning);
    this.powerMeter = new PowerMeter(() => this.currentTuning);
    this.rng = createRng(this.seed);
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    this.table = createTable(this.world);
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
    this.startFlight(this.bottle.body.getAngle());
    this.bottle.launch(throwImpulse(used, this.currentTuning));
    this.thrown = { power: used, water: this.bottle.water, source };
    return true;
  }

  /**
   * What Space does: while `aiming` it throws the held bottle with the power bar's value, during
   * `result` it ends the wait (`skip()`), and while `flying` it does nothing. Returns whether
   * anything happened. The scene must not call it for a key's auto-repeat.
   */
  throwOrSkip(): boolean {
    if (this.currentPhase === 'aiming') return this.throwBottle(this.powerMeter.value, 'keyboard');
    return this.skip();
  }

  /** Begin judging a throw from `angle` and count it. Call it just before releasing the bottle. */
  private startFlight(angle: number): void {
    this.judge = new LandingJudge(this.currentTuning, angle);
    this.throwCount++;
    this.currentPhase = 'flying';
  }

  /**
   * End the result wait at once: the next bottle appears now. Does nothing, and returns false,
   * unless the phase is `result`.
   */
  skip(): boolean {
    if (this.currentPhase !== 'result') return false;
    this.nextBottle();
    return true;
  }

  /**
   * Replace the bottle that has been judged with a fresh one in the hand: upright, still, with
   * the next water level from the seeded random numbers. Back to `aiming` with no outcome.
   */
  private nextBottle(): void {
    this.bottle.destroy();
    this.bottle = new Bottle(
      this.world,
      this.currentTuning,
      drawWaterLevel(this.rng, this.currentTuning),
    );
    this.judge = null;
    this.result = null;
    this.currentPhase = 'aiming';
  }

  /**
   * Release the held bottle from an exact pose, as if it had been thrown from there: position,
   * angle and (optionally) velocities, with its current water level. For tests and tuning tools,
   * so a landing can be set up directly. Like a throw it only works while `aiming`, and returns
   * false otherwise (or if a number in the pose isn't finite). It leaves `lastThrow` as it was.
   */
  placeBottle(pose: BottlePose): boolean {
    const numbers = [pose.x, pose.y, pose.angle, pose.vx ?? 0, pose.vy ?? 0, pose.omega ?? 0];
    if (this.currentPhase !== 'aiming' || !numbers.every(Number.isFinite)) return false;
    this.startFlight(pose.angle);
    this.bottle.place(pose);
    return true;
  }

  /**
   * Advance the simulation by exactly one fixed step of SIM_DT seconds. While `flying` the judge
   * watches the bottle; the step that decides the outcome starts the `result` phase (and scores),
   * and the result delay counts from there. The bottle keeps moving during `result`. A held
   * power key moves the bar in every phase.
   */
  step(): void {
    this.world.step(SIM_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.ticks++;
    this.powerMeter.step();
    if (this.currentPhase === 'flying' && this.judge) {
      this.result = this.judge.observe(this.landingSample());
      if (this.result) this.showResult(this.result);
    } else if (this.currentPhase === 'result') {
      this.resultSteps++;
      if (this.resultSteps >= stepsFor(this.currentTuning.resultDelaySeconds)) this.nextBottle();
    }
  }

  private showResult(outcome: Outcome): void {
    if (outcome.result === 'success') this.points++;
    this.resultSteps = 0;
    this.currentPhase = 'result';
  }

  /** What the judge sees: the bottle's pose and speeds, and whether it rests on the table. */
  private landingSample(): LandingSample {
    const body = this.bottle.body;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return {
      x: p.x,
      y: p.y,
      angle: body.getAngle(),
      vx: v.x,
      vy: v.y,
      omega: body.getAngularVelocity(),
      onTable: this.bottle.touches(this.table),
    };
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
      power: this.powerMeter.value,
      bottle: { ...snapshotBody(this.bottle.body), water: this.bottle.water },
      lastThrow: this.thrown && { ...this.thrown },
      outcome: this.result && { ...this.result },
      score: this.points,
      throws: this.throwCount,
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
