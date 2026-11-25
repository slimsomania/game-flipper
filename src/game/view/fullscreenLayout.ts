import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { PAUSE_BUTTON } from './pauseLayout';

const HIT_GAP = 4;

/**
 * The fullscreen button: the corner row's third slot, left of the pause button (and of the empty
 * place where it would be on the Title and the summary, so the button never moves between screens).
 * Same size, look and 88 game px hit area as its neighbours.
 */
export const FULLSCREEN_BUTTON = {
  x: PAUSE_BUTTON.x - PAUSE_BUTTON.hitWidth - HIT_GAP,
  y: PAUSE_BUTTON.y,
  width: PAUSE_BUTTON.width,
  height: PAUSE_BUTTON.height,
  hitWidth: PAUSE_BUTTON.hitWidth,
  hitHeight: PAUSE_BUTTON.hitHeight,
  radius: PAUSE_BUTTON.radius,
} as const;

/** The home-screen card shown where the browser has no page fullscreen (iPhone). */
export const HOME_CARD = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT / 2,
  width: 760,
  height: 380,
  radius: 28,
  shadow: 8,
  textY: 250,
  textSize: 36,
  textWidth: 680,
  close: { x: GAME_WIDTH / 2, y: 470, width: 280, height: 96 },
} as const;

/** The card's words: they name Share and Add to Home Screen, as the iPhone's menu does. */
export const HOME_CARD_TEXT = 'To play full screen on iPhone: tap Share, then Add to Home Screen';
export const HOME_CARD_CLOSE = 'Close';
