import { describe, expect, it } from 'vitest';
import { HAND_X, HAND_Y, drawWaterLevel } from '../../src/core/bottle';
import { BOTTLE_BODY_WIDTH } from '../../src/core/bottleShape';
import { createRng } from '../../src/core/rng';
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING, type Tuning } from '../../src/core/tuning';

/** The result wait: 1.5 s at 60 steps per second. */
const RESULT_STEPS = 90;

/** An upright bottle just above the table (a success) and one lying on its side (a fail). */
const UPRIGHT = { x: TABLE_CENTER_X, y: TABLE_TOP_Y - 0.05, angle: 0 };
const SIDE = {
  x: TABLE_CENTER_X,
  y: TABLE_TOP_Y - BOTTLE_BODY_WIDTH / 2 - 0.05,
  angle: Math.PI / 2,
};

function run(sim: Simulation, steps: number): SimSnapshot {
  for (let i = 0; i < steps; i++) sim.step();
  return sim.snapshot();
}

/** Step until the outcome is decided (the phase is then `result`); returns the steps taken. */
function runToOutcome(sim: Simulation, limit = 400): number {
  let steps = 0;
  while (sim.snapshot().outcome === null && steps < limit) {
    sim.step();
    steps++;
  }
  return steps;
}

/** A simulation whose bottle has just been judged: placed as `pose`, stepped to its outcome. */
function judged(
  pose: Parameters<Simulation['placeBottle']>[0] = UPRIGHT,
  options: { seed?: number; tuning?: Partial<Tuning> } = {},
): Simulation {
  const sim = new Simulation({ seed: options.seed ?? 5, tuning: options.tuning });
  expect(sim.placeBottle(pose)).toBe(true);
  runToOutcome(sim);
  return sim;
}

/** The water levels a seed hands out, in order: the held bottle's first, then one per bottle. */
function waterSequence(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => drawWaterLevel(rng, DEFAULT_TUNING));
}

/** Check that `snapshot` is a bottle standing still in the hand: upright, at rest, not moving. */
function expectHeld(snapshot: SimSnapshot): void {
  const { bottle } = snapshot;
  expect([bottle.x, bottle.y, bottle.angle]).toEqual([HAND_X, HAND_Y, 0]);
  expect([bottle.vx, bottle.vy, bottle.omega]).toEqual([0, 0, 0]);
}

describe('the result phase', () => {
  it('starts in the step that decides the outcome, with the score already updated', () => {
    const sim = new Simulation({ seed: 5 });
    sim.placeBottle(UPRIGHT);
    expect(sim.phase).toBe('flying');
    expect(sim.snapshot()).toMatchObject({ outcome: null, score: 0, throws: 1 });
    runToOutcome(sim);
    expect(sim.phase).toBe('result');
    expect(sim.snapshot()).toMatchObject({ phase: 'result', score: 1, throws: 1 });
    expect(sim.snapshot().outcome).toMatchObject({ result: 'success', reason: 'upright' });
  });

  it('keeps the judged bottle and its outcome on screen for the whole wait', () => {
    const sim = judged(UPRIGHT);
    const outcome = sim.snapshot().outcome;
    for (let i = 1; i < RESULT_STEPS; i++) {
      const snapshot = run(sim, 1);
      expect(snapshot.phase).toBe('result');
      expect(snapshot.outcome).toEqual(outcome);
      // The bottle that was judged is still the one in view, standing on the table.
      expect(snapshot.bottle.y).toBeGreaterThan(HAND_Y);
    }
  });
});

describe('score and throws', () => {
  it('adds 1 for a success, nothing for a fail, and counts every throw', () => {
    const sim = new Simulation({ seed: 5 });
    const scores: number[] = [];
    const throws: number[] = [];
    // success, fail, success, success, fail
    for (const pose of [UPRIGHT, SIDE, UPRIGHT, UPRIGHT, SIDE]) {
      expect(sim.placeBottle(pose)).toBe(true);
      runToOutcome(sim);
      scores.push(sim.snapshot().score);
      throws.push(sim.snapshot().throws);
      run(sim, RESULT_STEPS);
    }
    expect(scores).toEqual([1, 1, 2, 3, 3]);
    expect(throws).toEqual([1, 2, 3, 4, 5]);
    expect(sim.snapshot()).toMatchObject({ phase: 'aiming', score: 3, throws: 5 });
  });

  it('counts a throw as soon as the bottle is thrown, and a real throw like a placed one', () => {
    const sim = new Simulation({ seed: 5 });
    expect(sim.snapshot()).toMatchObject({ score: 0, throws: 0 });
    sim.throwBottle(50);
    expect(sim.snapshot()).toMatchObject({ score: 0, throws: 1 }); // in the air: counted, not scored
    runToOutcome(sim);
    const { outcome, score } = sim.snapshot();
    expect(score).toBe(outcome?.result === 'success' ? 1 : 0);
    expect(sim.snapshot().throws).toBe(1);
  });

  it('counts a bottle lost off the screen as a throw with no score, and replaces it', () => {
    const sim = new Simulation({ seed: 5 });
    sim.placeBottle({ x: 8, y: 2, angle: 0, vx: 40 }); // leaves the screen
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'fail', reason: 'offScreen' });
    expect(sim.snapshot()).toMatchObject({ phase: 'result', score: 0, throws: 1 });
    run(sim, RESULT_STEPS);
    expectHeld(sim.snapshot()); // and the lost bottle is gone
  });

  it('does not count a refused throw', () => {
    const sim = judged(UPRIGHT);
    expect(sim.throwBottle(50)).toBe(false); // during the result
    expect(sim.placeBottle(SIDE)).toBe(false);
    expect(sim.snapshot()).toMatchObject({ phase: 'result', score: 1, throws: 1 });
    expect(new Simulation({ seed: 5 }).throwBottle(Number.NaN)).toBe(false);
  });
});

describe('the next bottle', () => {
  it('appears after 90 steps, and not before: upright, still, in the hand', () => {
    const sim = judged(UPRIGHT);
    const decided = sim.snapshot();
    expect(decided.phase).toBe('result');
    run(sim, RESULT_STEPS - 1);
    expect(sim.phase).toBe('result'); // 89 steps: not yet
    expect(sim.snapshot().outcome).toEqual(decided.outcome);
    run(sim, 1); // the 90th
    const next = sim.snapshot();
    expect(next.phase).toBe('aiming');
    expectHeld(next);
    expect(next.outcome).toBeNull();
    expect(next.score).toBe(1);
  });

  it('has the next water level from the seed', () => {
    const sim = judged(UPRIGHT, { seed: 5 });
    const [first, second] = waterSequence(5, 2);
    expect(sim.snapshot().bottle.water).toBe(first); // the judged bottle is the first draw
    run(sim, RESULT_STEPS);
    expect(sim.snapshot().bottle.water).toBe(second);
  });

  it('keeps drawing from the same sequence, bottle after bottle', () => {
    const sim = new Simulation({ seed: 21 });
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(sim.snapshot().bottle.water);
      sim.placeBottle(UPRIGHT);
      runToOutcome(sim);
      run(sim, RESULT_STEPS);
    }
    expect(seen).toEqual(waterSequence(21, 6));
  });

  it('stays in the hand, upright and still, however long it waits', () => {
    const sim = judged(SIDE);
    run(sim, RESULT_STEPS);
    expect(sim.phase).toBe('aiming');
    expectHeld(run(sim, 300));
    expect(sim.phase).toBe('aiming'); // no second result, no further bottle
    expect(sim.snapshot().throws).toBe(1);
  });

  it('can be thrown like the first one, and its own result follows the same rules', () => {
    const sim = judged(UPRIGHT);
    run(sim, RESULT_STEPS);
    const water = sim.snapshot().bottle.water;
    expect(sim.throwBottle(50)).toBe(true);
    expect(sim.snapshot()).toMatchObject({ phase: 'flying', throws: 2, outcome: null });
    expect(sim.snapshot().lastThrow).toEqual({ power: 50, water, source: 'keyboard' });
    runToOutcome(sim);
    expect(sim.phase).toBe('result');
    run(sim, RESULT_STEPS - 1);
    expect(sim.phase).toBe('result');
    run(sim, 1);
    expect(sim.phase).toBe('aiming');
  });

  it('leaves lastThrow as it was until the next throw', () => {
    const sim = new Simulation({ seed: 5 });
    sim.throwBottle(30);
    runToOutcome(sim);
    run(sim, RESULT_STEPS);
    expect(sim.snapshot().phase).toBe('aiming');
    expect(sim.snapshot().lastThrow).toMatchObject({ power: 30, source: 'keyboard' });
  });

  it('is a working bottle: its own water sets its mass, so a fuller one launches slower', () => {
    const launchSpeed = (water: number): number => {
      const sim = judged(UPRIGHT);
      run(sim, RESULT_STEPS);
      sim.setWater(water);
      sim.throwBottle(50);
      return Math.hypot(sim.snapshot().bottle.vx, sim.snapshot().bottle.vy);
    };
    expect(launchSpeed(0.9)).toBeLessThan(launchSpeed(0.1));
  });

  it('uses the tuning in effect when it appears', () => {
    const sim = judged(UPRIGHT);
    sim.setTuning({ waterMin: 0.5, waterMax: 0.5 }); // changed during the result
    run(sim, RESULT_STEPS);
    expect(sim.snapshot().bottle.water).toBe(0.5);
    expect(sim.tuning.waterMin).toBe(0.5);
  });
});

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

describe('replaying a seed', () => {
  const POWERS = [20, 45, 60, 75, 35];

  interface Replay {
    water: number[];
    outcomes: (SimSnapshot['outcome'] | undefined)[];
    scores: number[];
    throws: number[];
  }

  /** Throw each power at the current bottle, wait for the result, then wait it out or skip it. */
  function play(seed: number, powers: number[], skipWaits: boolean): Replay {
    const sim = new Simulation({ seed });
    const replay: Replay = { water: [], outcomes: [], scores: [], throws: [] };
    for (const power of powers) {
      replay.water.push(sim.snapshot().bottle.water);
      expect(sim.throwBottle(power)).toBe(true);
      runToOutcome(sim);
      replay.outcomes.push(sim.snapshot().outcome);
      replay.scores.push(sim.snapshot().score);
      replay.throws.push(sim.snapshot().throws);
      if (skipWaits) sim.skip();
      else run(sim, RESULT_STEPS);
      expect(sim.phase).toBe('aiming');
    }
    return replay;
  }

  it('gives the same water levels, outcomes and score for the same seed and five powers', () => {
    const first = play(13, POWERS, false);
    const again = play(13, POWERS, false);
    expect(again).toEqual(first);
    expect(first.water).toEqual(waterSequence(13, 5));
    expect(first.throws).toEqual([1, 2, 3, 4, 5]);
    expect(first.outcomes.every((outcome) => outcome !== null)).toBe(true);
    // The score is the running count of successes.
    let successes = 0;
    first.outcomes.forEach((outcome, i) => {
      if (outcome?.result === 'success') successes++;
      expect(first.scores[i]).toBe(successes);
    });
  });

  it('gives a different sequence of bottles for a different seed', () => {
    expect(play(13, POWERS, false).water).not.toEqual(play(14, POWERS, false).water);
  });

  it('is the same whether the waits run out or are skipped', () => {
    expect(play(13, POWERS, true)).toEqual(play(13, POWERS, false));
  });

  it('gives identical snapshots after the same steps, results and skips', () => {
    const make = (): SimSnapshot => {
      const sim = new Simulation({ seed: 8 });
      sim.throwBottle(55);
      runToOutcome(sim);
      run(sim, 30);
      sim.skip();
      sim.throwBottle(40);
      run(sim, 400);
      return sim.snapshot();
    };
    expect(make()).toEqual(make());
  });
});
