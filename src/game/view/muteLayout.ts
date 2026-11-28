import { GAME_WIDTH } from '../../core/constants';
import { BUTTON_LIP } from './buttonView';

/**
 * Where the speaker button is on the 1280x720 canvas (game pixels): in the corner row at the top
 * right, which the round HUD (top-left) leaves free. Left to right the row is pause, speaker,
 * fullscreen: the fullscreen button (`fullscreenLayout.ts`) has the corner itself and the pause
 * button (`pauseLayout.ts`) is left of the speaker, so the buttons every screen shows sit together
 * against the right edge and the pause button only adds to the row. `x` and `y` are the middle of
 * its face when it isn't pressed; the lip under the face adds `BUTTON_LIP` to its height.
 */
const SIZE = 56;
const MARGIN = 24;
/** The clickable area of a corner button: 88 game px is 44 CSS px on the half-scale phone. */
export const CORNER_HIT_SIZE = 88;
/** Between two neighbouring clickable areas (not the faces, which are smaller): they never overlap. */
export const CORNER_HIT_GAP = 4;
/** The middle of the corner slot's face: the fullscreen button's place. */
export const CORNER_X = GAME_WIDTH - MARGIN - SIZE / 2;

export const MUTE_BUTTON = {
  x: CORNER_X - CORNER_HIT_SIZE - CORNER_HIT_GAP,
  y: MARGIN + SIZE / 2,
  width: SIZE,
  height: SIZE,
  /** The clickable area is bigger than the drawn face (`hitBox()` centers it on face and lip). */
  hitWidth: CORNER_HIT_SIZE,
  hitHeight: CORNER_HIT_SIZE,
  /** Corner radius of the face and lip. */
  radius: 14,
  /** Distance from the canvas's top edge (and the right edge, for the corner slot) to a face. */
  margin: MARGIN,
  lip: BUTTON_LIP,
} as const;
