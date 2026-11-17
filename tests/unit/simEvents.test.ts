import { describe, expect, it } from 'vitest';
import { GRAVITY } from '../../src/core/constants';
import type { ImpactEvent, OutcomeEvent, SimEvent } from '../../src/core/events';
import { Simulation } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { FLIPPED, SIDE, UPRIGHT } from '../shared';
import { RESULT_STEPS, run, runToOutcome } from './helpers';

const impacts = (events: SimEvent[]): ImpactEvent[] =>
  events.filter((e): e is ImpactEvent => e.type === 'impact');
const outcomes = (events: SimEvent[]): OutcomeEvent[] =>
  events.filter((e): e is OutcomeEvent => e.type === 'outcome');

/** A bottle dropped with its base `height` meters above the table, with no air drag. */
function dropped(height: number, extra: { vx?: number } = {}): Simulation {
  const sim = new Simulation({ seed: 2, tuning: { bottleLinearDamping: 0 } });
  expect(sim.placeBottle({ x: TABLE_CENTER_X, y: TABLE_TOP_Y - height, angle: 0, ...extra })).toBe(
    true,
  );
  return sim;
}

describe('the throw event', () => {
  it('is emitted when the held bottle is thrown, with the power and source used', () => {
    const sim = new Simulation({ seed: 1 });
    run(sim, 5);
    expect(sim.drainEvents()).toEqual([]);
    expect(sim.throwBottle(64)).toBe(true);
    expect(sim.drainEvents()).toEqual([{ type: 'throw', tick: 5, power: 64, source: 'keyboard' }]);
  });

  it('carries the clamped power and the mouse source', () => {
    const sim = new Simulation({ seed: 1 });
    sim.throwBottle(250, 'mouse');
    expect(sim.drainEvents()).toEqual([{ type: 'throw', tick: 0, power: 100, source: 'mouse' }]);
  });

  it('is not emitted when the throw is refused', () => {
    const sim = new Simulation({ seed: 1 });
    expect(sim.throwBottle(Number.NaN)).toBe(false);
    sim.throwBottle(50);
    sim.drainEvents();
    expect(sim.throwBottle(50)).toBe(false); // already flying
    expect(sim.drainEvents()).toEqual([]);
  });

  it('is not emitted for a bottle set up with placeBottle, which is not a throw', () => {
    const sim = new Simulation({ seed: 1 });
    sim.placeBottle(FLIPPED);
    expect(sim.drainEvents().map((e) => e.type)).toEqual([]);
  });

  it('is emitted for Space too (throwOrSkip), once per throw', () => {
    const sim = new Simulation({ seed: 1 });
    sim.powerMeter.set(40);
    sim.throwOrSkip();
    sim.throwOrSkip(); // flying: does nothing
    expect(sim.drainEvents().filter((e) => e.type === 'throw')).toEqual([
      { type: 'throw', tick: 0, power: 40, source: 'keyboard' },
    ]);
  });
});

describe('the impact event', () => {
  it('is emitted when the bottle hits the table, with the speed it arrived with', () => {
    const sim = dropped(0.5);
    run(sim, 60);
    const [first] = impacts(sim.drainEvents());
    // Falling half a meter from rest with no drag: v = sqrt(2 g h), to within the fixed step's error.
    expect(Math.abs(first.speed - Math.sqrt(2 * GRAVITY * 0.5))).toBeLessThan(0.15);
    expect(first.tick).toBeGreaterThan(15);
    expect(first.tick).toBeLessThan(25);
  });

  it('is faster for a harder hit', () => {
    const speeds = [0.1, 0.5, 2].map((height) => {
      const sim = dropped(height);
      run(sim, 90);
      return impacts(sim.drainEvents())[0].speed;
    });
    expect(speeds[0]).toBeLessThan(speeds[1]);
    expect(speeds[1]).toBeLessThan(speeds[2]);
  });

  it('measures the speed into the table, not along it', () => {
    const still = dropped(0.5);
    const sliding = dropped(0.5, { vx: 6 });
    run(still, 40);
    run(sliding, 40);
    const a = impacts(still.drainEvents())[0].speed;
    const b = impacts(sliding.drainEvents())[0].speed;
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });

  it('is one event for a hit that touches the table with two shapes at once', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle(SIDE);
    run(sim, 30);
    const found = impacts(sim.drainEvents());
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(new Set(found.map((e) => e.tick)).size).toBe(found.length);
  });

  it('is reported even for a hit too soft to sound: what sounds is for the sound code to decide', () => {
    const sim = dropped(0.025); // set down 2.5 cm above the table: it arrives at about 0.33 m/s
    run(sim, 30);
    const [first] = impacts(sim.drainEvents());
    expect(first.speed).toBeGreaterThan(0.1);
    expect(first.speed).toBeLessThan(0.5);
  });

  it('is not emitted for a bottle that starts out touching the table (it arrives at 0 m/s)', () => {
    const sim = dropped(0.004);
    run(sim, 30);
    expect(impacts(sim.drainEvents())).toEqual([]);
  });

  it('is not emitted while the bottle rests still', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle(FLIPPED);
    runToOutcome(sim); // upright for a second: it is at rest
    sim.drainEvents();
    run(sim, RESULT_STEPS - 5); // the judged bottle stays on the table for the whole wait
    expect(sim.phase).toBe('result');
    expect(sim.drainEvents()).toEqual([]);
  });

  it('is not emitted while the bottle waits in the hand', () => {
    const sim = new Simulation({ seed: 3 });
    run(sim, 300);
    expect(sim.drainEvents()).toEqual([]);
  });

  it('is not emitted while the bottle is still in the air', () => {
    const sim = new Simulation({ seed: 3 });
    sim.throwBottle(50);
    run(sim, 20); // well before the first landing, at about step 55
    expect(impacts(sim.drainEvents())).toEqual([]);
  });

  it('comes from a thrown bottle too, with a speed of a few m/s', () => {
    const sim = new Simulation({ seed: 3 });
    sim.throwBottle(50);
    runToOutcome(sim);
    const found = impacts(sim.drainEvents());
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0].speed).toBeGreaterThan(3);
    expect(found[0].speed).toBeLessThan(10);
  });

  it('is never reported with a speed of 0 or less', () => {
    const sim = new Simulation({ seed: 9 });
    sim.throwBottle(80);
    run(sim, 400);
    for (const event of impacts(sim.drainEvents())) expect(event.speed).toBeGreaterThan(0);
  });
});

describe('the outcome event', () => {
  it('is emitted once when a landing succeeds, with the result, reason and points', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    run(sim, 40);
    expect(outcomes(sim.drainEvents())).toEqual([
      {
        type: 'outcome',
        tick: sim.snapshot().tick - 40,
        result: 'success',
        reason: 'upright',
        points: 1,
      },
    ]);
  });

  it('is emitted once when a landing fails', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle(UPRIGHT);
    runToOutcome(sim);
    expect(outcomes(sim.drainEvents())).toEqual([
      { type: 'outcome', tick: sim.tick, result: 'fail', reason: 'noFlip', points: 0 },
    ]);
  });

  it('is emitted at the tick the result phase begins, after the impacts that led to it', () => {
    const sim = new Simulation({ seed: 3 });
    sim.throwBottle(60);
    runToOutcome(sim);
    const events = sim.drainEvents();
    expect(events[0].type).toBe('throw');
    expect(events.at(-1)).toMatchObject({ type: 'outcome', tick: sim.tick });
    const ticks = events.map((e) => e.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  it('is emitted exactly once per throw, over a whole round', () => {
    const sim = new Simulation({ seed: 4 });
    const powers = [30, 45, 50, 62, 75, 100, 20, 55, 90, 10];
    const all: SimEvent[] = [];
    for (const power of powers) {
      sim.throwBottle(power);
      runToOutcome(sim);
      run(sim, RESULT_STEPS);
      all.push(...sim.drainEvents());
    }
    expect(all.filter((e) => e.type === 'throw')).toHaveLength(10);
    expect(outcomes(all)).toHaveLength(10);
    expect(sim.phase).toBe('roundOver');
  });

  it('is not repeated while the result is showing, whatever else the bottle does', () => {
    const sim = new Simulation({ seed: 4 });
    sim.throwBottle(100);
    runToOutcome(sim);
    run(sim, RESULT_STEPS - 1);
    expect(outcomes(sim.drainEvents())).toHaveLength(1);
  });

  it('is emitted for a bottle that falls off the table, too', () => {
    const sim = new Simulation({ seed: 4 });
    sim.placeBottle({ x: 1.0, y: 3, angle: 0 });
    runToOutcome(sim);
    expect(outcomes(sim.drainEvents())).toMatchObject([{ result: 'fail', points: 0 }]);
  });
});

describe('draining events', () => {
  it('hands over everything once, oldest first, and then starts empty', () => {
    const sim = new Simulation({ seed: 3 });
    sim.throwBottle(50);
    runToOutcome(sim);
    const first = sim.drainEvents();
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(sim.drainEvents()).toEqual([]);
    sim.step();
    expect(sim.drainEvents()).toEqual([]);
  });

  it('gives the same events for the same seed and inputs', () => {
    const play = (): SimEvent[] => {
      const sim = new Simulation({ seed: 11 });
      sim.throwBottle(72);
      run(sim, 400);
      return sim.drainEvents();
    };
    expect(play()).toEqual(play());
  });

  it('does not change what the simulation does', () => {
    const a = new Simulation({ seed: 6 });
    const b = new Simulation({ seed: 6 });
    a.throwBottle(66);
    b.throwBottle(66);
    for (let i = 0; i < 300; i++) {
      a.step();
      b.step();
      if (i % 7 === 0) a.drainEvents(); // only `a` is ever drained
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});
