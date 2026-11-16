import type { Point } from './bottleShape';
import type { Tuning } from './tuning';

/*
 * The throw: one power value (0 to 100) becomes a linear impulse and an angular impulse on the
 * bottle. The body divides them by its own mass and inertia, so the same power gives a heavier
 * (fuller) bottle less launch speed and less spin without any special cases (decision P2).
 */

export const MIN_POWER = 0;
export const MAX_POWER = 100;

/** Where a throw came from. The physics treats every source the same. */
export type ThrowSource = 'keyboard' | 'mouse';

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
  tuning: Pick<Tuning, 'throwAngleDeg' | 'throwLinearImpulse' | 'throwAngularImpulse'>,
): ThrowImpulse {
  const fraction = clampPower(power) / MAX_POWER;
  const angle = (tuning.throwAngleDeg * Math.PI) / 180;
  const push = tuning.throwLinearImpulse * fraction;
  return {
    linear: { x: push * Math.sin(angle), y: -push * Math.cos(angle) },
    angular: tuning.throwAngularImpulse * fraction,
  };
}
