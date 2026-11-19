import { describe, expect, it } from 'vitest';
import { ShakeEffect, shakeOffset } from '../../src/game/effects/shake';

const TOTAL = 15; // a quarter of a second of steps

describe('shakeOffset', () => {
  it('is at rest (exactly 0, 0) with no intensity, before the shake starts, and from its end on', () => {
    expect(shakeOffset(0, 3, TOTAL)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(-2, 3, TOTAL)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(5, -1, TOTAL)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(5, TOTAL, TOTAL)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(5, TOTAL + 100, TOTAL)).toEqual({ x: 0, y: 0 });
  });

  it('moves the picture while it lasts, and never past the intensity on either axis', () => {
    let moved = 0;
    for (const intensity of [1, 2.5, 6]) {
      for (let age = 0; age < TOTAL; age++) {
        const { x, y } = shakeOffset(intensity, age, TOTAL);
        expect(Math.abs(x)).toBeLessThanOrEqual(intensity);
        expect(Math.abs(y)).toBeLessThanOrEqual(intensity);
        if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01) moved++;
      }
    }
    expect(moved).toBeGreaterThan(30);
  });

  it('is the same every time (no randomness)', () => {
    expect(shakeOffset(4, 6, TOTAL)).toEqual(shakeOffset(4, 6, TOTAL));
  });

  it('dies away: the swings of the last steps are smaller than those of the first', () => {
    const swing = (from: number, to: number): number => {
      let largest = 0;
      for (let age = from; age < to; age++) {
        const { x, y } = shakeOffset(6, age, TOTAL);
        largest = Math.max(largest, Math.abs(x), Math.abs(y));
      }
      return largest;
    };
    expect(swing(0, 5)).toBeGreaterThan(swing(TOTAL - 5, TOTAL));
    expect(swing(TOTAL - 2, TOTAL)).toBeLessThan(1);
  });

  it('is bigger for a bigger intensity (twice the intensity, twice the offset)', () => {
    const small = shakeOffset(2, 4, TOTAL);
    const big = shakeOffset(4, 4, TOTAL);
    expect(big.x).toBeCloseTo(2 * small.x, 9);
    expect(big.y).toBeCloseTo(2 * small.y, 9);
  });
});

describe('ShakeEffect', () => {
  it('is at rest until a shake is triggered', () => {
    expect(new ShakeEffect().offset(100)).toEqual({ x: 0, y: 0 });
  });

  it('shakes after a trigger and is back at rest once its seconds are up', () => {
    const shake = new ShakeEffect();
    shake.trigger(100, 6, 0.25);
    const moving = [1, 2, 3, 4, 5].map((age) => shake.offset(100 + age));
    expect(moving.some((o) => Math.abs(o.x) > 0.1 || Math.abs(o.y) > 0.1)).toBe(true);
    expect(shake.offset(100 + 15)).toEqual({ x: 0, y: 0 });
    expect(shake.offset(100 + 16)).toEqual({ x: 0, y: 0 });
  });

  it('reads the same offset as the pure function for the tick it is asked about', () => {
    const shake = new ShakeEffect();
    shake.trigger(50, 4, 0.25);
    expect(shake.offset(57)).toEqual(shakeOffset(4, 7, 15));
  });

  it('ignores a trigger with nothing to shake', () => {
    const shake = new ShakeEffect();
    shake.trigger(10, 0, 0.25);
    shake.trigger(10, -3, 0.25);
    shake.trigger(10, Number.NaN, 0.25);
    expect(shake.offset(11)).toEqual({ x: 0, y: 0 });
  });

  it('lets a harder impact take over from a weaker shake', () => {
    const shake = new ShakeEffect();
    shake.trigger(0, 2, 0.25);
    shake.trigger(2, 6, 0.25);
    expect(shake.offset(4)).toEqual(shakeOffset(6, 2, 15));
  });

  it('keeps a stronger shake still in progress when a softer one comes', () => {
    const shake = new ShakeEffect();
    shake.trigger(0, 6, 0.25);
    shake.trigger(3, 1, 0.25);
    expect(shake.offset(5)).toEqual(shakeOffset(6, 5, 15));
  });

  it('starts a soft shake once the stronger one has died down below it', () => {
    const shake = new ShakeEffect();
    shake.trigger(0, 6, 0.25);
    shake.trigger(14, 2, 0.25); // the first has 6 / 15 left by now
    expect(shake.offset(16)).toEqual(shakeOffset(2, 2, 15));
  });

  it('stops at once on clear', () => {
    const shake = new ShakeEffect();
    shake.trigger(0, 6, 0.25);
    shake.clear();
    expect(shake.offset(2)).toEqual({ x: 0, y: 0 });
  });
});
