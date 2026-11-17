/** Helpers for the unit tests of the mouse push: pointer paths and playing them into a Simulation. */
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { BOTTLE_BODY_WIDTH, BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { PIXELS_PER_METER } from '../../src/core/constants';
import type { PushSample } from '../../src/core/push';
import type { Simulation } from '../../src/core/simulation';

/** The middle of the held bottle, in logical game pixels. */
export const ON_BOTTLE = {
  x: HAND_X * PIXELS_PER_METER,
  y: HAND_Y * PIXELS_PER_METER - (BOTTLE_HEIGHT * PIXELS_PER_METER) / 2,
};

/** Half the bottle's width and its height, in pixels, for the hit-box tests. */
export const BOTTLE_HALF_WIDTH_PX = (BOTTLE_BODY_WIDTH * PIXELS_PER_METER) / 2;
export const BOTTLE_HEIGHT_PX = BOTTLE_HEIGHT * PIXELS_PER_METER;

/** When a test's pointer events start, in seconds (any value: only differences matter). */
export const T0 = 10;

/**
 * The pointer samples of a push: pressed at `T0` on the bottle, then rising `rise` pixels in a
 * straight line over `seconds`, sampled at `hz`. The first sample is the press.
 */
export function pushPath(
  rise: number,
  seconds: number,
  hz = 60,
  startY = ON_BOTTLE.y,
): PushSample[] {
  const count = Math.max(1, Math.round(seconds * hz));
  const samples: PushSample[] = [];
  for (let i = 0; i <= count; i++) {
    samples.push({ t: T0 + (i * seconds) / count, y: startY - (rise * i) / count });
  }
  return samples;
}

/** Press at the first sample (on the bottle) and move through the rest. Returns whether it grabbed. */
export function playDrag(
  sim: Simulation,
  samples: readonly PushSample[],
  x = ON_BOTTLE.x,
): boolean {
  const [first, ...rest] = samples;
  const grabbed = sim.mouse.grab(x, first.y, first.t);
  for (const sample of rest) sim.mouse.drag(sample.y, sample.t);
  return grabbed;
}

/** Play a whole push and let go at its last sample. Returns the power it threw with, or null. */
export function mousePush(sim: Simulation, samples: readonly PushSample[]): number | null {
  playDrag(sim, samples);
  const last = samples[samples.length - 1];
  return sim.mouse.release(last.t, last.y) ? sim.snapshot().lastThrow!.power : null;
}
