import { HAND_X, HAND_Y } from '../../core/bottle';
import { PIXELS_PER_METER } from '../../core/constants';
import { DEFAULT_TUNING } from '../../core/tuning';

/*
 * Where the power bar is, in pixels on the 1280×720 canvas, and the area of it a finger can use.
 * The bar sits on the left of the hand, level with the bottle's base: far enough from the bottle
 * (and from the table, which starts below and to the right) that neither a held nor a thrown
 * bottle reaches it.
 */
export const BAR_WIDTH = 44;
export const BAR_HEIGHT = 220;
export const BAR_X = HAND_X * PIXELS_PER_METER - 130; // center of the bar
export const BAR_BOTTOM = HAND_Y * PIXELS_PER_METER + 10; // level with the bottle's base
export const BAR_TOP = BAR_BOTTOM - BAR_HEIGHT;
export const BAR_LEFT = BAR_X - BAR_WIDTH / 2;

/** The bottle's body is 80 px wide: a finger's grab area reaches this far left of the hand. */
const BOTTLE_GRAB_LEFT = HAND_X * PIXELS_PER_METER - 40 - DEFAULT_TUNING.touchGrabPadding;

/**
 * The area a finger sets the power in: 90 game px wide (45 CSS px on the reference phone, at least
 * 44), from the top of the POWER caption to the bottom of the value label. Its right edge stops at
 * the bottle's grab area, so no point of it can grab the bottle: the two never overlap.
 */
export const BAR_TOUCH = {
  left: BOTTLE_GRAB_LEFT - 90,
  right: BOTTLE_GRAB_LEFT,
  top: BAR_TOP - 10 - 30,
  bottom: BAR_BOTTOM + 8 + 36,
} as const;

/** Whether the game point (`x`, `y`) is in the bar's touch area. */
export function inBarTouchArea(x: number, y: number): boolean {
  return x >= BAR_TOUCH.left && x < BAR_TOUCH.right && y >= BAR_TOUCH.top && y <= BAR_TOUCH.bottom;
}
