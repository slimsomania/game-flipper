import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { MUTE_BUTTON } from './muteLayout';

/**
 * Where the pause button and the pause overlay's parts are on the 1280x720 canvas (game pixels).
 * No Phaser in here, so e2e tests can import it to click on the buttons.
 *
 * The pause button is the speaker's twin, in the same row and to its left. The overlay dims the
 * whole canvas and puts a white card in the middle with the three buttons stacked in it.
 */
const BUTTON_GAP = 16;

/** The corner button: pauses the game in play, and resumes it from the overlay. `x`, `y` are the middle of its face. */
export const PAUSE_BUTTON = {
  x: MUTE_BUTTON.x - MUTE_BUTTON.width - BUTTON_GAP,
  y: MUTE_BUTTON.y,
  width: MUTE_BUTTON.width,
  height: MUTE_BUTTON.height,
  radius: MUTE_BUTTON.radius,
} as const;

const CARD_WIDTH = 520;
const BUTTON_WIDTH = 400;
const BUTTON_HEIGHT = 84;
const CENTER_X = GAME_WIDTH / 2;

/** A stacked button: centered on the canvas, `y` the middle of its face. */
const row = (y: number) => ({ x: CENTER_X, y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT });

export const PAUSE_LAYOUT = {
  /** The dark veil over the game (a Graphics fill, not a Rectangle, so it is never mistaken for the result flash). */
  dim: { color: 0x14202e, alpha: 0.55 },
  card: { x: CENTER_X, y: GAME_HEIGHT / 2, width: CARD_WIDTH, height: 540, radius: 28 },
  /** Offset of the card's soft shadow. */
  shadow: 8,
  titleY: 168,
  /** Font size of the "Paused" title. */
  titleSize: 60,
  resume: row(290),
  restart: row(402),
  quit: row(514),
  hintY: 596,
} as const;
