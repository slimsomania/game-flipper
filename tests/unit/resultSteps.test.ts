import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { SIDE, FLIPPED } from '../shared';
import { RESULT_STEPS, runToOutcome } from './helpers';

describe('snapshot.resultSteps (steps since the outcome, for the result flash)', () => {
  it('is null while aiming and while flying', () => {
    const sim = new Simulation({ seed: 5 });
    expect(sim.snapshot().resultSteps).toBeNull();
    sim.placeBottle(FLIPPED);
    for (let i = 0; i < 30; i++) {
      sim.step();
      expect(sim.snapshot().phase).toBe('flying');
      expect(sim.snapshot().resultSteps).toBeNull();
    }
  });

  it('is 0 in the step that decides the outcome and counts up by one per step', () => {
    for (const pose of [FLIPPED, SIDE]) {
      const sim = new Simulation({ seed: 5 });
      sim.placeBottle(pose);
      runToOutcome(sim);
      expect(sim.snapshot()).toMatchObject({ phase: 'result', resultSteps: 0 });
      for (let age = 1; age < RESULT_STEPS; age++) {
        sim.step();
        expect(sim.snapshot()).toMatchObject({ phase: 'result', resultSteps: age });
      }
    }
  });

  it('is null again from the step the next bottle appears', () => {
    const sim = new Simulation({ seed: 5 });
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    for (let i = 0; i < RESULT_STEPS; i++) sim.step();
    expect(sim.snapshot()).toMatchObject({ phase: 'aiming', outcome: null, resultSteps: null });
  });

  it('is null after skip() and starts again at 0 with the next outcome', () => {
    const sim = new Simulation({ seed: 5 });
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.snapshot().resultSteps).toBe(20);
    sim.skip();
    expect(sim.snapshot().resultSteps).toBeNull();

    sim.placeBottle(SIDE);
    runToOutcome(sim);
    expect(sim.snapshot()).toMatchObject({ phase: 'result', resultSteps: 0 });
  });

  it('is only set while the outcome is, in every step of a whole throw', () => {
    const sim = new Simulation({ seed: 11 });
    sim.throwBottle(60);
    for (let i = 0; i < 600; i++) {
      sim.step();
      const { outcome, resultSteps, phase } = sim.snapshot();
      expect(resultSteps === null).toBe(outcome === null);
      expect(resultSteps === null).toBe(phase !== 'result');
    }
  });
});
