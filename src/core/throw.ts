import type { Point } from './bottleShape';
import type { Tuning } from './tuning';

/*
 * The throw: one power value (0 to 100) becomes a linear impulse and an angular impulse on the
 * bottle. The body divides them by its own mass and inertia, so the same power gives a heavier
 * (fuller) bottle less launch speed and less spin without any special cases (decision P2). The
 * linear impulse is in proportion to the power; the angular impulse follows the spin curve
 * (`spinFraction`), which the calibration (F009) shapes so the rotation rises slowly through every
 * bottle's flip window.
 */

export const MIN_POWER = 0;
export const MAX_POWER = 100;

/** Where a throw came from. The physics treats every source the same. */
export type ThrowSource = 'keyboard' | 'mouse' | 'touch' | 'tap';

/** What a throw gives the bottle, applied at its center of mass. */
export interface ThrowImpulse {
  /** Linear impulse in kg·m/s (y points down, so a throw has a negative y). */
  linear: Point;
  /** Angular impulse in kg·m²/s; positive is clockwise. */
  angular: number;
}

/** Power limited to 0..100. */
export function clampPower(power: number): number {
  return Math.min(MAX_POWER, Math.max(MIN_POWER, power));
}

/**
 * The impulses for a throw of `power` (clamped to 0..100). The direction is fixed: straight up,
 * turned `throwAngleDeg` toward the table (+x). The spin is clockwise, so the top of the bottle
 * moves toward the table. Both grow in proportion to the power.
 */
export function throwImpulse(
  power: number,
  tuning: Pick<
    Tuning,
    | 'throwAngleDeg'
    | 'throwLinearImpulse'
    | 'throwAngularImpulse'
    | 'throwSpinExponent'
    | 'throwSpinGrowth'
  >,
): ThrowImpulse {
  const used = clampPower(power);
  const angle = (tuning.throwAngleDeg * Math.PI) / 180;
  const push = tuning.throwLinearImpulse * (used / MAX_POWER);
  return {
    linear: { x: push * Math.sin(angle), y: -push * Math.cos(angle) },
    angular: tuning.throwAngularImpulse * spinFraction(used, tuning),
  };
}

/**
 * The part of the full angular impulse that a throw at `power` (clamped to 0..100) applies:
 * `(power/100)^exponent * exp(growth * (power - 100))`. It is 0 at power 0 and 1 at power 100, and
 * it never goes down as the power goes up (for an exponent above 0 and a growth of 0 or more).
 */
export function spinFraction(
  power: number,
  tuning: Pick<Tuning, 'throwSpinExponent' | 'throwSpinGrowth'>,
): number {
  const used = clampPower(power);
  if (used === 0) return 0;
  return (
    Math.pow(used / MAX_POWER, tuning.throwSpinExponent) *
    Math.exp(tuning.throwSpinGrowth * (used - MAX_POWER))
  );
}
