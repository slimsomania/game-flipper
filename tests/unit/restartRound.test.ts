import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { FLIPPED, SIDE, flipped, waterSequence } from '../shared';
import { RESULT_STEPS, expectHeld, play, playRound, run, runToOutcome } from './helpers';

describe('Simulation.restartRound', () => {
  /** A round in progress: two throws made (a landing, then a fail) and the 3rd bottle in the hand. */
  function midRound(): Simulation {
    const sim = new Simulation({ seed: 5 });
    play(sim, flipped(2));
    play(sim, SIDE);
    expect(sim.snapshot()).toMatchObject({
      phase: 'aiming',
      throwNumber: 3,
      score: 2,
      landings: 1,
    });
    return sim;
  }

  function expectNewRound(sim: Simulation): void {
    const snapshot = sim.snapshot();
    expect(snapshot).toMatchObject({
      phase: 'aiming',
      throwNumber: 1,
      score: 0,
      landings: 0,
      streak: 0,
      outcome: null,
      resultSteps: null,
      dragging: false,
    });
    expectHeld(snapshot);
  }

  it('starts a new round from the aiming phase', () => {
    const sim = midRound();
    sim.restartRound();
    expectNewRound(sim);
  });

  it('starts a new round from the very first throw, with nothing scored yet', () => {
    const sim = new Simulation({ seed: 5 });
    sim.restartRound();
    expectNewRound(sim);
  });

  it('starts a new round while a bottle is in flight, and the flight never scores', () => {
    const sim = midRound();
    expect(sim.throwBottle(60)).toBe(true);
    run(sim, 20);
    expect(sim.phase).toBe('flying');
    sim.restartRound();
    expectNewRound(sim);
    // The throw that was in the air is gone: it is never judged, nothing lands, nothing scores.
    run(sim, 600);
    expectNewRound(sim);
  });

  it('starts a new round during a result, and the result goes with it', () => {
    const sim = midRound();
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    expect(sim.snapshot()).toMatchObject({ phase: 'result', score: 3, streak: 1 });
    sim.restartRound();
    expectNewRound(sim);
    // The result wait of the old throw doesn't run on and replace the new bottle.
    run(sim, RESULT_STEPS * 2);
    expectNewRound(sim);
  });

  it('starts a new round after the round has ended, and ten more throws can be played', () => {
    const sim = new Simulation({ seed: 5 });
    playRound(sim);
    expect(sim.phase).toBe('roundOver');
    sim.restartRound();
    expectNewRound(sim);
    // The new round is a whole round: nine singles and a double, then it ends again.
    playRound(sim);
    expect(sim.snapshot()).toMatchObject({
      phase: 'roundOver',
      throwNumber: 10,
      score: 11,
      landings: 10,
      throws: 20, // the simulation's own count keeps going
    });
  });

  it('drops a grab with the mouse and gives the bar back', () => {
    const sim = midRound();
    sim.powerMeter.set(64);
    expect(sim.mouse.grab(280, 450, 0)).toBe(true);
    sim.mouse.drag(300, 0.05);
    expect(sim.snapshot().power).not.toBe(64);
    sim.restartRound();
    expectNewRound(sim);
    expect(sim.snapshot().power).toBe(64);
    expect(sim.mouse.release(0.1, 250)).toBe(false); // the button coming up later throws nothing
    expect(sim.phase).toBe('aiming');
  });

  it('carries on with the seed’s water levels instead of repeating the same ten bottles', () => {
    const sim = new Simulation({ seed: 5 });
    const levels = waterSequence(5, 6);
    expect(sim.snapshot().bottle.water).toBe(levels[0]);
    play(sim, FLIPPED); // the 2nd bottle: levels[1]
    expect(sim.snapshot().bottle.water).toBe(levels[1]);
    sim.restartRound(); // a new bottle: levels[2]
    expect(sim.snapshot().bottle.water).toBe(levels[2]);
    sim.restartRound();
    expect(sim.snapshot().bottle.water).toBe(levels[3]);
    play(sim, FLIPPED);
    expect(sim.snapshot().bottle.water).toBe(levels[4]);
  });

  it('keeps a locked water level, the power bar, the total throws and the clock', () => {
    const sim = new Simulation({ seed: 5 });
    sim.lockWater(0.3);
    sim.powerMeter.set(77);
    play(sim, FLIPPED);
    const before = sim.snapshot();
    sim.restartRound();
    const after = sim.snapshot();
    expect(after.bottle.water).toBe(0.3);
    expect(after).toMatchObject({ power: 77, throws: 1, tick: before.tick, seed: 5 });
  });

  it('can be repeated, and always leaves one bottle in the hand', () => {
    const sim = midRound();
    for (let i = 0; i < 5; i++) {
      sim.restartRound();
      expectNewRound(sim);
    }
  });

  it('is deterministic: the same seed and the same calls give the same round', () => {
    const play12 = (): number[] => {
      const sim = new Simulation({ seed: 21 });
      const scores: number[] = [];
      for (let i = 0; i < 12; i++) {
        if (i === 6) sim.restartRound();
        sim.throwBottle(20 + i * 6);
        runToOutcome(sim);
        scores.push(sim.snapshot().score);
        run(sim, RESULT_STEPS);
      }
      return scores;
    };
    expect(play12()).toEqual(play12());
  });
});
