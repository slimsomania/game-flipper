import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../../src/core/constants';
import { POP_FROM_SCALE, POP_SECONDS, popScale } from '../../src/game/view/resultStyle';

/** The steps the pop lasts. */
const POP_STEPS = Math.round(POP_SECONDS * SIM_HZ);
const scales = Array.from({ length: POP_STEPS }, (_, step) => popScale(step));
const peak = Math.max(...scales);

describe('popScale (the result message popping in)', () => {
  it('starts the message small, at the moment of the outcome', () => {
    expect(popScale(0)).toBe(POP_FROM_SCALE);
    expect(POP_FROM_SCALE).toBeGreaterThan(0);
    expect(POP_FROM_SCALE).toBeLessThan(1);
  });

  it('swells a little past full size, not much', () => {
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.25);
  });

  it('grows every step up to its peak, then comes back down toward full size', () => {
    const peakAt = scales.indexOf(peak);
    for (let step = 1; step <= peakAt; step++) {
      expect(scales[step]).toBeGreaterThan(scales[step - 1]);
    }
    const afterPeak = scales.slice(peakAt);
    for (let i = 1; i < afterPeak.length; i++) {
      expect(afterPeak[i]).toBeLessThanOrEqual(afterPeak[i - 1]);
    }
    expect(afterPeak.every((scale) => scale >= 1)).toBe(true);
    expect(afterPeak[afterPeak.length - 1]).toBeLessThan(peak);
  });

  it('is exactly full size after POP_SECONDS (counted in whole steps), and from then on', () => {
    expect(popScale(POP_STEPS)).toBe(1);
    expect(popScale(POP_STEPS + 1)).toBe(1);
    expect(popScale(60)).toBe(1);
  });

  it('is quick: over within a third of a second', () => {
    expect(POP_SECONDS).toBeLessThanOrEqual(1 / 3);
  });

  it('is full size where there is no result (nothing to pop)', () => {
    expect(popScale(null)).toBe(1);
    expect(popScale(-1)).toBe(1);
  });
});
