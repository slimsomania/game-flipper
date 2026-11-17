import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { SIDE, UPRIGHT, waterSequence } from '../shared';
import { RESULT_STEPS, expectHeld, judged, run, runToOutcome } from './helpers';

describe('the result delay', () => {
  it('comes from the tuning: 1.5 s by default, and a different value changes the wait', () => {
    expect(DEFAULT_TUNING.resultDelaySeconds).toBe(1.5);
    const sim = judged(UPRIGHT, { tuning: { resultDelaySeconds: 0.5 } });
    run(sim, 29);
    expect(sim.phase).toBe('result');
    run(sim, 1);
    expect(sim.phase).toBe('aiming');
  });

  it('counts steps from the outcome, not from the throw', () => {
    // Two throws that are decided at different times wait the same number of steps afterwards.
    const waits = [UPRIGHT, SIDE].map((pose) => {
      const sim = judged(pose);
      let steps = 0;
      while (sim.phase === 'result') {
        sim.step();
        steps++;
      }
      return steps;
    });
    expect(waits).toEqual([RESULT_STEPS, RESULT_STEPS]);
  });
});

describe('skip()', () => {
  it('brings the next bottle at once during the result', () => {
    const sim = judged(UPRIGHT);
    run(sim, 10);
    expect(sim.phase).toBe('result');
    expect(sim.skip()).toBe(true);
    const next = sim.snapshot();
    expect(next.phase).toBe('aiming');
    expectHeld(next);
    expect(next.outcome).toBeNull();
    expect(next.score).toBe(1);
    expect(next.bottle.water).toBe(waterSequence(5, 2)[1]);
  });

  it('works in the very step the result starts', () => {
    const sim = judged(SIDE);
    expect(sim.skip()).toBe(true);
    expect(sim.snapshot().phase).toBe('aiming');
    expectHeld(sim.snapshot());
  });

  it('changes nothing while aiming', () => {
    const sim = new Simulation({ seed: 5 });
    run(sim, 20);
    const before = sim.snapshot();
    expect(sim.skip()).toBe(false);
    expect(sim.snapshot()).toEqual(before);
    // ...and it does not use up the next bottle's water level.
    sim.throwBottle(50);
    runToOutcome(sim);
    run(sim, RESULT_STEPS);
    expect(sim.snapshot().bottle.water).toBe(waterSequence(5, 2)[1]);
  });

  it('changes nothing while flying', () => {
    const sim = new Simulation({ seed: 5 });
    sim.throwBottle(50);
    run(sim, 10);
    const before = sim.snapshot();
    expect(sim.skip()).toBe(false);
    expect(sim.snapshot()).toEqual(before);

    // Not even when the bottle is just about to be judged: still flying means nothing to skip.
    const placed = new Simulation({ seed: 5 });
    placed.placeBottle(UPRIGHT);
    run(placed, 20);
    const mid = placed.snapshot();
    expect(placed.skip()).toBe(false);
    expect(placed.snapshot()).toEqual(mid);
    expect(placed.snapshot().phase).toBe('flying');
  });

  it('is used up by one call: the second does nothing, and the next result waits the full delay', () => {
    const sim = judged(UPRIGHT);
    expect(sim.skip()).toBe(true);
    const aiming = sim.snapshot();
    expect(sim.skip()).toBe(false);
    expect(sim.snapshot()).toEqual(aiming);

    // The wait that was cut short doesn't shorten the next one.
    run(sim, 5);
    sim.placeBottle(UPRIGHT);
    runToOutcome(sim);
    run(sim, RESULT_STEPS - 1);
    expect(sim.phase).toBe('result');
    run(sim, 1);
    expect(sim.phase).toBe('aiming');
  });
});
