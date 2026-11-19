import { stepsFor } from '../../core/constants';
import type { Outcome } from '../../core/outcome';
import { COLORS } from '../theme';

/*
 * What the result looks like, as plain functions with no Phaser in them, so Node unit tests can
 * check them. `resultView.ts` draws what they describe.
 */

/** The flash is strongest at the moment of the outcome and gone this many seconds later. */
export const FLASH_SECONDS = 0.5;
/** Opacity of the flash at its strongest: the bottle and the table stay clearly visible under it. */
export const FLASH_PEAK_ALPHA = 0.4;

/** The message pops in over this many seconds: it starts small, swells past full size and settles. */
export const POP_SECONDS = 0.25;
/** The message's size at the moment of the outcome, as a fraction of its full size. */
export const POP_FROM_SCALE = 0.5;
/** How hard the pop overshoots (the "back" ease's constant): 3 swells to about 1.12 times full size. */
const POP_OVERSHOOT = 3;

export interface ResultStyle {
  message: string;
  /** Flash color as a hex number, text color as a CSS color. */
  flash: number;
  text: string;
}

/** The success message for an upright landing of `points` points (its turns): names flip and points. */
export function successMessage(points: number): string {
  if (points === 1) return 'Nailed it! +1';
  if (points === 2) return 'Double! +2';
  if (points === 3) return 'Triple! +3';
  return `Flip ×${points}! +${points}`;
}

/**
 * The message and colors for a throw's outcome. Success is green and names the flip and the
 * points ("Nailed it! +1", "Double! +2", ...). Every fail is red: "No flip!" for a bottle that
 * stood up without a full turn, "Down!" for any other.
 */
export function resultStyle(outcome: Pick<Outcome, 'result' | 'reason' | 'points'>): ResultStyle {
  if (outcome.result === 'success') {
    return {
      message: successMessage(outcome.points),
      flash: COLORS.successFlash,
      text: COLORS.successText,
    };
  }
  return {
    message: outcome.reason === 'noFlip' ? 'No flip!' : 'Down!',
    flash: COLORS.failFlash,
    text: COLORS.failText,
  };
}

/**
 * Opacity of the flash `resultSteps` simulation steps after the outcome (the snapshot's
 * `resultSteps`; null when there is no result): `FLASH_PEAK_ALPHA` at step 0, fading in a straight
 * line to 0 after `FLASH_SECONDS` (counted in whole steps), and 0 from then on.
 */
export function flashAlpha(resultSteps: number | null): number {
  if (resultSteps === null || resultSteps < 0) return 0;
  const fade = 1 - resultSteps / stepsFor(FLASH_SECONDS);
  return fade > 0 ? FLASH_PEAK_ALPHA * fade : 0;
}

/**
 * The size of the result message `resultSteps` simulation steps after the outcome (the snapshot's
 * `resultSteps`; null when there is no result), as a multiple of its full size: `POP_FROM_SCALE`
 * at step 0, swelling past 1 and settling at exactly 1 once `POP_SECONDS` (counted in whole steps)
 * have passed, and 1 from then on. A quick pop-in, driven by the simulation's steps like the flash
 * so it holds still while the game is paused.
 */
export function popScale(resultSteps: number | null): number {
  if (resultSteps === null || resultSteps < 0) return 1;
  const t = resultSteps / stepsFor(POP_SECONDS);
  if (t >= 1) return 1;
  const u = t - 1;
  const ease = 1 + (POP_OVERSHOOT + 1) * u * u * u + POP_OVERSHOOT * u * u;
  return POP_FROM_SCALE + (1 - POP_FROM_SCALE) * ease;
}
