import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';

/** F028: a full 5 s throw (300 steps, sloshing on) must be cheap to simulate. */
describe('simulation cost', () => {
  it('300 steps of a throw take under 50 ms (median of 5 runs)', () => {
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const sim = new Simulation({ seed: 1 + run, tuning: { sloshing: 1 } });
      sim.throwBottle(70);
      const start = performance.now();
      for (let i = 0; i < 300; i++) sim.step();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(`simulation 300 steps, ms per run: ${times.map((t) => t.toFixed(2)).join(', ')}`);
    expect(times[2]).toBeLessThan(50);
  });
});
