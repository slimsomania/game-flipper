import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING, resolveTuning } from '../../src/core/tuning';
import { waterSequence } from '../shared';

describe('water level tuning', () => {
  it('defaults to 10% to 90% in 5% steps', () => {
    expect(DEFAULT_TUNING.waterMin).toBe(0.1);
    expect(DEFAULT_TUNING.waterMax).toBe(0.9);
    expect(DEFAULT_TUNING.waterStep).toBe(0.05);
  });

  it('resolveTuning applies overrides on top of the defaults', () => {
    const tuning = resolveTuning({ waterMax: 0.5 });
    expect(tuning.waterMax).toBe(0.5);
    expect(tuning.waterMin).toBe(DEFAULT_TUNING.waterMin);
  });
});

describe('drawWaterLevel', () => {
  it('stays within the tuning range and on a step, for many seeds', () => {
    const { waterMin, waterMax, waterStep } = DEFAULT_TUNING;
    for (let seed = 1; seed <= 30; seed++) {
      for (const level of waterSequence(seed, 100)) {
        expect(level).toBeGreaterThanOrEqual(waterMin);
        expect(level).toBeLessThanOrEqual(waterMax);
        const steps = (level - waterMin) / waterStep;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      }
    }
  });

  it('returns clean numbers, not floating-point noise like 0.15000000000000002', () => {
    for (const level of waterSequence(3, 500)) expect(level).toBe(Number(level.toFixed(2)));
  });

  it('reaches every step, including both ends of the range', () => {
    const seen = new Set(waterSequence(11, 2000));
    expect(seen.size).toBe(17); // 0.10, 0.15, ... 0.90
    expect(Math.min(...seen)).toBe(0.1);
    expect(Math.max(...seen)).toBe(0.9);
  });

  it('gives the same sequence for the same seed', () => {
    expect(waterSequence(42, 50)).toEqual(waterSequence(42, 50));
  });

  it('gives different sequences for different seeds', () => {
    expect(waterSequence(1, 50)).not.toEqual(waterSequence(2, 50));
    expect(waterSequence(2, 50)).not.toEqual(waterSequence(3, 50));
    expect(waterSequence(1, 50)).not.toEqual(waterSequence(3, 50));
  });

  it('follows a custom range and step', () => {
    const tuning = resolveTuning({ waterMin: 0.2, waterMax: 0.6, waterStep: 0.1 });
    expect(new Set(waterSequence(5, 500, tuning))).toEqual(new Set([0.2, 0.3, 0.4, 0.5, 0.6]));
  });

  it('always returns the single value when min equals max', () => {
    const tuning = resolveTuning({ waterMin: 0.4, waterMax: 0.4 });
    expect(new Set(waterSequence(5, 20, tuning))).toEqual(new Set([0.4]));
  });
});

describe('the simulation draws its bottles from the seeded RNG', () => {
  it('starts the first bottle with the first level of the seed’s sequence', () => {
    for (const seed of [1, 7, 99]) {
      expect(new Simulation({ seed }).snapshot().bottle.water).toBe(waterSequence(seed, 1)[0]);
    }
  });

  it('starts with the same level for the same seed and varies across seeds', () => {
    expect(new Simulation({ seed: 8 }).snapshot().bottle.water).toBe(
      new Simulation({ seed: 8 }).snapshot().bottle.water,
    );
    const levels = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      levels.add(new Simulation({ seed }).snapshot().bottle.water);
    }
    expect(levels.size).toBeGreaterThan(5);
  });

  it('uses the tuning range it is given', () => {
    const tuning = { waterMin: 0.3, waterMax: 0.3 };
    expect(new Simulation({ seed: 4, tuning }).snapshot().bottle.water).toBe(0.3);
  });
});
