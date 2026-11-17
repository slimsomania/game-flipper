import { World, type Body } from 'planck';
import { Bottle, drawWaterLevel, type BottlePose } from './bottle';
import { GRAVITY, SIM_DT, stepsFor } from './constants';
import { MouseControl } from './mouseControl';
import { LandingJudge, type LandingSample, type Outcome } from './outcome';
import { PowerMeter } from './powerMeter';
import { createRng, type Rng } from './rng';
import { snapshotBody, type LastThrow, type Phase, type SimSnapshot } from './snapshot';
import { createTable } from './table';
import { clampPower, throwImpulse, type ThrowSource } from './throw';
import { resolveTuning, type Tuning } from './tuning';

// The snapshot types live in snapshot.ts; they are re-exported so callers import them from here.
export type { BodySnapshot, BottleSnapshot, LastThrow, Phase, SimSnapshot } from './snapshot';

const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

const clampWater = (level: number): number => Math.min(1, Math.max(0, level));

export interface SimulationOptions {
  /** Same seed + same inputs = same result. */
  seed?: number;
  /** Overrides for the defaults in `DEFAULT_TUNING`. */
  tuning?: Partial<Tuning>;
  /** Give every bottle this water level (0 to 1) instead of a random one; see `lockWater`. */
  lockedWater?: number | null;
}

export class Simulation {
  readonly seed: number;
  private currentTuning: Tuning;
  /** The water level every bottle gets while it is set, or null for the seeded random levels. */
  private waterLock: number | null = null;
  private readonly world: World;
  private readonly rng: Rng;
  private readonly table: Body;
  /**
   * The power bar. The scene forwards key presses, releases and wheel notches to it, and any phase
   * may adjust it, so the player can set the next throw while a result is still showing.
   */
  readonly powerMeter: PowerMeter;
  /**
   * The mouse's hand on the held bottle: grab, push, release (D25). While the bottle is grabbed the
   * power bar shows the live push; a release throws through `throwBottle` with source `mouse`.
   */
  readonly mouse: MouseControl;
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
    if (options.lockedWater != null && Number.isFinite(options.lockedWater)) {
      this.waterLock = clampWater(options.lockedWater);
    }
    this.powerMeter = new PowerMeter(() => this.currentTuning);
    this.mouse = new MouseControl({
      phase: () => this.currentPhase,
      tuning: () => this.currentTuning,
      powerMeter: this.powerMeter,
      bottle: () => {
        const { x, y } = this.bottle.body.getPosition();
        return { x, y, angle: this.bottle.body.getAngle() };
      },
      throwWithMouse: (power) => this.throwBottle(power, 'mouse'),
    });
    this.rng = createRng(this.seed);
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    this.table = createTable(this.world);
    this.bottle = new Bottle(this.world, this.currentTuning, this.nextWaterLevel());
  }

  /** The tuning in effect: the defaults, the constructor's overrides and any `setTuning` calls. */
  get tuning(): Tuning {
    return this.currentTuning;
  }

  /** The locked water level (see `lockWater`), or null while the levels are random. */
  get lockedWater(): number | null {
    return this.waterLock;
  }

  /**
   * Give every bottle this water level (clamped to 0..1) from now on, or `null` to go back to the
   * seeded random levels. For tuning tools: the held bottle takes the level at once (while it is
   * `aiming`), and a number that isn't finite is ignored. The random draw is still made for every
   * bottle, so unlocking carries on with the seed's own sequence, as if nothing had been locked.
   */
  lockWater(level: number | null): void {
    if (level === null) {
      this.waterLock = null;
      return;
    }
    if (!Number.isFinite(level)) return;
    this.waterLock = clampWater(level);
    this.setWater(this.waterLock);
  }

  /** The water level of the next bottle: the lock if there is one, else the seed's next draw. */
  private nextWaterLevel(): number {
    const drawn = drawWaterLevel(this.rng, this.currentTuning);
    return this.waterLock ?? drawn;
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

  /**
   * Begin judging a throw from `angle` (with `turns` already credited) and count it. Call it just
   * before releasing the bottle. Whatever the mouse was doing with the bottle ends here.
   */
  private startFlight(angle: number, turns = 0): void {
    this.mouse.bottleLeft();
    this.judge = new LandingJudge(this.currentTuning, angle, turns);
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
    this.bottle = new Bottle(this.world, this.currentTuning, this.nextWaterLevel());
    this.judge = null;
    this.result = null;
    this.currentPhase = 'aiming';
  }

  /**
   * Release the held bottle from an exact pose, as if it had been thrown from there: position,
   * angle and (optionally) velocities, with its current water level. For tests and tuning tools,
   * so a landing can be set up directly. Like a throw it only works while `aiming`, and returns
   * false otherwise (or if a number in the pose isn't finite). It leaves `lastThrow` as it was.
   * `pose.turns` is counted as rotation already made, so an upright bottle can still succeed.
   */
  placeBottle(pose: BottlePose): boolean {
    const turns = pose.turns ?? 0;
    const numbers = [
      pose.x,
      pose.y,
      pose.angle,
      pose.vx ?? 0,
      pose.vy ?? 0,
      pose.omega ?? 0,
      turns,
    ];
    if (this.currentPhase !== 'aiming' || !numbers.every(Number.isFinite)) return false;
    this.startFlight(pose.angle, turns);
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
    this.mouse.step(); // a pointer that stops is still: the live push (and the bar) fades
    if (this.currentPhase === 'flying' && this.judge) {
      this.result = this.judge.observe(this.landingSample());
      if (this.result) this.showResult(this.result);
    } else if (this.currentPhase === 'result') {
      this.resultSteps++;
      if (this.resultSteps >= stepsFor(this.currentTuning.resultDelaySeconds)) this.nextBottle();
    }
  }

  private showResult(outcome: Outcome): void {
    this.points += outcome.points;
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
      dragging: this.mouse.dragging,
      bottle: { ...snapshotBody(this.bottle.body), water: this.bottle.water },
      lastThrow: this.thrown && { ...this.thrown },
      outcome: this.result && { ...this.result },
      resultSteps: this.currentPhase === 'result' ? this.resultSteps : null,
      score: this.points,
      throws: this.throwCount,
    };
  }
}
