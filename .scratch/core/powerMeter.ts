import { SIM_DT, SIM_HZ } from './constants';
import { clampPower } from './throw';
import type { Tuning } from './tuning';

/*
 * The power bar: the player's own setting for the next throw, 0 to 100. A tap on Up or Down moves
 * it one step, a held key moves it continuously and faster the longer it is held, and a mouse
 * wheel notch moves it a step. The scene only forwards key presses, releases and wheel notches;
 * the steps, the hold acceleration and the clamping all live here, and the hold advances once per
 * fixed simulation step (decision P5), so it is the same for any frame rate.
 */

/** The numbers the meter reads. It asks for them on every use, so a tuning change applies at once. */
export type PowerTuning = Pick<
  Tuning,
  | 'powerStart'
  | 'powerTapStep'
  | 'powerWheelStep'
  | 'powerHoldDelaySeconds'
  | 'powerHoldRateStart'
  | 'powerHoldRateMax'
  | 'powerHoldRampSeconds'
>;

/** +1 raises the power (Up), -1 lowers it (Down). */
export type PowerDirection = 1 | -1;

export class PowerMeter {
  private level: number;
  /** Keys currently held, oldest first. The newest one moves the bar. */
  private held: PowerDirection[] = [];
  /** Fixed steps since the newest held key went down, or since the older key took over again. */
  private heldSteps = 0;

  constructor(private readonly tuning: () => PowerTuning) {
    this.level = clampPower(tuning().powerStart);
  }

  /** The current power, from 0 to 100. */
  get value(): number {
    return this.level;
  }

  /** Set the power directly (clamped to 0..100). Does nothing if `power` isn't a number. */
  set(power: number): void {
    if (!Number.isNaN(power)) this.level = clampPower(power);
  }

  /**
   * A key goes down: the bar moves one tap step at once, and if the key stays down it starts moving
   * continuously after the hold delay. Pressing a key that is already held does nothing, so an
   * auto-repeat can't count as a second tap. With both keys down the newest one wins.
   */
  press(direction: PowerDirection): void {
    if (this.held.includes(direction)) return;
    this.held.push(direction);
    this.heldSteps = 0;
    this.move(direction * this.tuning().powerTapStep);
  }

  /**
   * A key comes up. With no argument, every key does (for example when the window loses focus and
   * the key-up would never arrive). If the other key is still down it takes over, from its
   * delay again.
   */
  release(direction?: PowerDirection): void {
    const newest = this.held[this.held.length - 1];
    this.held = direction === undefined ? [] : this.held.filter((d) => d !== direction);
    if (this.held[this.held.length - 1] !== newest) this.heldSteps = 0;
  }

  /** Mouse wheel notches: positive raises the power, negative lowers it, a step per notch. */
  wheel(notches: number): void {
    if (Number.isFinite(notches)) this.move(notches * this.tuning().powerWheelStep);
  }

  /** Advance a held key by one fixed step of SIM_DT seconds. Does nothing with no key held. */
  step(): void {
    const direction = this.held[this.held.length - 1];
    if (direction === undefined) return;
    const t = this.tuning();
    this.heldSteps++;
    const delaySteps = Math.round(t.powerHoldDelaySeconds * SIM_HZ);
    if (this.heldSteps <= delaySteps) return;

    // Seconds of continuous movement so far, counting this step: the rate rises in a straight
    // line from the starting rate to the maximum over the ramp time.
    const moving = (this.heldSteps - delaySteps) * SIM_DT;
    const ramp = t.powerHoldRampSeconds > 0 ? Math.min(1, moving / t.powerHoldRampSeconds) : 1;
    const rate = t.powerHoldRateStart + (t.powerHoldRateMax - t.powerHoldRateStart) * ramp;
    this.move(direction * rate * SIM_DT);
  }

  private move(delta: number): void {
    this.level = clampPower(this.level + delta);
  }
}
