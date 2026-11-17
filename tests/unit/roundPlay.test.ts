import { describe, expect, it } from 'vitest';
import { HAND_Y } from '../../src/core/bottle';
import { Simulation } from '../../src/core/simulation';
import { FLIPPED, SIDE, UPRIGHT, flipped, type PlacedPose } from '../shared';
import { RESULT_STEPS, play, playRound, run, runToOutcome } from './helpers';

describe('a round of ten throws', () => {
  // The script, with what each throw is worth: the sums are written out, not computed, so the test
  // doesn't repeat the rule it checks.
  const script: { pose: PlacedPose; score: number; landings: number; streak: number }[] = [
    { pose: FLIPPED, score: 1, landings: 1, streak: 1 }, //          single
    { pose: SIDE, score: 1, landings: 1, streak: 0 }, //             fail: the streak resets
    { pose: flipped(2), score: 3, landings: 2, streak: 1 }, //       double adds 2
    { pose: FLIPPED, score: 4, landings: 3, streak: 2 },
    { pose: UPRIGHT, score: 4, landings: 3, streak: 0 }, //          no flip: a fail
    { pose: flipped(3), score: 7, landings: 4, streak: 1 }, //       triple adds 3
    { pose: SIDE, score: 7, landings: 4, streak: 0 },
    { pose: SIDE, score: 7, landings: 4, streak: 0 }, //             a second fail in a row
    { pose: FLIPPED, score: 8, landings: 5, streak: 1 },
    { pose: flipped(2), score: 10, landings: 6, streak: 2 },
  ];

  it('scores the turns of each success, counts landings and resets the streak on a fail', () => {
    const sim = new Simulation({ seed: 5 });
    expect(sim.snapshot()).toMatchObject({
      phase: 'aiming',
      score: 0,
      landings: 0,
      streak: 0,
      throwNumber: 1,
      throwsPerRound: 10,
    });
    script.forEach(({ pose, score, landings, streak }, i) => {
      expect(sim.snapshot()).toMatchObject({ phase: 'aiming', throwNumber: i + 1 });
      expect(sim.placeBottle(pose)).toBe(true);
      // In the air the throw is the same number, and nothing is scored before it is judged.
      expect(sim.snapshot()).toMatchObject({ phase: 'flying', throwNumber: i + 1 });
      expect(sim.snapshot().landings).toBe(i === 0 ? 0 : script[i - 1].landings);
      runToOutcome(sim);
      expect(sim.snapshot()).toMatchObject({
        phase: 'result',
        throwNumber: i + 1,
        score,
        landings,
        streak,
      });
      run(sim, RESULT_STEPS);
    });
  });

  it('counts the throw number from 1 to 10 and stays on 10 when the round is over', () => {
    const sim = new Simulation({ seed: 5 });
    const numbers: number[] = [];
    for (let i = 0; i < 10; i++) {
      numbers.push(sim.snapshot().throwNumber);
      play(sim, FLIPPED);
    }
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(sim.snapshot()).toMatchObject({ phase: 'roundOver', throwNumber: 10, throws: 10 });
  });

  it('gives the streak no say in the points: three landings in a row score 1 each', () => {
    const sim = new Simulation({ seed: 5 });
    const seen: number[][] = [];
    for (let i = 0; i < 3; i++) {
      sim.placeBottle(FLIPPED);
      runToOutcome(sim);
      const { score, streak } = sim.snapshot();
      seen.push([score, streak]);
      run(sim, RESULT_STEPS);
    }
    expect(seen).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('is kept by real throws too: every number follows the outcomes the judge gave', () => {
    const sim = new Simulation({ seed: 9 });
    let score = 0;
    let landings = 0;
    let streak = 0;
    for (let i = 0; i < 10; i++) {
      expect(sim.snapshot().throwNumber).toBe(i + 1);
      expect(sim.throwBottle(10 + i * 9)).toBe(true); // powers from a flop to a hard throw
      runToOutcome(sim);
      const { outcome } = sim.snapshot();
      if (outcome?.result === 'success') {
        score += outcome.points;
        landings++;
        streak++;
      } else {
        streak = 0;
      }
      expect(sim.snapshot()).toMatchObject({ score, landings, streak });
      run(sim, RESULT_STEPS);
    }
    expect(sim.phase).toBe('roundOver');
  });

  it('is as long as the tuning says', () => {
    const sim = new Simulation({ seed: 5, tuning: { throwsPerRound: 3 } });
    expect(sim.snapshot().throwsPerRound).toBe(3);
    play(sim, FLIPPED);
    play(sim, FLIPPED);
    expect(sim.phase).toBe('aiming');
    play(sim, FLIPPED);
    expect(sim.snapshot()).toMatchObject({ phase: 'roundOver', throwNumber: 3, score: 3 });
  });
});

describe('the end of a round', () => {
  it('is reached after the 10th result’s wait: the phase is roundOver and no bottle appears', () => {
    const sim = new Simulation({ seed: 5 });
    for (let i = 0; i < 9; i++) play(sim, FLIPPED);
    expect(sim.placeBottle(FLIPPED)).toBe(true);
    runToOutcome(sim);
    // The 10th result is shown for the whole wait, like every other...
    for (let i = 1; i < RESULT_STEPS; i++) expect(run(sim, 1).phase).toBe('result');
    expect(sim.snapshot()).toMatchObject({ score: 10, landings: 10 });
    // ...and then the round is over.
    const ended = run(sim, 1);
    expect(ended).toMatchObject({ phase: 'roundOver', throws: 10, outcome: null });
    expect(ended.resultSteps).toBeNull();
    // Nothing new in the hand: the 10th bottle is still where it landed, on the table.
    expect(ended.bottle.y).toBeGreaterThan(HAND_Y);
    const before = ended.bottle;
    expect(run(sim, 600)).toMatchObject({ phase: 'roundOver', throws: 10, throwNumber: 10 });
    expect(sim.snapshot().bottle.x).toBeCloseTo(before.x, 3);
    expect(sim.snapshot().bottle.y).toBeCloseTo(before.y, 3);
  });

  it('is reached at once by skip() during the 10th result', () => {
    const sim = new Simulation({ seed: 5 });
    for (let i = 0; i < 9; i++) play(sim, SIDE);
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    expect(sim.phase).toBe('result');
    expect(sim.skip()).toBe(true);
    expect(sim.snapshot()).toMatchObject({ phase: 'roundOver', outcome: null, score: 1 });
    expect(sim.skip()).toBe(false); // nothing left to skip
  });

  it('comes after ten throws even if every one fails: a fail scores nothing and ends nothing early', () => {
    const sim = new Simulation({ seed: 5 });
    for (let i = 0; i < 5; i++) play(sim, SIDE);
    expect(sim.snapshot()).toMatchObject({ phase: 'aiming', score: 0, throwNumber: 6 });
    for (let i = 0; i < 4; i++) play(sim, SIDE);
    expect(sim.phase).toBe('aiming');
    play(sim, SIDE);
    expect(sim.snapshot()).toMatchObject({ phase: 'roundOver', score: 0, landings: 0, streak: 0 });
  });

  it('refuses every throw: throwBottle, placeBottle, the key and the mouse do nothing', () => {
    const sim = new Simulation({ seed: 5 });
    playRound(sim);
    const ended = sim.snapshot();
    expect(sim.throwBottle(50)).toBe(false);
    expect(sim.throwBottle(100, 'mouse')).toBe(false);
    expect(sim.placeBottle(FLIPPED)).toBe(false);
    expect(sim.throwOrSkip()).toBe(false);
    expect(sim.mouse.canGrab(280, 400)).toBe(false);
    expect(sim.mouse.grab(280, 400, 0)).toBe(false);
    expect(sim.skip()).toBe(false);
    expect(run(sim, 300)).toMatchObject({
      phase: 'roundOver',
      throws: 10,
      score: ended.score,
      landings: 10,
      streak: 10,
    });
  });

  it('keeps the power bar working, so the next round can be set up', () => {
    const sim = new Simulation({ seed: 5 });
    playRound(sim);
    sim.powerMeter.set(70);
    expect(sim.snapshot().power).toBe(70);
  });
});
