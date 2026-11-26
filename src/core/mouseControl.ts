import { Grab, isOnBottle, type BottlePosition } from './grab';
import type { PowerMeter } from './powerMeter';
import type { Phase } from './snapshot';
import type { ThrowSource } from './throw';
import { classifyTouch } from './touchTap';
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
  throwWithPointer(power: number, source: ThrowSource): boolean;
}

/** The push numbers a pointer of this kind reads: a finger's own full distance, speed, minimum and padding. */
export function pushTuningFor(tuning: Tuning, source: PointerSource): Tuning {
  if (source !== 'touch') return tuning;
  return {
    ...tuning,
    pushFullDistance: tuning.touchFullDistance,
    pushFullSpeed: tuning.touchFullSpeed,
    pushMinPower: tuning.touchMinPower,
    grabPadding: tuning.touchGrabPadding,
  };
}

export class MouseControl {
  private readonly grabbing = new Grab();
  private source: PointerSource = 'mouse';
  /** Where and when the press happened, and the farthest the pointer has been from there (F048). */
  private pressX = 0;
  private pressY = 0;
  private pressT = 0;
  private moved = 0;

  constructor(private readonly host: MouseHost) {}

  /** True while the mouse holds the bottle. */
  get dragging(): boolean {
    return this.grabbing.active;
  }

  /**
   * Whether a press at (`x`, `y`), in logical game pixels, would grab the bottle: the simulation is
   * `aiming` and the point is on the bottle (or within `grabPadding` of it). Also what the cursor asks.
   */
  canGrab(x: number, y: number, source: PointerSource = 'mouse'): boolean {
    if (this.host.phase() !== 'aiming') return false;
    const { grabPadding } = pushTuningFor(this.host.tuning(), source);
    return isOnBottle(x, y, this.host.bottle(), grabPadding);
  }

  /**
   * The left button goes down at (`x`, `y`) at time `t` (seconds: the browser's event time). Grabs
   * the bottle if `canGrab` says the press is on it, and returns whether it did. The power bar then
   * shows the live push, which starts at 0. The bottle stays in the hand: only the push matters.
   * `source` is the kind of pointer (a finger is `touch`): the throw records it, nothing else changes.
   */
  grab(x: number, y: number, t: number, source: PointerSource = 'mouse'): boolean {
    if (this.grabbing.active || !this.canGrab(x, y, source)) return false;
    if (!this.grabbing.begin(y, t, this.host.powerMeter.value)) return false;
    this.source = source;
    this.pressX = x;
    this.pressY = y;
    this.pressT = t;
    this.moved = 0;
    this.showPush();
    return true;
  }

  /** The pointer moved to height `y` at time `t` (seconds) during a grab; the bar follows the push. */
  drag(y: number, t: number, x: number = this.pressX): void {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      this.moved = Math.max(this.moved, Math.hypot(x - this.pressX, y - this.pressY));
    }
    if (this.grabbing.move(y, t, this.host.tuning())) this.showPush();
  }

  /**
   * The button comes up at time `t` (seconds), at height `y` (omit it when the pointer's position
   * can't be trusted, as outside the canvas: it counts as where it was last seen). The grab ends
   * either way. If the push reaches `pushMinPower` the bottle is thrown with it, through the same
   * `throwBottle` as the keyboard (source `mouse`), and the bar keeps that power. Otherwise nothing
   * is thrown and the bar goes back to what it showed before the grab. Returns whether it threw.
   */
  release(t: number, y?: number, x?: number): boolean {
    if (!this.grabbing.active) return false;
    const tuning = pushTuningFor(this.host.tuning(), this.source);
    if (this.source === 'touch') {
      if (x !== undefined && y !== undefined) this.drag(y, t, x);
      // F048: a finger that lifts at once without moving is a tap: it throws at the bar's power,
      // exactly as Space does. One held too long without moving is neither a tap nor a push.
      const kind = classifyTouch(t - this.pressT, this.moved, this.host.tuning());
      if (kind !== 'push') {
        const bar = this.grabbing.barBefore;
        this.grabbing.cancel();
        this.host.powerMeter.set(bar);
        return kind === 'tap' && this.host.throwWithPointer(bar, 'tap');
      }
    }
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
    // A finger that hasn't moved past the tap limit may yet be a tap: the bar keeps its value.
    if (this.source === 'touch' && this.moved <= this.host.tuning().touchTapMaxMove) return;
    this.host.powerMeter.set(this.grabbing.power(pushTuningFor(this.host.tuning(), this.source)));
  }
}
