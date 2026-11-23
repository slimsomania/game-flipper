import { WORLD_HEIGHT_M, WORLD_WIDTH_M, stepsFor } from './constants';
import { BOTTLE_PARTS } from './bottleShape';
import { TABLE_TOP_Y } from './table';
import type { Tuning } from './tuning';

/*
 * Judging a throw from the physics alone. The judge only reads the bottle's pose and velocity (and
 * whether it touches the table) once per fixed step; it never moves or turns the bottle. All its
 * thresholds come from the tuning, and it counts steps, not clock time, so a run is repeatable.
 */

export type OutcomeResult = 'success' | 'fail';
/**
 * Why a throw ended as it did. `upright` (after at least one full turn) and `cap` (resting on its
 * cap after any rotation: design section 2, 2026-11-22) are the successes. `noFlip` is a bottle
 * that came to rest upright without a full turn (for example a plain drop at power 0): a fail.
 */
export type OutcomeReason =
  'upright' | 'noFlip' | 'side' | 'cap' | 'offTable' | 'offScreen' | 'timeout';

/** How a throw ended. Set once per throw and never changed afterwards. */
export interface Outcome {
  result: OutcomeResult;
  reason: OutcomeReason;
  /** Radians the bottle turned since release, clockwise positive (it may be several turns). */
  rotation: number;
  /**
   * `rotation` in full turns: rounded to a whole number, except on the cap, where it is the full
   * turns completed (a bottle on its cap has turned a whole number and a half).
   */
  turns: number;
  /** What the throw scores: its number of turns for a success (at least 1 on the cap), 0 for a fail. */
  points: number;
}

/**
 * The points an upright landing scores: one per full turn, whichever way the bottle turned. A
 * bottle that turned 0.9 of a turn and tipped back upright has `turns` 1, so it scores 1. Zero
 * turns scores nothing (and isn't a success at all: see the `noFlip` reason).
 */
export function pointsForTurns(turns: number): number {
  return Math.abs(turns);
}

/** What the judge needs to know about the bottle after each step. */
export interface LandingSample {
  /** Origin (center of the base), in meters. */
  x: number;
  y: number;
  /** Radians, clockwise positive; any number of full turns. */
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  /** True while the bottle's shell touches the table. */
  onTable: boolean;
}

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/** An angle brought into (-π, π]: the same direction with whole turns removed. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - TWO_PI * Math.round(angle / TWO_PI);
  // Round() puts an exact half turn on either side; keep it at +π.
  return wrapped <= -Math.PI ? wrapped + TWO_PI : wrapped;
}

/** How far the bottle is from upright, 0 to π, ignoring whole turns. */
export function tiltFromUpright(angle: number): number {
  return Math.abs(wrapAngle(angle));
}

export interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The bounding box, in world meters, of the bottle's shell at the given pose. */
export function bottleExtent(x: number, y: number, angle: number): Extent {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const part of BOTTLE_PARTS) {
    for (const v of part.vertices) {
      const wx = x + v.x * cos - v.y * sin;
      const wy = y + v.x * sin + v.y * cos;
      extent.minX = Math.min(extent.minX, wx);
      extent.maxX = Math.max(extent.maxX, wx);
      extent.minY = Math.min(extent.minY, wy);
      extent.maxY = Math.max(extent.maxY, wy);
    }
  }
  return extent;
}

/**
 * Judges one throw. Create it at the moment of release with the bottle's angle, then call
 * `observe` after every simulation step until it returns an outcome. Thresholds are frozen at
 * creation, like the rest of a flight.
 */
export class LandingJudge {
  private readonly uprightRad: number;
  private readonly capRad: number;
  private readonly stillSpeed: number;
  private readonly stillSpin: number;
  private readonly offTableDepth: number;
  private readonly holdSteps: number;
  private readonly failRestSteps: number;
  private readonly timeoutSteps: number;

  private lastAngle: number;
  private turned = 0;
  private steps = 0;
  private uprightStill = 0;
  private otherStill = 0;
  private decided: Outcome | null = null;

  /**
   * `creditedTurns` is rotation the bottle is counted as having made already, in turns (for a
   * bottle placed upright by a test, which has no flight to turn it). It only adds to the count:
   * the judge never moves or turns the bottle.
   */
  constructor(tuning: Tuning, releaseAngle: number, creditedTurns = 0) {
    this.uprightRad = tuning.uprightToleranceDeg * DEG;
    this.capRad = tuning.capAngleDeg * DEG;
    this.stillSpeed = tuning.stillSpeed;
    this.stillSpin = tuning.stillSpin;
    this.offTableDepth = tuning.offTableDepth;
    this.holdSteps = stepsFor(tuning.uprightHoldSeconds);
    this.failRestSteps = stepsFor(tuning.failRestSeconds);
    this.timeoutSteps = stepsFor(tuning.timeoutSeconds);
    this.lastAngle = releaseAngle;
    this.turned = creditedTurns * TWO_PI;
  }

  /** The outcome once decided, else null. */
  get outcome(): Outcome | null {
    return this.decided;
  }

  /** Radians turned since release. */
  get rotation(): number {
    return this.turned;
  }

  /**
   * Look at the bottle after one more step. Returns the outcome when this step decides it, and
   * keeps returning that same outcome afterwards.
   */
  observe(sample: LandingSample): Outcome | null {
    if (this.decided) return this.decided;
    this.steps++;
    // Add up small per-step turns so the total survives any number of full turns.
    this.turned += wrapAngle(sample.angle - this.lastAngle);
    this.lastAngle = sample.angle;

    const found = this.judge(sample);
    if (found) {
      // On the cap the bottle has turned k and a half turns: it scores the k it completed.
      const whole = found === 'cap' ? Math.trunc : Math.round;
      const turns = whole(this.turned / TWO_PI) + 0; // + 0 turns -0 into 0
      // Resting upright counts only after a full turn; without one it is a fail of its own kind.
      const reason = found === 'upright' && turns === 0 ? 'noFlip' : found;
      const success = reason === 'upright' || reason === 'cap';
      const points = reason === 'cap' ? Math.max(1, pointsForTurns(turns)) : pointsForTurns(turns);
      this.decided = {
        result: success ? 'success' : 'fail',
        reason,
        rotation: this.turned,
        turns,
        points: success ? points : 0,
      };
    }
    return this.decided;
  }

  private judge(s: LandingSample): OutcomeReason | null {
    const box = bottleExtent(s.x, s.y, s.angle);
    // Completely past the left, right or bottom edge of the screen. The top doesn't count: a
    // high throw comes back down.
    if (box.maxX < 0 || box.minX > WORLD_WIDTH_M || box.minY > WORLD_HEIGHT_M) return 'offScreen';
    // The lowest point is well below the tabletop: it went over an end and is falling.
    if (box.maxY > TABLE_TOP_Y + this.offTableDepth) return 'offTable';

    const tilt = tiltFromUpright(s.angle);
    const upright = tilt <= this.uprightRad;
    const still = Math.hypot(s.vx, s.vy) < this.stillSpeed && Math.abs(s.omega) < this.stillSpin;
    if (s.onTable && still) {
      if (upright) {
        this.uprightStill++;
        this.otherStill = 0;
      } else {
        this.otherStill++;
        this.uprightStill = 0;
      }
    } else {
      this.uprightStill = 0;
      this.otherStill = 0;
    }

    if (this.uprightStill >= this.holdSteps) return 'upright';
    if (this.otherStill >= this.failRestSteps) return tilt > this.capRad ? 'cap' : 'side';
    if (this.steps >= this.timeoutSteps) return 'timeout';
    return null;
  }
}
