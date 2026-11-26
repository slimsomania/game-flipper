import { beforeAll, describe, expect, it } from 'vitest';
import { findWindows, sweepPowers, widestWindow, type FlipWindow } from '../../src/core/flipWindow';
import { pushTuningFor } from '../../src/core/mouseControl';
import { pushPower } from '../../src/core/push';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { ON_BOTTLE, T0, pushPath } from './mouseHelpers';

/*
 * F045: the finger's own push numbers. The reference phone is 740x360 CSS px with the 1280x720
 * canvas at 0.5 CSS px per game px, and a typical 6-inch phone has about 5.5 CSS px per mm of
 * screen, so 1 mm of finger travel is 11 game px.
 */
const CSS_PX_PER_GAME_PX = 0.5;
const CSS_PX_PER_MM = 5.5;
const GAME_PX_PER_MM = CSS_PX_PER_MM / CSS_PX_PER_GAME_PX;

const TOUCH = pushTuningFor(DEFAULT_TUNING, 'touch');

/** The power of a steady upward push of `mm` of finger travel over `seconds` (default 150 ms). */
function power(mm: number, seconds = 0.15): number {
  return pushPower(pushPath(mm * GAME_PX_PER_MM, seconds, 120), TOUCH);
}

/** The travel in mm, over 150 ms, whose steady push has this power (the power rises with travel). */
function travelFor(target: number): number {
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (power(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Grab and push on a fresh simulation; returns the power thrown with or null. */
function push(
  sim: Simulation,
  mm: number,
  source: 'mouse' | 'touch' = 'touch',
  seconds = 0.15,
): number | null {
  const [first, ...rest] = pushPath(mm * GAME_PX_PER_MM, seconds);
  if (!sim.mouse.grab(ON_BOTTLE.x, first.y, first.t, source)) return null;
  for (const s of rest) sim.mouse.drag(s.y, s.t);
  const last = rest[rest.length - 1];
  return sim.mouse.release(last.t, last.y) ? sim.snapshot().lastThrow!.power : null;
}

describe('the finger push on the reference phone', () => {
  it('the conversion is 11 game px per mm', () => {
    expect(GAME_PX_PER_MM).toBe(11);
  });

  it('a steady upward push over 150 ms first reaches power 100 at 30 to 60 mm', () => {
    const full = travelFor(100 - 1e-6);
    expect(full).toBeGreaterThanOrEqual(30);
    expect(full).toBeLessThanOrEqual(60);
    expect(power(full + 0.5)).toBe(100);
  });

  it('2 mm gives a power under 8', () => {
    expect(power(2)).toBeLessThan(8);
  });

  it('the power never falls as the travel grows', () => {
    let last = 0;
    for (let mm = 0; mm <= 70; mm += 1) {
      const p = power(mm);
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      last = p;
    }
  });
});

describe('grabbing and jitter with a finger', () => {
  it('a slow 2 mm movement (longer than the tap time) throws nothing', () => {
    for (const seconds of [0.35, 0.5, 1]) {
      const sim = new Simulation({ seed: 7 });
      expect(push(sim, 2, 'touch', seconds), `${seconds} s`).toBeNull();
      expect(sim.snapshot().lastThrow).toBeNull();
      expect(sim.snapshot().phase).toBe('aiming');
    }
  });

  // F048: before it, this threw nothing; now a quick still touch is a tap at the bar's power.
  it('at most 2 mm of upward jitter is never a push, at any speed; lifted quickly it is a tap', () => {
    for (const seconds of [0.01, 0.02, 0.05, 0.1, 0.15, 0.25]) {
      for (const mm of [0.5, 1, 2]) {
        expect(pushPower(pushPath(mm * GAME_PX_PER_MM, seconds, 240), TOUCH)).toBeLessThan(
          DEFAULT_TUNING.touchMinPower,
        );
        const sim = new Simulation({ seed: 7 });
        const bar = sim.powerMeter.value;
        expect(push(sim, mm, 'touch', seconds), `${mm} mm in ${seconds} s`).toBe(bar);
        expect(sim.snapshot().lastThrow).toMatchObject({ source: 'tap', power: bar });
      }
    }
  });

  it('a push of 10 mm over 150 ms does throw with a finger', () => {
    const sim = new Simulation({ seed: 7 });
    expect(push(sim, 10)).toBeGreaterThanOrEqual(DEFAULT_TUNING.touchMinPower);
  });

  it('touchGrabPadding lets a touch up to 4 mm outside the bottle grab it, and the mouse not', () => {
    const sim = new Simulation({ seed: 7 });
    const bottleRight = ON_BOTTLE.x + 40; // the box is 80 px wide
    const outside = (mm: number) => bottleRight + mm * GAME_PX_PER_MM;
    expect(sim.mouse.canGrab(outside(4), ON_BOTTLE.y, 'touch')).toBe(true);
    expect(sim.mouse.canGrab(outside(4.5), ON_BOTTLE.y, 'touch')).toBe(false);
    expect(sim.mouse.canGrab(outside(4), ON_BOTTLE.y, 'mouse')).toBe(false);
    expect(sim.mouse.canGrab(outside(4), ON_BOTTLE.y)).toBe(false);
    expect(sim.mouse.grab(outside(4), ON_BOTTLE.y, T0, 'touch')).toBe(true);
  });
});

describe('touch fields change only touch pushes', () => {
  it('the mouse’s numbers are the old ones', () => {
    expect(DEFAULT_TUNING).toMatchObject({
      pushFullDistance: 300,
      pushFullSpeed: 2000,
      pushMinPower: 1,
      grabPadding: 12,
    });
    expect(pushTuningFor(DEFAULT_TUNING, 'mouse')).toBe(DEFAULT_TUNING);
  });

  it('changing every touch field changes no mouse push or mouse grab', () => {
    const changed = {
      touchFullDistance: 90,
      touchFullSpeed: 900,
      touchMinPower: 50,
      touchGrabPadding: 1,
    };
    for (const mm of [3, 10, 25, 40]) {
      const a = new Simulation({ seed: 7 });
      const b = new Simulation({ seed: 7, tuning: changed });
      expect(push(b, mm, 'mouse')).toBe(push(a, mm, 'mouse'));
    }
    const b = new Simulation({ seed: 7, tuning: changed });
    expect(b.mouse.canGrab(ON_BOTTLE.x + 40 + 12, ON_BOTTLE.y)).toBe(true);
    expect(b.mouse.canGrab(ON_BOTTLE.x + 40 + 13, ON_BOTTLE.y)).toBe(false);
  });

  it('changing a mouse push field changes no touch push, and a touch field changes the touch', () => {
    const base = push(new Simulation({ seed: 7 }), 10, 'touch');
    const mouseChanged = new Simulation({
      seed: 7,
      tuning: { pushFullDistance: 50, pushFullSpeed: 500, pushMinPower: 90, grabPadding: 0 },
    });
    expect(push(mouseChanged, 10, 'touch')).toBe(base);
    const touchChanged = new Simulation({ seed: 7, tuning: { touchFullDistance: 100 } });
    expect(push(touchChanged, 10, 'touch')).toBeGreaterThan(base!);
  });
});

describe('the single-flip windows in finger travel', () => {
  const windows: { water: number; single: FlipWindow }[] = [];
  beforeAll(() => {
    const steps = Math.round(
      (DEFAULT_TUNING.waterMax - DEFAULT_TUNING.waterMin) / DEFAULT_TUNING.waterStep,
    );
    for (let i = 0; i <= steps; i++) {
      const water =
        Math.round((DEFAULT_TUNING.waterMin + i * DEFAULT_TUNING.waterStep) * 1e6) / 1e6;
      const single = widestWindow(findWindows(sweepPowers(water)), 1);
      expect(single, `a window at ${water}`).not.toBeNull();
      windows.push({ water, single: single! });
    }
  }, 120_000);

  it('every water level’s window spans at least 3 mm of steady-push travel', () => {
    expect(windows).toHaveLength(17);
    for (const { water, single } of windows) {
      // The window holds the whole powers low..high, so it spans from low - 0.5 to high + 0.5.
      const span = travelFor(single.high + 0.5) - travelFor(single.low - 0.5);
      expect(span, `${Math.round(water * 100)}% water`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every window center is reachable by a push under full power', () => {
    for (const { water, single } of windows) {
      const mm = travelFor(single.center);
      expect(mm, `${Math.round(water * 100)}% water`).toBeLessThan(travelFor(100 - 1e-6));
      expect(mm).toBeGreaterThan(2);
    }
  });
});
