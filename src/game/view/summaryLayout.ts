import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';

/**
 * Where the round summary's parts are on the 1280x720 canvas (game pixels; the card is centered on
 * the canvas). No Phaser in here, so e2e tests can import it to click on the buttons.
 *
 * F015 adds the best score under the "Landed" line and F018 the Title button next to Play again:
 * make the card taller (it stays centered) and move the lines below the new one down.
 */
export const SUMMARY_LAYOUT = {
  card: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 640, height: 460, radius: 28 },
  /** Offset of the card's soft shadow. */
  shadow: 8,
  titleY: 182,
  scoreY: 266,
  landedY: 352,
  playAgain: { x: GAME_WIDTH / 2, y: 458, width: 360, height: 84 },
  keyHintY: 548,
  /** The score is shrunk to fit if it is ever wider than this (the card less its margins). */
  maxTextWidth: 560,
} as const;
