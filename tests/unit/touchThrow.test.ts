import { describe, expect, it } from 'vitest';
import { pushPower } from '../../src/core/push';
import { Simulation } from '../../src/core/simulation';
import { run } from './helpers';
import { ON_BOTTLE, pushPath } from './mouseHelpers';

// F037: a finger on the held bottle is the same grab, push and throw as the mouse (D25), with the
// source recorded as `touch`.

/** Press, move and let go with the given kind of pointer. Returns the power thrown with, or null. */
function push(
  sim: Simulation,
  source: 'mouse' | 'touch',
  rise = 100,
  seconds = 0.1,
): number | null {
  const [first, ...rest] = pushPath(rise, seconds);
  expect(sim.mouse.grab(ON_BOTTLE.x, first.y, first.t, source)).toBe(true);
  for (const sample of rest) sim.mouse.drag(sample.y, sample.t);
  const last = rest[rest.length - 1];
  return sim.mouse.release(last.t, last.y) ? sim.snapshot().lastThrow!.power : null;
}

describe('a finger on the held bottle', () => {
  it('throws with source touch and the push’s power', () => {
    const sim = new Simulation({ seed: 7 });
    const water = sim.snapshot().bottle.water;
    const power = push(sim, 'touch');
    expect(power).toBe(pushPower(pushPath(100, 0.1)));
    expect(power).toBeGreaterThan(0);
    expect(sim.snapshot().lastThrow).toEqual({ power, water, source: 'touch' });
  });

  it('gives a mouse push and a touch push with the same samples the same power', () => {
    for (const [rise, seconds] of [
      [100, 0.1],
      [250, 0.2],
      [40, 0.4],
    ]) {
      expect(push(new Simulation({ seed: 7 }), 'touch', rise, seconds)).toBe(
        push(new Simulation({ seed: 7 }), 'mouse', rise, seconds),
      );
    }
  });

  it('a touch throw and a keyboard throw with the same power, water and seed fly identically', () => {
    const touch = new Simulation({ seed: 3 });
    const power = push(touch, 'touch')!;
    const keyboard = new Simulation({ seed: 3 });
    keyboard.throwBottle(power);
    for (let i = 0; i < 240; i++) {
      run(touch, 1);
      run(keyboard, 1);
      expect(touch.snapshot().bottle).toEqual(keyboard.snapshot().bottle);
    }
    expect(touch.snapshot().outcome).toEqual(keyboard.snapshot().outcome);
  });

  it('a touch that never moves throws nothing, and the next mouse grab records mouse', () => {
    const sim = new Simulation({ seed: 7 });
    expect(sim.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, 10, 'touch')).toBe(true);
    expect(sim.mouse.release(10.1, ON_BOTTLE.y)).toBe(false);
    expect(sim.snapshot().lastThrow).toBeNull();
    push(sim, 'mouse');
    expect(sim.snapshot().lastThrow!.source).toBe('mouse');
  });
});
