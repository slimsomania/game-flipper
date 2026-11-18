import { GAME_WIDTH } from '../../core/constants';
import { BUTTON_LIP } from './buttonView';

/**
 * Where the speaker button is on the 1280x720 canvas (game pixels): the top-right corner, which
 * the round HUD (top-left) leaves free. `x` and `y` are the middle of its face when it isn't
 * pressed; the lip under the face adds `BUTTON_LIP` to its height. The pause button (F019) goes to
 * the left of it, in the same row.
 */
const SIZE = 56;
const MARGIN = 24;

export const MUTE_BUTTON = {
  x: GAME_WIDTH - MARGIN - SIZE / 2,
  y: MARGIN + SIZE / 2,
  width: SIZE,
  height: SIZE,
  /** Corner radius of the face and lip. */
  radius: 14,
  /** Distance from the canvas's top and right edges to the button's face. */
  margin: MARGIN,
  lip: BUTTON_LIP,
} as const;
