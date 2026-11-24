import { Grab, isOnBottle, type BottlePosition } from './grab';
import type { PowerMeter } from './powerMeter';
import type { Phase } from './snapshot';
import type { Tuning } from './tuning';

/*
 * The mouse's hand on the held bottle: the rules for a press, a push and a release (D25). It is
 * owned by the Simulation (`sim.mouse`) and reaches back into it only through `MouseHost`, so the
 * scene calls `sim.mouse.grab(...)` and the like, and everything after the push is the Simulation's
 * ordinary `throwBottle`.
 */

/** The kind of pointer that holds the bottle: it is only recorded, the physics treats both alike. */
export type PointerSource = 'mouse' | 'touch';

/** What the mouse control needs from the simulation it belongs to. */
export interface MouseHost {
  phase(): Phase;
  tuning(): Tuning;
  /** The power bar: it shows the live push while the bottle is grabbed. */
  readonly powerMeter: PowerMeter;
  /** Where the held bottle is. */
  bottle(): BottlePosition;
  /** Throw the held bottle with `power`, as a throw from `source`. Returns whether it threw. */
  throwWithPointer(power: number, source: PointerSource): boolean;
}

export class MouseControl {
  private readonly grabbing = new Grab();
  private source: PointerSource = 'mouse';

  constructor(private readonly host: MouseHost) {}

  /** True while the mouse holds the bottle. */
  get dragging(): boolean {
    return this.grabbing.active;
  }

  /**
   * Whether a press at (`x`, `y`), in logical game pixels, would grab the bottle: the simulation is
   * `aiming` and the point is on the bottle (or within `grabPadding` of it). Also what the cursor asks.
   */
  canGrab(x: number, y: number): boolean {
    if (this.host.phase() !== 'aiming') return false;
    return isOnBottle(x, y, this.host.bottle(), this.host.tuning().grabPadding);
  }

  /**
   * The left button goes down at (`x`, `y`) at time `t` (seconds: the browser's event time). Grabs
   * the bottle if `canGrab` says the press is on it, and returns whether it did. The power bar then
   * shows the live push, which starts at 0. The bottle stays in the hand: only the push matters.
   * `source` is the kind of pointer (a finger is `touch`): the throw records it, nothing else changes.
   */
  grab(x: number, y: number, t: number, source: PointerSource = 'mouse'): boolean {
    if (this.grabbing.active || !this.canGrab(x, y)) return false;
    if (!this.grabbing.begin(y, t, this.host.powerMeter.value)) return false;
    this.source = source;
    this.showPush();
    return true;
  }

  /** The pointer moved to height `y` at time `t` (seconds) during a grab; the bar follows the push. */
  drag(y: number, t: number): void {
    if (this.grabbing.move(y, t, this.host.tuning())) this.showPush();
  }

  /**
   * The button comes up at time `t` (seconds), at height `y` (omit it when the pointer's position
   * can't be trusted, as outside the canvas: it counts as where it was last seen). The grab ends
   * either way. If the push reaches `pushMinPower` the bottle is thrown with it, through the same
   * `throwBottle` as the keyboard (source `mouse`), and the bar keeps that power. Otherwise nothing
   * is thrown and the bar goes back to what it showed before the grab. Returns whether it threw.
   */
  release(t: number, y?: number): boolean {
    if (!this.grabbing.active) return false;
    const tuning = this.host.tuning();
    const power = this.grabbing.finish(tuning, t, y);
    if (!(power >= tuning.pushMinPower)) {
      this.host.powerMeter.set(this.grabbing.barBefore);
      return false;
    }
    this.host.powerMeter.set(power);
    return this.host.throwWithPointer(power, this.source);
  }

  /** Drop the grab without throwing (the window lost focus): the bar goes back to what it was. */
  cancel(): void {
    if (!this.grabbing.active) return;
    this.grabbing.cancel();
    this.host.powerMeter.set(this.grabbing.barBefore);
  }

  /**
   * The bottle has left the hand by some other way (a keyboard throw, `placeBottle`): the grab is
   * over. The bar keeps what it shows.
   */
  bottleLeft(): void {
    this.grabbing.cancel();
  }

  /**
   * One fixed simulation step passes. With the bottle grabbed and no pointer event since the last
   * step, the pointer is still: the live push, and the bar, fade as the steps pass.
   */
  step(): void {
    if (!this.grabbing.active) return;
    this.grabbing.idle();
    this.showPush();
  }

  /** The power bar shows what a release right now would throw with. */
  private showPush(): void {
    this.host.powerMeter.set(this.grabbing.power(this.host.tuning()));
  }
}
