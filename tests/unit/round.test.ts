import { describe, expect, it } from 'vitest';
import type { Outcome } from '../../src/core/outcome';
import { Round, roundLength } from '../../src/core/round';
import { DEFAULT_TUNING, resolveTuning, type Tuning } from '../../src/core/tuning';

/** An outcome as the judge reports it: a success worth `turns` points, or a fail worth none. */
const success = (turns: number): Outcome => ({
  result: 'success',
  reason: 'upright',
  rotation: turns * 2 * Math.PI,
  turns,
  points: turns,
});
const fail = (reason: 'side' | 'noFlip' = 'side'): Outcome => ({
  result: 'fail',
  reason,
  rotation: 0,
  turns: 0,
  points: 0,
});

const newRound = (tuning: Partial<Tuning> = {}): Round => {
  const resolved = resolveTuning(tuning);
  return new Round(() => resolved);
};

describe('roundLength', () => {
  it('is ten throws by default (the design: a round is 10 throws)', () => {
    expect(DEFAULT_TUNING.throwsPerRound).toBe(10);
    expect(roundLength(DEFAULT_TUNING)).toBe(10);
  });

  it('is the tuning’s whole number of throws, never below 1', () => {
    expect(roundLength(resolveTuning({ throwsPerRound: 3 }))).toBe(3);
    expect(roundLength(resolveTuning({ throwsPerRound: 4.9 }))).toBe(4);
    for (const bad of [0, -5, 0.5, Number.NaN, Infinity, -Infinity]) {
      expect(roundLength(resolveTuning({ throwsPerRound: bad }))).toBe(1);
    }
  });
});

describe('Round', () => {
  it('starts empty', () => {
    const round = newRound();
    expect(round).toMatchObject({ length: 10, score: 0, landings: 0, streak: 0, complete: false });
    expect(round.throwNumber(true)).toBe(1);
  });

  it('scores the turns of each success and nothing for a fail', () => {
    const round = newRound();
    round.judged(success(1));
    round.judged(fail());
    round.judged(success(2));
    round.judged(fail('noFlip'));
    round.judged(success(3));
    expect(round.score).toBe(6);
  });

  it('counts landings, and a streak that a fail sets back to 0 without touching the score', () => {
    const round = newRound();
    const log: { score: number; landings: number; streak: number }[] = [];
    // landing, landing, double, fail, landing, fail, fail, landing
    for (const outcome of [
      success(1),
      success(1),
      success(2),
      fail(),
      success(1),
      fail('noFlip'),
      fail(),
      success(1),
    ]) {
      round.judged(outcome);
      log.push({ score: round.score, landings: round.landings, streak: round.streak });
    }
    expect(log).toEqual([
      { score: 1, landings: 1, streak: 1 },
      { score: 2, landings: 2, streak: 2 },
      { score: 4, landings: 3, streak: 3 },
      { score: 4, landings: 3, streak: 0 },
      { score: 5, landings: 4, streak: 1 },
      { score: 5, landings: 4, streak: 0 },
      { score: 5, landings: 4, streak: 0 },
      { score: 6, landings: 5, streak: 1 },
    ]);
  });

  it('numbers the throw in progress, and is complete once every throw has been released', () => {
    const round = newRound({ throwsPerRound: 3 });
    const numbers: number[] = [];
    for (let i = 0; i < 3; i++) {
      numbers.push(round.throwNumber(true)); // the bottle in the hand
      expect(round.complete).toBe(false);
      round.released();
      numbers.push(round.throwNumber(false)); // in the air, then judged: still the same throw
    }
    expect(numbers).toEqual([1, 1, 2, 2, 3, 3]);
    expect(round.complete).toBe(true);
    expect(round.throwNumber(false)).toBe(3); // the last throw, never a 4th
    expect(round.throwNumber(true)).toBe(3);
  });

  it('reset goes back to the start of a round', () => {
    const round = newRound({ throwsPerRound: 2 });
    round.released();
    round.judged(success(2));
    round.released();
    round.judged(success(1));
    expect(round.complete).toBe(true);
    round.reset();
    expect(round).toMatchObject({ score: 0, landings: 0, streak: 0, complete: false });
    expect(round.throwNumber(true)).toBe(1);
  });

  it('follows the tuning as it changes', () => {
    let tuning = resolveTuning({ throwsPerRound: 5 });
    const round = new Round(() => tuning);
    round.released();
    round.released();
    expect(round.complete).toBe(false);
    tuning = { ...tuning, throwsPerRound: 2 };
    expect(round.length).toBe(2);
    expect(round.complete).toBe(true);
    expect(round.throwNumber(true)).toBe(2); // never past the end
  });
});
