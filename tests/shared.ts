/**
 * Test data shared by the unit tests (Vitest) and the e2e tests (Playwright). It imports neither
 * runner, so both can load it.
 */
import { drawWaterLevel } from '../src/core/bottle';
import { BOTTLE_BODY_WIDTH } from '../src/core/bottleShape';
import { createRng } from '../src/core/rng';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../src/core/table';
import { DEFAULT_TUNING, type Tuning } from '../src/core/tuning';

/** A pose for `placeBottle`: `turns` is the rotation the judge counts as already made. */
export interface PlacedPose {
  x: number;
  y: number;
  angle: number;
  turns?: number;
}

/**
 * An upright bottle just above the table with no turns credited: it drops, stands and is a "no
 * flip" fail (a landing needs a full turn). `FLIPPED` is the same bottle credited one turn: a
 * single flip, a success worth 1 point. `flipped(n)` credits `n` turns.
 */
export const UPRIGHT: PlacedPose = { x: TABLE_CENTER_X, y: TABLE_TOP_Y - 0.05, angle: 0 };
export const flipped = (turns: number): PlacedPose => ({ ...UPRIGHT, turns });
export const FLIPPED = flipped(1);
/** A bottle lying on its side (a fail, whatever the turns). */
export const SIDE: PlacedPose = {
  x: TABLE_CENTER_X,
  y: TABLE_TOP_Y - BOTTLE_BODY_WIDTH / 2 - 0.05,
  angle: Math.PI / 2,
};

/** The water levels a seed hands out, in order: the held bottle's first, then one per bottle. */
export function waterSequence(seed: number, count: number, tuning: Tuning = DEFAULT_TUNING) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => drawWaterLevel(rng, tuning));
}
