import { World, type Body } from 'planck';
import { Bottle, isFinitePose, type BottlePose } from './bottle';
import { GRAVITY, SIM_DT, stepsFor } from './constants';
import { SimEvents, type SimEvent } from './events';
import { MouseControl } from './mouseControl';
import { LandingJudge, type Outcome } from './outcome';
import { PowerMeter } from './powerMeter';
import { ThrowRecorder, replayFrameAt, replayStepCount, type ReplayFrame } from './replay';
import { Round } from './round';
import { createRng } from './rng';
import { snapshotBody, type LastThrow, type Phase, type SimSnapshot } from './snapshot';
import { createTable } from './table';
import { clampPower, throwImpulse, type ThrowSource } from './throw';
import { resolveTuning, type Tuning } from './tuning';
import { WaterSupply } from './waterSupply';

// The snapshot types live in snapshot.ts; they are re-exported so callers import them from here.
export type { BodySnapshot, BottleSnapshot, LastThrow, Phase, SimSnapshot } from './snapshot';

const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

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
  private readonly world: World;
  /** The water level of each new bottle: the seed's draws, or the level a tuning tool locked. */
  private readonly water: WaterSupply;
  private readonly table: Body;
  /** What happened, for the scene to drain each frame (sound, effects): see `drainEvents`. */
  private readonly events: SimEvents;
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
  /** The current throw, frame by frame, and its landing clip (F026). */
  private readonly recorder = new ThrowRecorder(() => this.currentTuning);
  private bottle: Bottle;
  private judge: LandingJudge | null = null;
  private result: Outcome | null = null;
  private currentPhase: Phase = 'aiming';
  private thrown: LastThrow | null = null;
  /** The books of the current round: its throws, points, landings and streak. */
  private readonly round = new Round(() => this.currentTuning);
  /** Every bottle released since the simulation began (a restart doesn't reset it). */
  private throwCount = 0;
  /** Steps since the outcome was decided, counted during `result`. */
  private resultSteps = 0;
  /** The landing clip taken when the outcome was decided; it is replayed after the result delay. */
  private replayClip: ReplayFrame[] = [];
  private ticks = 0;

  constructor(options: SimulationOptions = {}) {
    this.seed = options.seed ?? 1;
    this.currentTuning = resolveTuning(options.tuning);
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
    this.water = new WaterSupply(
      createRng(this.seed),
      () => this.currentTuning,
      options.lockedWater,
    );
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    this.table = createTable(this.world);
    this.events = new SimEvents(this.world, this.table, () => this.ticks);
    this.bottle = new Bottle(this.world, this.currentTuning, this.water.next());
  }

  /** The tuning in effect: the defaults, the constructor's overrides and any `setTuning` calls. */
  get tuning(): Tuning {
    return this.currentTuning;
  }

  /** The locked water level (see `lockWater`), or null while the levels are random. */
  get lockedWater(): number | null {
    return this.water.locked;
  }

  /**
   * Give every bottle this water level (clamped to 0..1) from now on, or `null` to go back to the
   * seeded random levels. For tuning tools: the held bottle takes the level at once (while it is
   * `aiming`), and a number that isn't finite is ignored. The random draw is still made for every
   * bottle, so unlocking carries on with the seed's own sequence (see `WaterSupply`).
   */
  lockWater(level: number | null): void {
    const locked = this.water.lock(level);
    if (locked !== null) this.setWater(locked);
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
    this.events.threw(used, source);
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
    this.round.released();
    this.recorder.begin();
    this.currentPhase = 'flying';
  }

  /**
   * End the result wait at once: the next bottle appears now, or the round is over if that was its
   * last throw. Does nothing, and returns false, unless the phase is `result`.
   */
  skip(): boolean {
    if (this.currentPhase !== 'result') return false;
    this.endResult();
    return true;
  }

  /** The result has been shown: on to the next bottle, or to the end of the round after the last. */
  private endResult(): void {
    if (!this.round.complete) {
      this.nextBottle();
      return;
    }
    // No new bottle: the last one stays where it landed. Nothing can be thrown until a restart.
    this.judge = null;
    this.result = null;
    this.currentPhase = 'roundOver';
  }

  /**
   * Replace the bottle that has been judged with a fresh one in the hand: upright, still, with
   * the next water level from the seeded random numbers. Back to `aiming` with no outcome.
   */
  private nextBottle(): void {
    this.bottle.destroy();
    this.bottle = new Bottle(this.world, this.currentTuning, this.water.next());
    this.judge = null;
    this.result = null;
    this.recorder.clear();
    this.replayClip = [];
    this.currentPhase = 'aiming';
  }

  /**
   * Start the round again from any phase (aiming, in flight, during a result, or after the round
   * ended): throw 1, no points, no landings, no streak, and a new bottle waiting in the hand. A
   * bottle in flight is gone and a grab with the mouse is dropped. The seed's sequence of water
   * levels carries on (the new bottle is its next one), so a restart never repeats the same ten
   * bottles. The power bar, `throws`, `lastThrow` and the clock (`tick`) are left as they are.
   */
  restartRound(): void {
    this.mouse.cancel();
    this.round.reset();
    this.nextBottle();
  }

  /**
   * Release the held bottle from an exact pose, as if it had been thrown from there: position,
   * angle and (optionally) velocities, with its current water level. For tests and tuning tools,
   * so a landing can be set up directly. Like a throw it only works while `aiming`, and returns
   * false otherwise (or if a number in the pose isn't finite). It leaves `lastThrow` as it was.
   * `pose.turns` is counted as rotation already made, so an upright bottle can still succeed.
   */
  placeBottle(pose: BottlePose): boolean {
    if (this.currentPhase !== 'aiming' || !isFinitePose(pose)) return false;
    this.startFlight(pose.angle, pose.turns ?? 0);
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
    this.bottle.beforeStep();
    this.world.step(SIM_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.ticks++;
    const touched = this.events.stepped();
    this.powerMeter.step();
    this.mouse.step(); // a pointer that stops is still: the live push (and the bar) fades
    if (this.currentPhase === 'flying' && this.judge) {
      const { x, y } = this.bottle.body.getPosition();
      const angle = this.bottle.body.getAngle();
      this.recorder.record(
        this.ticks,
        { x, y, angle, waterOffset: this.bottle.waterOffset },
        touched,
      );
      this.result = this.judge.observe(this.bottle.landingSample(this.table));
      if (this.result) this.showResult(this.result);
    } else if (this.currentPhase === 'result') {
      this.resultSteps++;
      if (this.resultSteps >= this.resultLength()) this.endResult();
    }
  }

  /** Steps the result phase lasts: the result delay, plus the replay when there is a clip. */
  private resultLength(): number {
    return (
      stepsFor(this.currentTuning.resultDelaySeconds) +
      replayStepCount(this.replayClip.length, this.currentTuning.replaySpeed)
    );
  }

  private showResult(outcome: Outcome): void {
    this.recorder.end();
    this.replayClip = this.recorder.clip();
    this.round.judged(outcome);
    this.events.judged(outcome);
    this.resultSteps = 0;
    this.currentPhase = 'result';
  }

  /**
   * Set the held bottle's water level (clamped to 0..1). For tests and tuning tools. Ignored
   * once the bottle is thrown, so a flying bottle never changes mass.
   */
  setWater(level: number): void {
    if (this.currentPhase === 'aiming') this.bottle.setWater(level);
  }

  /**
   * Everything that happened since the last call, oldest first, and then forget it: a `throw` for
   * each throw, an `impact` (with its approach speed) for each time the bottle hits the table, and
   * one `outcome` per throw. Events carry the tick they happened at. The scene calls this every
   * frame; nothing else reads or clears the queue.
   */
  drainEvents(): SimEvent[] {
    return this.events.drain();
  }

  /** Every step of the current throw from the release to the outcome; empty before a throw and once the next bottle appears. */
  get recording(): ReplayFrame[] {
    return this.recorder.allFrames();
  }

  /** The landing clip of the current throw (see `replayLeadSeconds`); empty if the bottle never touched the table. */
  get landingClip(): ReplayFrame[] {
    return this.recorder.clip();
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.ticks,
      seed: this.seed,
      phase: this.currentPhase,
      power: this.powerMeter.value,
      dragging: this.mouse.dragging,
      bottle: {
        ...snapshotBody(this.bottle.body),
        water: this.bottle.water,
        waterOffset: this.bottle.waterOffset,
      },
      lastThrow: this.thrown && { ...this.thrown },
      outcome: this.result && { ...this.result },
      resultSteps: this.currentPhase === 'result' ? this.resultSteps : null,
      replay:
        this.currentPhase === 'result'
          ? replayFrameAt(
              this.replayClip,
              this.resultSteps - stepsFor(this.currentTuning.resultDelaySeconds),
              this.currentTuning.replaySpeed,
            )
          : null,
      score: this.round.score,
      throws: this.throwCount,
      throwNumber: this.round.throwNumber(this.currentPhase === 'aiming'),
      throwsPerRound: this.round.length,
      landings: this.round.landings,
      streak: this.round.streak,
    };
  }
}
