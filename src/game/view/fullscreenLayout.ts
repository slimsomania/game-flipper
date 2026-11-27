import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { CORNER_X, MUTE_BUTTON } from './muteLayout';

/**
 * The fullscreen button: the corner slot itself, right of the speaker, on every screen (so it never
 * moves between screens). Same size, look and 88 game px hit area as its neighbours.
 */
export const FULLSCREEN_BUTTON = {
  x: CORNER_X,
  y: MUTE_BUTTON.y,
  width: MUTE_BUTTON.width,
  height: MUTE_BUTTON.height,
  hitWidth: MUTE_BUTTON.hitWidth,
  hitHeight: MUTE_BUTTON.hitHeight,
  radius: MUTE_BUTTON.radius,
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
