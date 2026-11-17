import { describe, expect, it } from 'vitest';
import { MAX_POWER, spinFraction } from '../../src/core/throw';
import { DEFAULT_TUNING } from '../../src/core/tuning';

/*
 * The spin curve (F009): the share of the full angular impulse that a throw at a given power
 * applies. It is the one place where power is not simply proportional to an impulse, so its
 * end points and its shape are locked here.
 */

const SHAPES = [
  {
    throwSpinExponent: DEFAULT_TUNING.throwSpinExponent,
    throwSpinGrowth: DEFAULT_TUNING.throwSpinGrowth,
  },
  { throwSpinExponent: 1, throwSpinGrowth: 0 },
  { throwSpinExponent: 0.35, throwSpinGrowth: 0.013 },
  { throwSpinExponent: 2, throwSpinGrowth: 0 },
  { throwSpinExponent: 0.1, throwSpinGrowth: 0.03 },
];

describe('spinFraction', () => {
  it('is 0 at power 0 and 1 at power 100 for every curve shape', () => {
    for (const shape of SHAPES) {
      expect(spinFraction(0, shape), JSON.stringify(shape)).toBe(0);
      expect(spinFraction(MAX_POWER, shape), JSON.stringify(shape)).toBeCloseTo(1, 12);
    }
  });

  it('never goes down as the power goes up', () => {
    for (const shape of SHAPES) {
      let last = -1;
      for (let power = 0; power <= MAX_POWER; power++) {
        const fraction = spinFraction(power, shape);
        expect(fraction, `${JSON.stringify(shape)} at power ${power}`).toBeGreaterThanOrEqual(last);
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1 + 1e-12);
        last = fraction;
      }
    }
  });

  it('follows (p/100)^exponent * exp(growth * (p - 100))', () => {
    const shape = { throwSpinExponent: 0.5, throwSpinGrowth: 0.01 };
    expect(spinFraction(25, shape)).toBeCloseTo(Math.sqrt(0.25) * Math.exp(-0.75), 12);
    expect(spinFraction(64, shape)).toBeCloseTo(0.8 * Math.exp(-0.36), 12);
  });

  it('is a straight line with exponent 1 and growth 0', () => {
    const line = { throwSpinExponent: 1, throwSpinGrowth: 0 };
    for (const power of [1, 10, 33.3, 50, 99]) {
      expect(spinFraction(power, line)).toBeCloseTo(power / MAX_POWER, 12);
    }
  });

  it('gives more spin early with a smaller exponent, and less in the middle with more growth', () => {
    const line = { throwSpinExponent: 1, throwSpinGrowth: 0 };
    expect(spinFraction(20, { ...line, throwSpinExponent: 0.5 })).toBeGreaterThan(
      spinFraction(20, line),
    );
    expect(spinFraction(60, { ...line, throwSpinGrowth: 0.02 })).toBeLessThan(
      spinFraction(60, line),
    );
  });

  it('clamps the power to 0..100', () => {
    for (const shape of SHAPES) {
      expect(spinFraction(-20, shape)).toBe(0);
      expect(spinFraction(250, shape)).toBeCloseTo(1, 12);
      expect(spinFraction(Infinity, shape)).toBeCloseTo(1, 12);
    }
  });
});
