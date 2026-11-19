import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/core/events';
import { DEFAULT_TUNING, resolveTuning } from '../../src/core/tuning';
import {
  BURST_BASE_COUNT,
  BURST_MAX_COUNT,
  BURST_PER_EXTRA_POINT,
  SHAKE_QUIETEST,
  burstCount,
  planEffects,
  shakeIntensity,
} from '../../src/game/effects/effectPlan';
import { OVERSCAN_PX } from '../../src/game/effects/effects';

const T = DEFAULT_TUNING;
const impact = (speed: number, tick = 10): SimEvent => ({ type: 'impact', tick, speed });
const outcome = (result: 'success' | 'fail', points: number, tick = 40): SimEvent => ({
  type: 'outcome',
  tick,
  result,
  reason: result === 'success' ? 'upright' : 'side',
  points,
});

describe('shakeIntensity', () => {
  it('is nothing below the minimum speed (a bottle settling does not shake the screen)', () => {
    expect(shakeIntensity(0, T)).toBe(0);
    expect(shakeIntensity(T.shakeMinSpeed - 0.01, T)).toBe(0);
    expect(shakeIntensity(Number.NaN, T)).toBe(0);
  });

  it('is a fraction of the cap at the minimum speed, and the whole cap at the full speed', () => {
    expect(shakeIntensity(T.shakeMinSpeed, T)).toBeCloseTo(T.shakeMaxPixels * SHAKE_QUIETEST, 9);
    expect(shakeIntensity(T.shakeFullSpeed, T)).toBeCloseTo(T.shakeMaxPixels, 9);
  });

  it('never passes the cap, however hard the hit', () => {
    for (const speed of [T.shakeFullSpeed, 12, 50, 1e6]) {
      expect(shakeIntensity(speed, T)).toBeLessThanOrEqual(T.shakeMaxPixels);
    }
    expect(shakeIntensity(1e6, T)).toBeCloseTo(T.shakeMaxPixels, 9);
  });

  it('grows with the speed: a harder hit shakes more', () => {
    let last = 0;
    for (let speed = T.shakeMinSpeed; speed <= T.shakeFullSpeed; speed += 0.25) {
      const now = shakeIntensity(speed, T);
      expect(now).toBeGreaterThan(last);
      last = now;
    }
    expect(shakeIntensity(6, T)).toBeGreaterThan(shakeIntensity(2, T));
  });

  it('follows the tuning: a different cap, minimum and full speed', () => {
    const tuning = resolveTuning({ shakeMinSpeed: 2, shakeFullSpeed: 4, shakeMaxPixels: 10 });
    expect(shakeIntensity(1.9, tuning)).toBe(0);
    expect(shakeIntensity(4, tuning)).toBeCloseTo(10, 9);
    expect(shakeIntensity(9, tuning)).toBeCloseTo(10, 9);
    expect(shakeIntensity(3, tuning)).toBeCloseTo(
      10 * (SHAKE_QUIETEST + (1 - SHAKE_QUIETEST) / 2),
      9,
    );
  });

  it('copes with a full speed that is not above the minimum', () => {
    const tuning = resolveTuning({ shakeMinSpeed: 3, shakeFullSpeed: 3, shakeMaxPixels: 5 });
    expect(shakeIntensity(2.9, tuning)).toBe(0);
    expect(shakeIntensity(3, tuning)).toBeCloseTo(5, 9);
  });

  it('keeps the default cap inside the overscan the scene draws past the canvas edge', () => {
    expect(T.shakeMaxPixels).toBeGreaterThan(0);
    expect(T.shakeMaxPixels).toBeLessThanOrEqual(OVERSCAN_PX);
  });
});

describe('burstCount', () => {
  it('is the base count for a single flip and grows with each extra point, up to a maximum', () => {
    expect(burstCount(1)).toBe(BURST_BASE_COUNT);
    expect(burstCount(2)).toBe(BURST_BASE_COUNT + BURST_PER_EXTRA_POINT);
    expect(burstCount(3)).toBe(BURST_BASE_COUNT + 2 * BURST_PER_EXTRA_POINT);
    expect(burstCount(50)).toBe(BURST_MAX_COUNT);
  });

  it('is at least the base count, whatever the points', () => {
    expect(burstCount(0)).toBe(BURST_BASE_COUNT);
    expect(burstCount(-3)).toBe(BURST_BASE_COUNT);
  });
});

describe('planEffects', () => {
  it('shakes for a hard impact, with the intensity of its speed and the tick of the event', () => {
    expect(planEffects([impact(6, 33)], T)).toEqual([
      { name: 'shake', intensity: shakeIntensity(6, T), tick: 33 },
    ]);
  });

  it('shakes harder for a harder impact', () => {
    const [soft] = planEffects([impact(2)], T);
    const [hard] = planEffects([impact(7)], T);
    expect(hard.intensity).toBeGreaterThan(soft.intensity);
  });

  it('makes no shake for an impact under the minimum speed', () => {
    expect(planEffects([impact(T.shakeMinSpeed - 0.1)], T)).toEqual([]);
    expect(planEffects([impact(0.05)], T)).toEqual([]);
  });

  it('pops the message and bursts for a success, the burst as big as the flip', () => {
    expect(planEffects([outcome('success', 1)], T)).toEqual([
      { name: 'pop', intensity: 1, tick: 40 },
      { name: 'burst', intensity: burstCount(1), tick: 40 },
    ]);
    const [, burst] = planEffects([outcome('success', 3)], T);
    expect(burst).toEqual({ name: 'burst', intensity: burstCount(3), tick: 40 });
  });

  it('only pops the message for a fail: no burst', () => {
    expect(planEffects([outcome('fail', 0)], T)).toEqual([{ name: 'pop', intensity: 1, tick: 40 }]);
  });

  it('makes nothing for a throw', () => {
    expect(planEffects([{ type: 'throw', tick: 1, power: 50, source: 'keyboard' }], T)).toEqual([]);
  });

  it('keeps the events in order and handles none', () => {
    expect(planEffects([], T)).toEqual([]);
    const names = planEffects(
      [
        { type: 'throw', tick: 1, power: 50, source: 'mouse' },
        impact(5, 20),
        impact(3, 25),
        outcome('success', 1, 80),
      ],
      T,
    ).map((cue) => `${cue.name}@${cue.tick}`);
    expect(names).toEqual(['shake@20', 'shake@25', 'pop@80', 'burst@80']);
  });
});
