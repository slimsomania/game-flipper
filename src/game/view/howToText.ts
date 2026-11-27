import type { InputKind } from '../inputKind';

/** The words of the How to play card, as the player reads them. */
export interface HowToTexts {
  title: string;
  closeLabel: string;
  /** The body, one paragraph each; the last is always the credit. */
  lines: string[];
}

/** The credit at the bottom of the card. */
export const HOW_TO_CREDIT = 'Created and designed by Vlas';

/**
 * The words of the card (the design's section 6): the goal, the controls for the device in use only,
 * the water-to-power principle (no numbers), the scoring and rounds, the streak, and the credit.
 * English only. On a touch device nothing names a key.
 */
export function howToTexts(kind: InputKind = 'keyboard'): HowToTexts {
  const touch = kind === 'touch';
  return {
    title: 'How to play',
    closeLabel: 'Close',
    lines: [
      'Throw the bottle so it flips in the air and lands upright on its base.',
      touch
        ? 'Push the bottle up with a finger, or slide the power bar and then tap the bottle.'
        : 'Up/Down or the mouse wheel sets the power, then Space throws. Or grab the bottle and push it up with the mouse.',
      'The more water in the bottle, the heavier it is, so it needs more power.',
      'Scoring: 1 point for a single flip, 2 for a double, 3 for a triple and 5 for landing on the cap. A round is 10 throws, and your best score is saved.',
      'The streak counts landings in a row, but gives no points.',
      HOW_TO_CREDIT,
    ],
  };
}
