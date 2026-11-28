import { World, type Body } from 'planck';
import { Bottle, isFinitePose, type BottlePose } from './bottle';
import { GRAVITY, SIM_DT } from './constants';
import { SimEvents, type SimEvent } from './events';
import { MouseControl } from './mouseControl';
import { LandingJudge, type Outcome } from './outcome';
import { PowerMeter } from './powerMeter';
import { Duel } from './duel';
import { ThrowRecorder, type ReplayFrame } from './replay';
import { ResultWait } from './resultWait';
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
  /** 2 runs a duel (see `Duel`); the default, 1, is solo play. */
  players?: 1 | 2;
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
  /** The power bar: any phase may adjust it. In a duel it holds the active player's value. */
  readonly powerMeter: PowerMeter;
  /** The mouse's hand on the held bottle (D25); a release throws with source `mouse`. */
  readonly mouse: MouseControl;
  /** The current throw, frame by frame, and its landing clip (F026). */
  private readonly recorder = new ThrowRecorder(() => this.currentTuning);
  private bottle: Bottle;
  private judge: LandingJudge | null = null;
  private result: Outcome | null = null;
  private currentPhase: Phase = 'aiming';
  private thrown: LastThrow | null = null;
  /** The books of a solo round: its throws, points, landings and streak. */
  private readonly soloRound = new Round(() => this.currentTuning);
  /** The two-player rules, or null in solo play. */
  private readonly duel: Duel | null;
  /** Every bottle released since the simulation began (a restart doesn't reset it). */
  private throwCount = 0;
  /** The delay and replay after the outcome is decided, counted during `result`. */
  private readonly wait = new ResultWait();
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
      throwWithPointer: (power, source) => this.throwBottle(power, source),
    });
    this.water = new WaterSupply(
      createRng(this.seed),
      () => this.currentTuning,
      options.lockedWater,
    );
    this.world = new World({ gravity: { x: 0, y: GRAVITY } });

    this.table = createTable(this.world);
    this.events = new SimEvents(this.world, this.table, () => this.ticks);
    const firstWater = this.water.next();
    this.bottle = new Bottle(this.world, this.currentTuning, firstWater);
    this.duel =
      options.players === 2
        ? new Duel(() => this.currentTuning, this.water, this.powerMeter, firstWater)
        : null;
  }

  /** The books of the player whose turn it is (the only player, in solo play). */
  private get round(): Round {
    return this.duel ? this.duel.round : this.soloRound;
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
   * Give every bottle this water level (0..1) from now on, or `null` for the seeded random levels
   * again (see `WaterSupply`). The held bottle takes it at once; a non-finite number is ignored.
   */
  lockWater(level: number | null): void {
    const locked = this.water.lock(level);
    if (locked === null) return;
    this.duel?.relock(locked);
    this.setWater(locked);
  }

  get phase(): Phase {
    return this.currentPhase;
  }

  /** Number of fixed steps simulated so far. */
  get tick(): number {
    return this.ticks;
  }

  /** Change tuning values: they apply to the held bottle and later throws, never to one in flight. */
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
    const next = this.duel ? this.duel.endTurn() : this.round.complete ? null : this.water.next();
    if (next !== null) {
      this.nextBottle(next);
      return;
    }
    // No new bottle: the last one stays where it landed. Nothing can be thrown until a restart.
    this.judge = null;
    this.result = null;
    this.currentPhase = 'roundOver';
  }

  /**
   * Replace the bottle that has been judged with a fresh one in the hand: upright, still, with
   * the given water level. Back to `aiming` with no outcome.
   */
  private nextBottle(water: number): void {
    this.bottle.destroy();
    this.bottle = new Bottle(this.world, this.currentTuning, water);
    this.judge = null;
    this.result = null;
    this.recorder.clear();
    this.wait.clear();
    this.currentPhase = 'aiming';
  }

  /**
   * Start the round again from any phase: throw 1, empty books, a new bottle in the hand (a flight
   * is gone, a mouse grab dropped). The seed's water sequence carries on, so a restart never
   * repeats the same bottles. The power bar, `throws`, `lastThrow` and `tick` are left as they are.
   * In a duel the whole duel starts over, Player 1 first, each player keeping their bar value.
   */
  restartRound(): void {
    this.mouse.cancel();
    if (this.duel) {
      this.nextBottle(this.duel.restart());
      return;
    }
    this.round.reset();
    this.nextBottle(this.water.next());
  }

  /**
   * Release the held bottle from an exact pose (for tests and tuning tools). Works only while
   * `aiming` and with finite numbers, else returns false. It leaves `lastThrow` as it was.
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
      if (this.wait.step()) this.endResult();
    }
  }

  private showResult(outcome: Outcome): void {
    this.recorder.end();
    this.wait.begin(this.currentTuning, this.recorder.clip());
    this.round.judged(outcome);
    this.events.judged(outcome);
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
      resultSteps: this.currentPhase === 'result' ? this.wait.steps : null,
      replay: this.currentPhase === 'result' ? this.wait.frame() : null,
      score: this.round.score,
      throws: this.throwCount,
      throwNumber: this.round.throwNumber(this.currentPhase === 'aiming'),
      throwsPerRound: this.round.length,
      landings: this.round.landings,
      streak: this.round.streak,
      players: this.duel ? 2 : 1,
      duel: this.duel?.snapshot() ?? null,
    };
  }
}
