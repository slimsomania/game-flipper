/**
 * Test data shared by the unit tests (Vitest) and the e2e tests (Playwright). It imports neither
 * runner, so both can load it.
 */
import { drawWaterLevel } from '../src/core/bottle';
import { BOTTLE_BODY_WIDTH } from '../src/core/bottleShape';
import { createRng } from '../src/core/rng';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../src/core/table';
import { DEFAULT_TUNING, type Tuning } from '../src/core/tuning';

/** An upright bottle just above the table (a success) and one lying on its side (a fail). */
export const UPRIGHT = { x: TABLE_CENTER_X, y: TABLE_TOP_Y - 0.05, angle: 0 };
export const SIDE = {
  x: TABLE_CENTER_X,
  y: TABLE_TOP_Y - BOTTLE_BODY_WIDTH / 2 - 0.05,
  angle: Math.PI / 2,
};

/** The water levels a seed hands out, in order: the held bottle's first, then one per bottle. */
export function waterSequence(seed: number, count: number, tuning: Tuning = DEFAULT_TUNING) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => drawWaterLevel(rng, tuning));
}
