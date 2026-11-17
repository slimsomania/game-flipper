import { describe, expect, it } from 'vitest';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import {
  LastThrowTracker,
  NO_THROW,
  measureFlipWindows,
  waterText,
  windowText,
  windowsReadout,
} from '../../src/debug/tuningReadout';
import { FLIPPED } from '../shared';
import { runToOutcome } from './helpers';

describe('waterText', () => {
  it('shows a level as a clean percentage', () => {
    expect(waterText(0.5)).toBe('50%');
    expect(waterText(0.15)).toBe('15%');
    expect(waterText(0.1 + 0.2)).toBe('30%');
    expect(waterText(0.125)).toBe('12.5%');
    expect(waterText(0)).toBe('0%');
    expect(waterText(1)).toBe('100%');
  });
});

describe('LastThrowTracker', () => {
  it('says there was no throw before the first one', () => {
    const tracker = new LastThrowTracker();
    expect(tracker.read(new Simulation({ seed: 1 }).snapshot())).toEqual(NO_THROW);
  });

  it('shows a bottle in the air with its water and power, and no outcome yet', () => {
    const sim = new Simulation({ seed: 1, lockedWater: 0.5 });
    const tracker = new LastThrowTracker();
    sim.throwBottle(44);
    sim.step();
    expect(tracker.read(sim.snapshot())).toEqual({
      water: '50%',
      power: '44',
      outcome: 'in the air',
      turns: '-',
      rotation: '-',
    });
  });

  it('shows the outcome and the turns of a decided throw, taken from the outcome itself', () => {
    const sim = new Simulation({ seed: 1, lockedWater: 0.5 });
    const tracker = new LastThrowTracker();
    sim.throwBottle(44);
    runToOutcome(sim);
    const { outcome } = sim.snapshot();
    const readout = tracker.read(sim.snapshot());
    expect(readout.water).toBe('50%');
    expect(readout.power).toBe('44');
    expect(readout.outcome).toBe(`${outcome!.result} (${outcome!.reason})`);
    expect(readout.turns).toBe(String(outcome!.turns));
    expect(readout.rotation).toBe(String(Number((outcome!.rotation / (2 * Math.PI)).toFixed(2))));
    expect(Math.abs(Number(readout.rotation) - outcome!.turns)).toBeLessThan(0.5);
  });

  it('keeps showing the decided throw after the next bottle appears (the outcome is gone then)', () => {
    const sim = new Simulation({ seed: 1, lockedWater: 0.5 });
    const tracker = new LastThrowTracker();
    sim.throwBottle(44);
    runToOutcome(sim);
    const decided = tracker.read(sim.snapshot());
    sim.skip();
    expect(sim.snapshot().outcome).toBeNull();
    expect(tracker.read(sim.snapshot())).toEqual(decided);
  });

  it('replaces it when the next throw is decided, not before', () => {
    const sim = new Simulation({ seed: 1, lockedWater: 0.5 });
    const tracker = new LastThrowTracker();
    sim.throwBottle(44);
    runToOutcome(sim);
    sim.skip();
    tracker.read(sim.snapshot());
    sim.setWater(0.9);
    sim.throwBottle(10);
    expect(tracker.read(sim.snapshot()).outcome).toBe('in the air');
    runToOutcome(sim);
    const readout = tracker.read(sim.snapshot());
    expect(readout.water).toBe('90%');
    expect(readout.power).toBe('10');
  });

  it('forgets when a new game starts (the tick goes back)', () => {
    const tracker = new LastThrowTracker();
    const first = new Simulation({ seed: 1 });
    first.throwBottle(44);
    runToOutcome(first);
    expect(tracker.read(first.snapshot())).not.toEqual(NO_THROW);
    expect(tracker.read(new Simulation({ seed: 2 }).snapshot())).toEqual(NO_THROW);
  });

  it('has no power for a bottle that was placed rather than thrown', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.5);
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    const readout = new LastThrowTracker().read(sim.snapshot());
    expect(readout.power).toBe('-');
    expect(readout.water).toBe('50%');
    expect(readout.outcome).toBe('success (upright)');
    expect(readout.turns).toBe('1');
  });
});

describe('the flip window readout', () => {
  it('writes a window as its powers, center and width, or "none"', () => {
    expect(
      windowText('single flip', { turns: 1, low: 36, high: 51, center: 43.5, width: 15 }),
    ).toBe('single flip: power 36 to 51 (center 43.5, width 15)');
    expect(windowText('double flip', null)).toBe('double flip: none');
  });

  it('writes the water level and a line for the single and the double flip', () => {
    const single = { turns: 1, low: 36, high: 51, center: 43.5, width: 15 };
    expect(windowsReadout(0.5, { single, double: null })).toBe(
      'Water 50%\nsingle flip: power 36 to 51 (center 43.5, width 15)\ndouble flip: none',
    );
  });

  it('measures through flipWindow.ts: the same windows as a sweep of the same bottle', () => {
    const tuning = { ...DEFAULT_TUNING, throwLinearImpulse: 10 };
    const windows = findWindows(sweepPowers(0.5, tuning));
    expect(measureFlipWindows(0.5, tuning)).toEqual({
      single: widestWindow(windows, 1),
      double: widestWindow(windows, 2),
    });
  });

  it('finds the single flip window of a default bottle, and a stronger spin moves it', () => {
    const { single } = measureFlipWindows(0.5, DEFAULT_TUNING);
    expect(single).not.toBeNull();
    const spun = measureFlipWindows(0.5, { ...DEFAULT_TUNING, throwAngularImpulse: 8 });
    expect(spun.single === null || spun.single.low !== single!.low).toBe(true);
  });
});
