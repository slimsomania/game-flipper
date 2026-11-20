import { BOTTLE_BODY_WIDTH, BOTTLE_HEIGHT } from './bottleShape';
import { PIXELS_PER_METER, SIM_DT } from './constants';
import { pushPower, type PushSample, type PushTuning } from './push';

/*
 * Grabbing the held bottle with the mouse. The scene forwards the pointer (where it is and when,
 * from the browser's event time stamps); everything else is decided here: whether a press is on the
 * bottle, the pointer samples of the drag, and the live and final push power (`pushPower`, F011).
 * The pointer's sideways position never matters: only its height is a push.
 */

/** Where a bottle is: the center of its base in meters and its angle in radians (clockwise). */
export interface BottlePosition {
  x: number;
  y: number;
  angle: number;
}

/**
 * Whether the point (`x`, `y`) in logical game pixels is on the bottle, or within `padding` pixels
 * of it. "On the bottle" is the box around its whole outline, so the narrow neck and cap are as
 * easy to catch as the body. A point that isn't a number is never on it.
 */
export function isOnBottle(x: number, y: number, bottle: BottlePosition, padding: number): boolean {
  const dx = x / PIXELS_PER_METER - bottle.x;
  const dy = y / PIXELS_PER_METER - bottle.y;
  // The point in the bottle's own coordinates (undo its rotation).
  const cos = Math.cos(bottle.angle);
  const sin = Math.sin(bottle.angle);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const pad = Math.max(0, padding) / PIXELS_PER_METER;
  return (
    Math.abs(localX) <= BOTTLE_BODY_WIDTH / 2 + pad &&
    localY >= -BOTTLE_HEIGHT - pad &&
    localY <= pad
  );
}

/** How much of the drag is kept, in windows of the push: all the push can see, and then some. */
const KEEP_WINDOWS = 2;

/**
 * One grab: from the press on the bottle to the release (or until it is dropped). It remembers the
 * pointer samples and gives the push power: `power()` while the button is down, `finish()` at the
 * release. Time comes from the samples' own `t` (seconds), never from a clock, plus the fixed
 * steps counted by `idle()`, so the same inputs always give the same power.
 */
export class Grab {
  private samples: PushSample[] = [];
  private held = false;
  /** Fixed steps since the newest sample: a pointer that has stopped is still, and the push dies. */
  private idleSteps = 0;
  private before = 0;

  /** True from a successful `begin` until `finish` or `cancel`. */
  get active(): boolean {
    return this.held;
  }

  /** The power bar's value when the grab began: what it goes back to if nothing is thrown. */
  get barBefore(): number {
    return this.before;
  }

  /**
   * Start a grab with the pointer at height `y` (logical pixels) at time `t` (seconds), while the
   * power bar shows `bar`. Returns false, starting nothing, for a position or time that isn't a
   * finite number.
   */
  begin(y: number, t: number, bar: number): boolean {
    if (!Number.isFinite(y) || !Number.isFinite(t)) return false;
    this.samples = [{ t, y }];
    this.held = true;
    this.idleSteps = 0;
    this.before = bar;
    return true;
  }

  /**
   * The pointer is at height `y` at time `t`. A time earlier than the newest sample is taken as the
   * same moment, so the clock never runs backward. Returns whether anything was recorded.
   */
  move(y: number, t: number, tuning: Pick<PushTuning, 'pushWindowSeconds'>): boolean {
    if (!this.held || !Number.isFinite(y) || !Number.isFinite(t)) return false;
    const latest = this.samples[this.samples.length - 1];
    this.samples.push({ t: Math.max(t, latest.t), y });
    this.idleSteps = 0;
    // The push only reads the last window and the sample before it: forget what is older.
    const keepFrom =
      this.samples[this.samples.length - 1].t - KEEP_WINDOWS * tuning.pushWindowSeconds;
    while (this.samples.length > 2 && this.samples[1].t <= keepFrom) this.samples.shift();
    return true;
  }

  /** One fixed step passes with no pointer event: the pointer stays where it was. */
  idle(): void {
    if (this.held) this.idleSteps++;
  }

  /**
   * The push power (0 to 100) a release right now would give: the drag so far, with the pointer
   * counted as standing still since its newest sample. 0 when there is no grab.
   */
  power(tuning: PushTuning): number {
    if (!this.held) return 0;
    const latest = this.samples[this.samples.length - 1];
    if (this.idleSteps === 0) return pushPower(this.samples, tuning);
    const now = { t: latest.t + this.idleSteps * SIM_DT, y: latest.y };
    return pushPower([...this.samples, now], tuning);
  }

  /**
   * The button comes up at time `t` (seconds) with the pointer at height `y`, or, with no `y`, where
   * it was last seen (a release outside the canvas has no position the game can trust). Ends the
   * grab and returns the push power of the whole drag. A time that isn't a number counts as the
   * newest sample's moment.
   */
  finish(tuning: PushTuning, t: number, y?: number): number {
    if (!this.held) return 0;
    const latest = this.samples[this.samples.length - 1];
    const at = Number.isFinite(t) ? Math.max(t, latest.t) : latest.t;
    const height = y !== undefined && Number.isFinite(y) ? y : latest.y;
    const power = pushPower([...this.samples, { t: at, y: height }], tuning);
    this.cancel();
    return power;
  }

  /** Drop the grab without a result. */
  cancel(): void {
    this.held = false;
    this.samples = [];
    this.idleSteps = 0;
  }
}
