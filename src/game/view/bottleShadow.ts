import { BOTTLE_BODY_WIDTH, BOTTLE_PARTS } from '../../core/bottleShape';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../core/table';

/*
 * The soft shadow on the tabletop under the bottle, as plain functions with no Phaser in them so
 * Node unit tests can check them. `bottleShadowView.ts` draws what they describe.
 *
 * The light comes from straight above, so the shadow covers what the bottle covers seen from
 * above: from the leftmost to the rightmost point of its outline at its current angle, plus a
 * soft rim. An upright bottle casts a short shadow the width of its body; one lying on its side
 * casts one along its whole length. Seen from the side, the shadow's depth on the table is the
 * bottle's round body, so it stays the same at any angle.
 */

/** The soft rim (meters) added to the footprint: half of it fades out past each end. */
export const SHADOW_RIM_M = 0.3;
/** Width (meters) of the shadow of a bottle standing upright on the table: its shortest at rest. */
export const SHADOW_UPRIGHT_WIDTH_M = BOTTLE_BODY_WIDTH + SHADOW_RIM_M;
/** Depth of the shadow as a fraction of the upright width (a flat disc seen from the side). */
export const SHADOW_FLATNESS = 0.16;
/** Depth (meters) of the shadow at rest, whatever the bottle's angle. */
export const SHADOW_DEPTH_M = SHADOW_UPRIGHT_WIDTH_M * SHADOW_FLATNESS;
export const SHADOW_MAX_ALPHA = 0.36;
/** At this height above the table (meters) the shadow has faded out completely. */
export const SHADOW_FADE_HEIGHT_M = 5;
/** The shadow never shrinks below this fraction of its resting size while it is still visible. */
const SHADOW_MIN_SIZE_FRACTION = 0.4;

export interface Shadow {
  /** Center of the shadow on the table, in meters. */
  x: number;
  /** Width of the shadow along the table, in meters. */
  width: number;
  /** Depth of the shadow (its height as drawn), in meters. */
  depth: number;
  /** Opacity, 0 to 1. */
  alpha: number;
}

/**
 * The shadow of a bottle `height` meters above the table top (0 or less: resting) whose outline
 * spans `footprint` meters seen from above (default: upright), centered at x = 0: largest and
 * darkest at rest, shrinking and fading in a straight line the higher it is. Null when `height`
 * is not a finite number.
 */
export function shadowAtHeight(height: number, footprint = BOTTLE_BODY_WIDTH): Shadow | null {
  if (!Number.isFinite(height)) return null;
  const t = Math.min(1, Math.max(0, height / SHADOW_FADE_HEIGHT_M));
  const size = 1 - (1 - SHADOW_MIN_SIZE_FRACTION) * t;
  return {
    x: 0,
    width: (Math.max(0, footprint) + SHADOW_RIM_M) * size,
    depth: SHADOW_DEPTH_M * size,
    alpha: SHADOW_MAX_ALPHA * (1 - t),
  };
}

/**
 * The bottle's outline seen from above and from the side, in meters (y down), for a bottle at
 * (x, y) turned by `angle`: its leftmost and rightmost x and its lowest y.
 */
export function bottleExtent(
  x: number,
  y: number,
  angle: number,
): { left: number; right: number; lowest: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let left = Infinity;
  let right = -Infinity;
  let lowest = -Infinity;
  for (const part of BOTTLE_PARTS) {
    for (const v of part.vertices) {
      const wx = x + v.x * cos - v.y * sin;
      left = Math.min(left, wx);
      right = Math.max(right, wx);
      lowest = Math.max(lowest, y + v.x * sin + v.y * cos);
    }
  }
  return { left, right, lowest };
}

/** The lowest point of the bottle's outline, in meters (y down), for a bottle at (x, y) turned by `angle`. */
export function bottleLowestY(y: number, angle: number): number {
  return bottleExtent(0, y, angle).lowest;
}

/**
 * The shadow of the bottle at the given pose, or null while it is not over the table (its x is
 * outside the tabletop, or it has dropped below the top surface).
 */
export function bottleShadow(pose: { x: number; y: number; angle: number }): Shadow | null {
  if (pose.x < TABLE_LEFT_X || pose.x > TABLE_RIGHT_X) return null;
  const { left, right, lowest } = bottleExtent(pose.x, pose.y, pose.angle);
  const height = TABLE_TOP_Y - lowest;
  if (height < -0.15) return null; // below the tabletop: it fell past the edge
  const shadow = shadowAtHeight(Math.max(0, height), right - left);
  return shadow && { ...shadow, x: (left + right) / 2 };
}
