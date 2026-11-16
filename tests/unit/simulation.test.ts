import { describe, expect, it } from 'vitest';
import { BOTTLE_HALF_HEIGHT, BOTTLE_HALF_WIDTH, Simulation } from '../../src/core/simulation';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../src/core/table';

function run(sim: Simulation, steps: number): void {
  for (let i = 0; i < steps; i++) sim.step();
}

describe('Simulation (placeholder)', () => {
  it('is deterministic for a given seed', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    run(a, 300);
    run(b, 300);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('starts differently for different seeds', () => {
    const angle1 = new Simulation({ seed: 1 }).snapshot().bottle.angle;
    const angle2 = new Simulation({ seed: 2 }).snapshot().bottle.angle;
    expect(angle1).not.toEqual(angle2);
  });

  it('drops the bottle onto the table, where it comes to rest', () => {
    const sim = new Simulation({ seed: 7 });
    const start = sim.snapshot().bottle;
    run(sim, 600); // 10 simulated seconds
    const end = sim.snapshot();

    expect(end.tick).toBe(600);
    expect(end.bottle.y).toBeGreaterThan(start.y);
    // Resting on one of its faces: the center sits between half its width
    // and half its height above the table top.
    expect(end.bottle.y).toBeLessThanOrEqual(TABLE_TOP_Y - BOTTLE_HALF_WIDTH + 0.05);
    expect(end.bottle.y).toBeGreaterThanOrEqual(TABLE_TOP_Y - BOTTLE_HALF_HEIGHT - 0.05);
    // ...and it stays on the table, between its ends.
    expect(end.bottle.x).toBeGreaterThan(TABLE_LEFT_X);
    expect(end.bottle.x).toBeLessThan(TABLE_RIGHT_X);
    expect(Math.hypot(end.bottle.vx, end.bottle.vy)).toBeLessThan(0.01);
    expect(Math.abs(end.bottle.omega)).toBeLessThan(0.01);
  });
});
