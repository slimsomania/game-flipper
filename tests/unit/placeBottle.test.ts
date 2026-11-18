import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { UPRIGHT } from '../shared';
import { placed, run } from './helpers';

describe('Simulation.placeBottle', () => {
  it('releases the bottle at exactly the given pose and velocity, as a flight', () => {
    const sim = new Simulation({ seed: 1 });
    const ok = sim.placeBottle({ x: 6, y: 2, angle: 0.7, vx: 1, vy: -2, omega: 3 });
    expect(ok).toBe(true);
    const s = sim.snapshot();
    expect(s.phase).toBe('flying');
    expect(s.outcome).toBeNull();
    expect(s.bottle).toMatchObject({
      x: 6,
      y: 2,
      angle: 0.7,
      vx: 1,
      vy: -2,
      omega: 3,
      awake: true,
    });
    // The bottle is dynamic now: gravity pulls it down.
    const later = run(sim, 10).bottle;
    expect(later.vy).toBeGreaterThan(-2 + 10 * (1 / 60) * 9);
    expect(later.y).toBeGreaterThan(1.5);
  });

  it('defaults the velocities to zero and leaves lastThrow alone', () => {
    const sim = new Simulation({ seed: 1 });
    sim.placeBottle({ x: 6, y: 2, angle: 0 });
    const s = sim.snapshot();
    expect(s.bottle).toMatchObject({ vx: 0, vy: 0, omega: 0 });
    expect(s.lastThrow).toBeNull();
  });

  it('works once: not during a flight, not after a throw, and not with bad numbers', () => {
    const sim = new Simulation({ seed: 1 });
    expect(sim.placeBottle({ x: NaN, y: 2, angle: 0 })).toBe(false);
    expect(sim.placeBottle({ x: 6, y: Infinity, angle: 0 })).toBe(false);
    expect(sim.placeBottle({ x: 6, y: 2, angle: 0, omega: NaN })).toBe(false);
    expect(sim.snapshot().phase).toBe('aiming');
    expect(sim.placeBottle({ x: 6, y: 2, angle: 0 })).toBe(true);
    const before = run(sim, 5);
    expect(sim.placeBottle({ x: 9, y: 1, angle: 1 })).toBe(false);
    expect(sim.throwBottle(50)).toBe(false);
    expect(sim.snapshot()).toEqual(before);

    const thrown = new Simulation({ seed: 1 });
    thrown.throwBottle(50);
    expect(thrown.placeBottle({ x: 6, y: 2, angle: 0 })).toBe(false);
  });

  it('keeps the water level the bottle had in the hand', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.65);
    sim.placeBottle(UPRIGHT);
    expect(sim.snapshot().bottle.water).toBe(0.65);
  });

  it('is deterministic', () => {
    const a = run(placed({ ...UPRIGHT, angle: 0.1, omega: 2, vx: 1 }), 400);
    const b = run(placed({ ...UPRIGHT, angle: 0.1, omega: 2, vx: 1 }), 400);
    expect(a).toEqual(b);
  });
});
