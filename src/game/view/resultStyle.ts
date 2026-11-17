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

export interface ResultStyle {
  message: string;
  /** Flash color as a hex number, text color as a CSS color. */
  flash: number;
  text: string;
}

/** The message and colors for a throw's outcome: green "Nailed it!" or red "Down!". */
export function resultStyle(outcome: Pick<Outcome, 'result'>): ResultStyle {
  return outcome.result === 'success'
    ? { message: 'Nailed it!', flash: COLORS.successFlash, text: COLORS.successText }
    : { message: 'Down!', flash: COLORS.failFlash, text: COLORS.failText };
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
