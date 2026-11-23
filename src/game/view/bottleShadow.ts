import { BOTTLE_PARTS } from '../../core/bottleShape';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../core/table';

/*
 * The soft shadow on the tabletop under the bottle, as plain functions with no Phaser in them so
 * Node unit tests can check them. `bottleShadowView.ts` draws what they describe.
 */

/** Width (meters) and opacity of the shadow of a bottle resting on the table: the largest it gets. */
export const SHADOW_MAX_WIDTH_M = 1.1;
export const SHADOW_MAX_ALPHA = 0.36;
/** Height of the ellipse, as a fraction of its width (a flat disc seen from the side). */
export const SHADOW_FLATNESS = 0.16;
/** At this height above the table (meters) the shadow has faded out completely. */
export const SHADOW_FADE_HEIGHT_M = 5;
/** The shadow never shrinks below this fraction of its resting width while it is still visible. */
const SHADOW_MIN_WIDTH_FRACTION = 0.4;

export interface Shadow {
  /** Width of the ellipse in meters. */
  width: number;
  /** Opacity, 0 to 1. */
  alpha: number;
}

/**
 * The shadow of a bottle `height` meters above the table top (0 or less: resting): largest and
 * darkest at rest, shrinking and fading in a straight line the higher it is, and never below
 * zero. Null when `height` is not a finite number.
 */
export function shadowAtHeight(height: number): Shadow | null {
  if (!Number.isFinite(height)) return null;
  const t = Math.min(1, Math.max(0, height / SHADOW_FADE_HEIGHT_M));
  const widthFraction = 1 - (1 - SHADOW_MIN_WIDTH_FRACTION) * t;
  return { width: SHADOW_MAX_WIDTH_M * widthFraction, alpha: SHADOW_MAX_ALPHA * (1 - t) };
}

/** The lowest point of the bottle's outline, in meters (y down), for a bottle at (x, y) turned by `angle`. */
export function bottleLowestY(y: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let lowest = -Infinity;
  for (const part of BOTTLE_PARTS) {
    for (const v of part.vertices) lowest = Math.max(lowest, y + v.x * sin + v.y * cos);
  }
  return lowest;
}

/**
 * The shadow of the bottle at the given pose, or null while it is not over the table (its x is
 * outside the tabletop, or it has dropped below the top surface).
 */
export function bottleShadow(pose: { x: number; y: number; angle: number }): Shadow | null {
  if (pose.x < TABLE_LEFT_X || pose.x > TABLE_RIGHT_X) return null;
  const height = TABLE_TOP_Y - bottleLowestY(pose.y, pose.angle);
  if (height < -0.15) return null; // below the tabletop: it fell past the edge
  return shadowAtHeight(Math.max(0, height));
}
