import type { Tuning } from './tuning';
import { clampPower } from './throw';

/*
 * What a finger that pressed the bottle turns out to be (F048), and where on the power bar a finger
 * is. Pure rules: the scene only feeds pointer samples. A touch that lifts quickly after almost no
 * movement is a tap (it throws at the bar's power); one that moved further is a push (judged by
 * `pushPower`, as ever); one that stayed put but was held too long is neither.
 */

/** Rounding slack, in game px, so a movement of exactly the limit stays a tap whatever the scale. */
const MOVE_EPSILON = 1e-3;

/** What a lifted touch on the bottle was. */
export type TouchKind = 'tap' | 'push' | 'none';

/** The numbers the tap rule reads. */
export type TapTuning = Pick<Tuning, 'touchTapMaxMs' | 'touchTapMaxMove'>;

/**
 * Judge a touch that began on the bottle: `heldSeconds` from press to lift, `moved` the farthest
 * the finger got from where it pressed, in logical game pixels (any direction). More movement than
 * `touchTapMaxMove` is a push, however long or short; otherwise a lift within `touchTapMaxMs` is a
 * tap and a later one is neither. Values that aren't numbers give `'none'`.
 */
export function classifyTouch(heldSeconds: number, moved: number, tuning: TapTuning): TouchKind {
  if (!Number.isFinite(heldSeconds) || !Number.isFinite(moved)) return 'none';
  if (moved > tuning.touchTapMaxMove + MOVE_EPSILON) return 'push';
  return heldSeconds * 1000 <= tuning.touchTapMaxMs ? 'tap' : 'none';
}

/**
 * The power a finger at height `y` sets on a bar whose bottom is at `barBottom` and top at `barTop`
 * (logical game pixels, y down): 0 at the bottom, 100 at the top, clamped outside, a whole number.
 */
export function powerFromBar(y: number, barTop: number, barBottom: number): number {
  const span = barBottom - barTop;
  if (!Number.isFinite(y) || !(span > 0)) return 0;
  return Math.round(clampPower(((barBottom - y) / span) * 100));
}
