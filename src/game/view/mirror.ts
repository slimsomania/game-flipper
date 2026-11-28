import { GAME_WIDTH, PIXELS_PER_METER } from '../../core/constants';

/*
 * Player 2's side is Player 1's seen in a mirror (design section 5): the simulation throws every
 * bottle from the left hand, and only the drawing is mirrored, left to right about the middle of
 * the canvas. A point keeps its height, an angle turns the other way.
 */

/** The mirror image of an x in game pixels. */
export const mirrorX = (x: number): number => GAME_WIDTH - x;

/** The mirror image of an angle in radians. */
export const mirrorAngle = (angle: number): number => -angle;

/** The mirror image of an x in meters. */
export const mirrorMeters = (x: number): number => mirrorX(x * PIXELS_PER_METER) / PIXELS_PER_METER;

/** The pose with its x (meters) and angle mirrored; anything else it carries is kept. */
export function mirrorPose<T extends { x: number; angle: number }>(pose: T): T {
  return { ...pose, x: mirrorMeters(pose.x), angle: mirrorAngle(pose.angle) };
}

/** `pose` as drawn: mirrored for Player 2's throw, itself otherwise. */
export function viewPose<T extends { x: number; angle: number }>(pose: T, mirrored: boolean): T {
  return mirrored ? mirrorPose(pose) : pose;
}
