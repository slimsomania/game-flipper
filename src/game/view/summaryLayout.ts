import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';

/**
 * Where the round summary's parts are on the 1280x720 canvas (game pixels; the card is centered on
 * the canvas). No Phaser in here, so e2e tests can import it to click on the buttons.
 *
 * The Play again and Title buttons share one row, side by side across the card less its margins.
 */
const CARD_WIDTH = 640;
const MARGIN = 40;
const GAP = 20;
const PLAY_AGAIN_WIDTH = 330;
const TITLE_WIDTH = CARD_WIDTH - 2 * MARGIN - GAP - PLAY_AGAIN_WIDTH;
const ROW_LEFT = (GAME_WIDTH - CARD_WIDTH) / 2 + MARGIN;
const ROW_Y = 488;
const ROW_HEIGHT = 88;

export const SUMMARY_LAYOUT = {
  card: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: CARD_WIDTH, height: 560, radius: 28 },
  /** Offset of the card's soft shadow. */
  shadow: 8,
  titleY: 132,
  scoreY: 216,
  landedY: 302,
  bestY: 358,
  /** "New best!" under the best score; the row stays free when the round didn't set a best. */
  newBestY: 398,
  playAgain: {
    x: ROW_LEFT + PLAY_AGAIN_WIDTH / 2,
    y: ROW_Y,
    width: PLAY_AGAIN_WIDTH,
    height: ROW_HEIGHT,
  },
  /** The Title button, right of Play again: it goes back to the title screen. */
  title: {
    x: ROW_LEFT + PLAY_AGAIN_WIDTH + GAP + TITLE_WIDTH / 2,
    y: ROW_Y,
    width: TITLE_WIDTH,
    height: ROW_HEIGHT,
  },
  keyHintY: 586,
  /** The score is shrunk to fit if it is ever wider than this (the card less its margins). */
  maxTextWidth: CARD_WIDTH - 2 * MARGIN,
} as const;
