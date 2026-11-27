import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { BUTTON_LIP } from './buttonView';

/**
 * Where the How to play card's parts are on the 1280x720 canvas (game pixels). No Phaser in here, so
 * e2e tests can import it to click the buttons. The words are on the left; the strip on the right is
 * kept empty for the pictures (F054). The corner mute and fullscreen buttons are not on the card.
 */
const CARD = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 1080, height: 660, radius: 28 };
const CARD_LEFT = CARD.x - CARD.width / 2;
const CARD_RIGHT = CARD.x + CARD.width / 2;
const CARD_TOP = CARD.y - CARD.height / 2;
const CARD_BOTTOM = CARD.y + CARD.height / 2;

export const HOW_TO_LAYOUT = {
  /** The dark veil over the Title (a Graphics fill). */
  dim: { color: 0x14202e, alpha: 0.55 },
  card: CARD,
  /** Offset of the card's soft shadow. */
  shadow: 8,
  /** The card's edges, for tests. */
  box: { left: CARD_LEFT, right: CARD_RIGHT, top: CARD_TOP, bottom: CARD_BOTTOM },
  title: { x: CARD_LEFT + 40, y: 84, size: 48 },
  /** `x`, `y` the middle of the face; the hit area is 88 game px (44 CSS px on the phone) tall. */
  close: {
    x: CARD_RIGHT - 40 - 100,
    y: 84,
    width: 200,
    height: 64,
    hitWidth: 200,
    hitHeight: 88,
    fontSize: 32,
  },
  /** The words: paragraphs stacked from `top`, wrapped at `width`, left-aligned at `left`. */
  body: { left: CARD_LEFT + 40, top: 150, width: 640, size: 26, gap: 14, maxBottom: 625 },
  /** Kept empty for the pictures (F054). */
  pictures: { left: CARD_LEFT + 720, top: 150, width: 320, height: 440 },
  /** The credit, left-aligned on its middle line, at the bottom of the card. */
  credit: { x: CARD_LEFT + 40, y: 654, size: 24 },
  /** Smallest text height the phone allows (F043). */
  minTextSize: 24,
  lip: BUTTON_LIP,
} as const;
