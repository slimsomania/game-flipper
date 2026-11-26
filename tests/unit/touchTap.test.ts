import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { classifyTouch, powerFromBar } from '../../src/core/touchTap';
import { ON_BOTTLE, T0 } from './mouseHelpers';

const MS = DEFAULT_TUNING.touchTapMaxMs / 1000;
const MOVE = DEFAULT_TUNING.touchTapMaxMove;

describe('the tap rule (F048)', () => {
  it('a quick touch that barely moved is a tap', () => {
    expect(classifyTouch(0.05, 0, DEFAULT_TUNING)).toBe('tap');
    expect(classifyTouch(MS, MOVE, DEFAULT_TUNING)).toBe('tap');
  });

  it('a touch that moved more than the limit is a push, quick or slow, and never a tap', () => {
    expect(classifyTouch(0.05, MOVE + 0.1, DEFAULT_TUNING)).toBe('push');
    expect(classifyTouch(2, MOVE + 0.1, DEFAULT_TUNING)).toBe('push');
  });

  it('a touch held longer than the tap time without moving is neither', () => {
    expect(classifyTouch(MS + 0.01, 0, DEFAULT_TUNING)).toBe('none');
    expect(classifyTouch(MS + 0.01, MOVE, DEFAULT_TUNING)).toBe('none');
  });

  it('numbers that are not numbers are neither', () => {
    expect(classifyTouch(Number.NaN, 0, DEFAULT_TUNING)).toBe('none');
    expect(classifyTouch(0.1, Number.NaN, DEFAULT_TUNING)).toBe('none');
  });

  it('the limits are read from the tuning', () => {
    const tuning = { touchTapMaxMs: 100, touchTapMaxMove: 5 };
    expect(classifyTouch(0.1, 5, tuning)).toBe('tap');
    expect(classifyTouch(0.11, 5, tuning)).toBe('none');
    expect(classifyTouch(0.05, 6, tuning)).toBe('push');
  });
});

describe('a tap on the held bottle', () => {
  it('throws at the bar power with source tap, like Space does', () => {
    const tap = new Simulation({ seed: 7 });
    tap.powerMeter.set(62);
    expect(tap.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0, 'touch')).toBe(true);
    expect(tap.powerMeter.value).toBe(62); // the bar doesn't jump while the finger is down
    expect(tap.mouse.release(T0 + 0.1, ON_BOTTLE.y, ON_BOTTLE.x)).toBe(true);
    expect(tap.snapshot().lastThrow).toMatchObject({ power: 62, source: 'tap' });

    const space = new Simulation({ seed: 7 });
    space.powerMeter.set(62);
    space.throwOrSkip();
    for (let i = 0; i < 600; i++) {
      tap.step();
      space.step();
    }
    expect(tap.snapshot().outcome).toEqual(space.snapshot().outcome);
    expect(tap.snapshot().bottle).toEqual(space.snapshot().bottle);
  });

  it('a finger that slid sideways past the limit is a push, not a tap', () => {
    const sim = new Simulation({ seed: 7 });
    sim.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0, 'touch');
    sim.mouse.drag(ON_BOTTLE.y, T0 + 0.05, ON_BOTTLE.x + 40);
    expect(sim.mouse.release(T0 + 0.1, ON_BOTTLE.y, ON_BOTTLE.x + 40)).toBe(false);
    expect(sim.snapshot().lastThrow).toBeNull();
  });

  it('a mouse click on the bottle is not a tap', () => {
    const sim = new Simulation({ seed: 7 });
    sim.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0, 'mouse');
    expect(sim.mouse.release(T0 + 0.05, ON_BOTTLE.y, ON_BOTTLE.x)).toBe(false);
    expect(sim.snapshot().lastThrow).toBeNull();
  });
});

describe('the bar mapping', () => {
  it('bottom 0, top 100, middle 50', () => {
    expect(powerFromBar(300, 100, 300)).toBe(0);
    expect(powerFromBar(100, 100, 300)).toBe(100);
    expect(powerFromBar(200, 100, 300)).toBe(50);
    expect(powerFromBar(150, 100, 300)).toBe(75);
  });

  it('clamps above and below, and gives whole numbers', () => {
    expect(powerFromBar(-500, 100, 300)).toBe(100);
    expect(powerFromBar(900, 100, 300)).toBe(0);
    for (let y = 90; y < 310; y += 0.7) {
      const p = powerFromBar(y, 100, 300);
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});
