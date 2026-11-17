import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';

/**
 * Where the round summary's parts are on the 1280x720 canvas (game pixels; the card is centered on
 * the canvas). No Phaser in here, so e2e tests can import it to click on the buttons.
 *
 * F018 adds the Title button next to Play again: make the card taller (it stays centered) or put
 * the button beside Play again, and move the lines below any new row down.
 */
export const SUMMARY_LAYOUT = {
  card: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 640, height: 560, radius: 28 },
  /** Offset of the card's soft shadow. */
  shadow: 8,
  titleY: 132,
  scoreY: 216,
  landedY: 302,
  bestY: 358,
  /** "New best!" under the best score; the row stays free when the round didn't set a best. */
  newBestY: 398,
  playAgain: { x: GAME_WIDTH / 2, y: 488, width: 360, height: 84 },
  keyHintY: 586,
  /** The score is shrunk to fit if it is ever wider than this (the card less its margins). */
  maxTextWidth: 560,
} as const;
