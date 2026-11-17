import { describe, expect, it } from 'vitest';
import {
  LandingJudge,
  bottleExtent,
  pointsForTurns,
  type LandingSample,
} from '../../src/core/outcome';
import { Simulation } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { resolveTuning } from '../../src/core/tuning';
import { FLIPPED, SIDE, UPRIGHT, flipped } from '../shared';
import { RESULT_STEPS, run, runToOutcome } from './helpers';

/*
 * The two scoring rules decided on 2026-11-16: a landing needs at least one full turn (resting
 * upright with 0 turns is a "no flip" fail), and an upright landing scores its number of turns.
 */

const TWO_PI = Math.PI * 2;

/** A bottle at rest upright on the table, as the judge sees it. */
const UPRIGHT_AT_REST: LandingSample = {
  x: TABLE_CENTER_X,
  y: TABLE_TOP_Y - bottleExtent(0, 0, 0).maxY,
  angle: 0,
  vx: 0,
  vy: 0,
  omega: 0,
  onTable: true,
};

/** Judge a bottle that rests upright from the first step, with `credit` turns counted as made. */
function restUpright(credit: number | undefined, tuning = {}) {
  const judge = new LandingJudge(resolveTuning(tuning), 0, credit);
  let outcome = judge.outcome;
  for (let i = 0; i < 60; i++) outcome = judge.observe(UPRIGHT_AT_REST);
  return outcome;
}

describe('pointsForTurns', () => {
  it('is the number of turns, whichever way the bottle turned', () => {
    expect(pointsForTurns(1)).toBe(1);
    expect(pointsForTurns(2)).toBe(2);
    expect(pointsForTurns(3)).toBe(3);
    expect(pointsForTurns(7)).toBe(7);
    expect(pointsForTurns(-1)).toBe(1);
    expect(pointsForTurns(-2)).toBe(2);
    expect(pointsForTurns(0)).toBe(0);
  });
});

describe('a landing needs a full turn (the judge)', () => {
  it('fails a bottle that comes to rest upright with no turn, with the reason noFlip', () => {
    expect(restUpright(undefined)).toEqual({
      result: 'fail',
      reason: 'noFlip',
      rotation: 0,
      turns: 0,
      points: 0,
    });
    expect(restUpright(0)).toMatchObject({ result: 'fail', reason: 'noFlip', points: 0 });
  });

  it('decides it in the same step as a success would be decided: after the full hold', () => {
    for (const credit of [0, 1]) {
      const judge = new LandingJudge(resolveTuning(), 0, credit);
      for (let i = 0; i < 59; i++) expect(judge.observe(UPRIGHT_AT_REST)).toBeNull();
      expect(judge.observe(UPRIGHT_AT_REST)).not.toBeNull();
    }
  });

  it('succeeds with turns 1, 2 and 3, and scores them', () => {
    for (const turns of [1, 2, 3, 4, 10]) {
      expect(restUpright(turns)).toMatchObject({
        result: 'success',
        reason: 'upright',
        turns,
        points: turns,
      });
    }
  });

  it('counts a bottle that turned 0.9 of a turn and tipped back upright as one turn', () => {
    // Turns 0.9 of a turn (324°) in the air, then tips on to upright: the rotation is a whole turn.
    const judge = new LandingJudge(resolveTuning(), 0);
    const flight = { ...UPRIGHT_AT_REST, onTable: false, y: 1 };
    for (let angle = 0.1; angle < 0.9 * TWO_PI; angle += 0.1) judge.observe({ ...flight, angle });
    for (let i = 0; i < 59; i++) judge.observe({ ...UPRIGHT_AT_REST, angle: TWO_PI });
    expect(judge.observe({ ...UPRIGHT_AT_REST, angle: TWO_PI })).toMatchObject({
      result: 'success',
      turns: 1,
      points: 1,
    });
    // The same thing as a credit: 0.9 of a turn made, the bottle standing.
    expect(restUpright(0.9)).toMatchObject({ result: 'success', turns: 1, points: 1 });
  });

  it('rounds like turns do: under half a turn is no flip, over half is a flip', () => {
    expect(restUpright(0.45)).toMatchObject({ result: 'fail', reason: 'noFlip', turns: 0 });
    expect(restUpright(0.55)).toMatchObject({ result: 'success', turns: 1, points: 1 });
    expect(restUpright(1.4)).toMatchObject({ result: 'success', turns: 1, points: 1 });
    expect(restUpright(1.6)).toMatchObject({ result: 'success', turns: 2, points: 2 });
  });

  it('counts a full turn either way round', () => {
    expect(restUpright(-1)).toMatchObject({ result: 'success', turns: -1, points: 1 });
    expect(restUpright(-2)).toMatchObject({ result: 'success', turns: -2, points: 2 });
    expect(restUpright(-0.2)).toMatchObject({ result: 'fail', reason: 'noFlip', points: 0 });
  });

  it('adds the credit to the rotation, like turning that was already made', () => {
    const out = restUpright(2);
    expect(out?.rotation).toBeCloseTo(2 * TWO_PI, 12);
    const judge = new LandingJudge(resolveTuning(), 0, 1.5);
    expect(judge.rotation).toBeCloseTo(1.5 * TWO_PI, 12);
  });

  it('leaves every other outcome as it was: a credit never turns a fail into a success', () => {
    const side = { ...UPRIGHT_AT_REST, angle: Math.PI / 2, y: TABLE_TOP_Y - 0.4 };
    const judge = new LandingJudge(resolveTuning(), Math.PI / 2, 3);
    let outcome = null;
    for (let i = 0; i < 60; i++)
      outcome = judge.observe({ ...side, y: TABLE_TOP_Y - bottleExtent(0, 0, Math.PI / 2).maxY });
    expect(outcome).toMatchObject({ result: 'fail', reason: 'side', points: 0 });
  });

  it('gives every fail 0 points', () => {
    const flying = { ...UPRIGHT_AT_REST, onTable: false, y: 1, vy: 3 };
    const timeout = new LandingJudge(resolveTuning({ timeoutSeconds: 0.5 }), 0, 2);
    let outcome = null;
    for (let i = 0; i < 30; i++) outcome = timeout.observe(flying);
    expect(outcome).toMatchObject({ result: 'fail', reason: 'timeout', points: 0 });
  });
});

describe('Simulation.placeBottle with a turns credit', () => {
  it('fails an upright bottle placed with no credit as "noFlip": no points, and the score stays', () => {
    const sim = new Simulation({ seed: 5 });
    expect(sim.placeBottle(UPRIGHT)).toBe(true);
    runToOutcome(sim);
    const snapshot = sim.snapshot();
    expect(snapshot.phase).toBe('result');
    expect(snapshot.outcome).toMatchObject({
      result: 'fail',
      reason: 'noFlip',
      turns: 0,
      points: 0,
    });
    expect(snapshot.score).toBe(0);
  });

  it('succeeds with a credit of 1, 2 and 3 turns and scores 1, 2 and 3 points', () => {
    for (const turns of [1, 2, 3]) {
      const sim = new Simulation({ seed: 5 });
      expect(sim.placeBottle(flipped(turns))).toBe(true);
      runToOutcome(sim);
      const snapshot = sim.snapshot();
      expect(snapshot.outcome).toMatchObject({ result: 'success', reason: 'upright', turns });
      expect(snapshot.outcome?.points).toBe(turns);
      expect(snapshot.score).toBe(turns);
    }
  });

  it('adds the points of every throw to the score, and a fail or a no flip adds nothing', () => {
    const sim = new Simulation({ seed: 5 });
    const scores: number[] = [];
    // single, no flip, double, side, triple, single
    for (const pose of [flipped(1), UPRIGHT, flipped(2), SIDE, flipped(3), FLIPPED]) {
      expect(sim.placeBottle(pose)).toBe(true);
      runToOutcome(sim);
      scores.push(sim.snapshot().score);
      run(sim, RESULT_STEPS);
    }
    expect(scores).toEqual([1, 1, 3, 3, 6, 7]);
    expect(sim.snapshot()).toMatchObject({ phase: 'aiming', score: 7, throws: 6 });
  });

  it('exposes the points of the last throw in the snapshot, and clears them with the next bottle', () => {
    const sim = new Simulation({ seed: 5 });
    sim.placeBottle(flipped(2));
    expect(sim.snapshot().outcome).toBeNull(); // nothing yet in the air
    runToOutcome(sim);
    expect(sim.snapshot().outcome?.points).toBe(2);
    run(sim, 30);
    expect(sim.snapshot().outcome?.points).toBe(2); // kept for the whole result
    sim.skip();
    expect(sim.snapshot().outcome).toBeNull();
    expect(sim.snapshot().score).toBe(2); // the score keeps it
  });

  it('does not let the credit save a bottle that lies on its side', () => {
    const sim = new Simulation({ seed: 5 });
    sim.placeBottle({ ...SIDE, turns: 2 });
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'fail', reason: 'side', points: 0 });
    expect(sim.snapshot().score).toBe(0);
  });

  it('is only bookkeeping: the bottle moves exactly the same with or without the credit', () => {
    const a = new Simulation({ seed: 5 });
    const b = new Simulation({ seed: 5 });
    const pose = { x: 6, y: 2, angle: 0.3, vx: 2, vy: -4, omega: 5 };
    a.placeBottle(pose);
    b.placeBottle({ ...pose, turns: 3 });
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
      expect(b.snapshot().bottle).toEqual(a.snapshot().bottle);
    }
    // Nothing turned or snapped the bottle: the angle at rest is what the physics gave it.
    expect(b.snapshot().bottle.angle).toBe(a.snapshot().bottle.angle);
    // And the credit is the whole difference in the rotation.
    const ra = a.snapshot().outcome?.rotation ?? NaN;
    const rb = b.snapshot().outcome?.rotation ?? NaN;
    expect(rb - ra).toBeCloseTo(3 * TWO_PI, 9);
  });

  it('refuses a credit that is not a number, without releasing the bottle', () => {
    const sim = new Simulation({ seed: 5 });
    for (const turns of [NaN, Infinity, -Infinity]) {
      expect(sim.placeBottle({ ...UPRIGHT, turns })).toBe(false);
      expect(sim.snapshot()).toMatchObject({ phase: 'aiming', throws: 0 });
    }
    expect(sim.placeBottle({ ...UPRIGHT, turns: 1 })).toBe(true);
  });

  it('does not change the outcome of a real throw: that has no credit', () => {
    const sim = new Simulation({ seed: 5 });
    sim.setWater(0.5);
    sim.throwBottle(100); // about 3 turns, from the sweep
    runToOutcome(sim);
    const { outcome, score } = sim.snapshot();
    expect(outcome?.points).toBe(outcome?.result === 'success' ? outcome.turns : 0);
    expect(score).toBe(outcome?.points);
  });
});
