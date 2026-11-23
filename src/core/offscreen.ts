import { WORLD_WIDTH_M } from './constants';
import { bottleExtent } from './outcome';

/*
 * The off-screen marker (F034 follow-up): a hard throw of a light bottle, a double flip at low
 * water or any over-powered throw, can carry the bottle above the top of the screen. The game
 * then shows a small arrow on the top edge, under the bottle, so the player can still follow it.
 * This is the pure part: whether the marker shows, where along the edge, and how far up the
 * bottle is. The drawing is `src/game/view/offscreenMarkerView.ts`.
 */

/** The marker never sits closer than this to the left or right edge of the screen, in meters. */
export const OFFSCREEN_MARKER_MARGIN = 0.3;

export interface OffscreenMarker {
  /** Where the marker sits along the top edge, in meters (the bottle's middle, kept on screen). */
  x: number;
  /** How far the bottle's lowest point is above the top of the screen, in meters (0 or more). */
  height: number;
  /** True when the whole bottle is above the screen; false when only its top is cut off. */
  hidden: boolean;
}

/**
 * The marker for a bottle at (x, y) turned by `angle`, or null when no part of it is above the
 * top of the screen (y = 0). Half a bottle showing still gets a marker: what's left can be only a
 * sliver at the edge.
 */
export function offscreenMarker(x: number, y: number, angle: number): OffscreenMarker | null {
  const box = bottleExtent(x, y, angle);
  if (box.minY >= 0) return null;
  const middle = (box.minX + box.maxX) / 2;
  return {
    x: Math.min(WORLD_WIDTH_M - OFFSCREEN_MARKER_MARGIN, Math.max(OFFSCREEN_MARKER_MARGIN, middle)),
    height: Math.max(0, -box.maxY),
    hidden: box.maxY < 0,
  };
}
