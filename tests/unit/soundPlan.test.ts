import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/core/events';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING, resolveTuning, type Tuning } from '../../src/core/tuning';
import {
  KNOCK_QUIETEST,
  SoundPlanner,
  WHOOSH_QUIETEST,
  knockVolume,
  whooshVolume,
} from '../../src/game/audio/soundPlan';
import { FLIPPED, UPRIGHT } from '../shared';
import { RESULT_STEPS, run, runToOutcome } from './helpers';

const throwAt = (tick: number, power = 50): SimEvent => ({
  type: 'throw',
  tick,
  power,
  source: 'keyboard',
});
const hit = (tick: number, speed: number): SimEvent => ({ type: 'impact', tick, speed });
const outcome = (tick: number, result: 'success' | 'fail'): SimEvent => ({
  type: 'outcome',
  tick,
  result,
  reason: result === 'success' ? 'upright' : 'side',
  points: result === 'success' ? 1 : 0,
});

const plan = (events: SimEvent[], tuning: Tuning = DEFAULT_TUNING) =>
  new SoundPlanner().plan(events, tuning);

describe('the sound for each event', () => {
  it('is a whoosh for a throw', () => {
    expect(plan([throwAt(0)]).map((c) => c.name)).toEqual(['whoosh']);
  });

  it('is a chime for a success and a thud for a fail', () => {
    expect(plan([outcome(100, 'success')]).map((c) => c.name)).toEqual(['chime']);
    expect(plan([outcome(100, 'fail')]).map((c) => c.name)).toEqual(['thud']);
  });

  it('is a knock for an impact that is hard enough', () => {
    expect(plan([hit(50, 5)]).map((c) => c.name)).toEqual(['knock']);
  });

  it('keeps the events order, and the tick of each event', () => {
    const cues = plan([throwAt(0), hit(50, 5), hit(70, 2), outcome(120, 'success')]);
    expect(cues.map((c) => [c.name, c.tick])).toEqual([
      ['whoosh', 0],
      ['knock', 50],
      ['knock', 70],
      ['chime', 120],
    ]);
  });

  it('is nothing for no events', () => {
    expect(plan([])).toEqual([]);
  });

  it('never gives a success a thud or a fail a chime', () => {
    const names = (result: 'success' | 'fail') => plan([outcome(1, result)]).map((c) => c.name);
    expect(names('success')).not.toContain('thud');
    expect(names('fail')).not.toContain('chime');
  });
});

describe('knock volume', () => {
  it('is quietest at the minimum speed and full at the full speed and above', () => {
    expect(knockVolume(DEFAULT_TUNING.knockMinSpeed, DEFAULT_TUNING)).toBeCloseTo(KNOCK_QUIETEST);
    expect(knockVolume(DEFAULT_TUNING.knockFullSpeed, DEFAULT_TUNING)).toBeCloseTo(1);
    expect(knockVolume(DEFAULT_TUNING.knockFullSpeed * 3, DEFAULT_TUNING)).toBeCloseTo(1);
  });

  it('is louder for a harder impact', () => {
    const speeds = [0.4, 1, 2, 4, 6, 8];
    const volumes = speeds.map((speed) => knockVolume(speed, DEFAULT_TUNING));
    for (let i = 1; i < volumes.length; i++) expect(volumes[i]).toBeGreaterThan(volumes[i - 1]);
  });

  it('is always above 0 and up to 1', () => {
    for (const speed of [0.35, 0.5, 3, 7.99, 8, 50]) {
      const volume = knockVolume(speed, DEFAULT_TUNING);
      expect(volume).toBeGreaterThan(0);
      expect(volume).toBeLessThanOrEqual(1);
    }
  });

  it('is full for any hit that sounds when the full speed is not above the minimum', () => {
    const tuning = resolveTuning({ knockMinSpeed: 2, knockFullSpeed: 2 });
    expect(knockVolume(2, tuning)).toBe(1);
  });

  it('shows in the planned cues: a hard knock is louder than a gentle one', () => {
    const [gentle] = plan([hit(10, 0.8)]);
    const [hard] = plan([hit(10, 7)]);
    expect(hard.volume).toBeGreaterThan(gentle.volume);
  });
});

describe('whoosh volume', () => {
  it('rises with the power of the throw, from the quietest to full', () => {
    expect(whooshVolume(0)).toBeCloseTo(WHOOSH_QUIETEST);
    expect(whooshVolume(100)).toBeCloseTo(1);
    expect(whooshVolume(50)).toBeGreaterThan(whooshVolume(20));
    expect(whooshVolume(250)).toBeCloseTo(1);
    expect(whooshVolume(-10)).toBeCloseTo(WHOOSH_QUIETEST);
  });
});

describe('the minimum impact speed', () => {
  it('makes an impact below it silent', () => {
    const min = DEFAULT_TUNING.knockMinSpeed;
    expect(plan([hit(10, min - 0.01)])).toEqual([]);
    expect(plan([hit(10, 0.1)])).toEqual([]);
  });

  it('lets an impact at the minimum speed sound', () => {
    expect(plan([hit(10, DEFAULT_TUNING.knockMinSpeed)]).map((c) => c.name)).toEqual(['knock']);
  });

  it('follows the tuning', () => {
    const tuning = resolveTuning({ knockMinSpeed: 3 });
    expect(plan([hit(10, 2.9)], tuning)).toEqual([]);
    expect(plan([hit(10, 3.1)], tuning)).toHaveLength(1);
  });

  it('is a default that silences the settling taps and keeps the first landing', () => {
    expect(DEFAULT_TUNING.knockMinSpeed).toBeGreaterThan(0.15);
    expect(DEFAULT_TUNING.knockMinSpeed).toBeLessThan(1);
  });

  it('is not a sound when the speed is not a number', () => {
    expect(plan([hit(10, Number.NaN)])).toEqual([]);
  });

  it('does not start the rate limit with a silent impact', () => {
    const planner = new SoundPlanner();
    expect(planner.plan([hit(10, 0.1), hit(12, 5)], DEFAULT_TUNING)).toHaveLength(1);
  });
});

describe('the knock rate limit', () => {
  it('is 100 ms, which is 6 steps', () => {
    expect(DEFAULT_TUNING.knockGapSeconds).toBe(0.1);
  });

  it('drops a knock within 100 ms of the last one, the boundary included', () => {
    const names = (gap: number) =>
      plan([hit(100, 5), hit(100 + gap, 5)]).map((c) => `${c.name}@${c.tick}`);
    expect(names(1)).toEqual(['knock@100']);
    expect(names(5)).toEqual(['knock@100']);
    expect(names(6)).toEqual(['knock@100']); // exactly 100 ms is still "within"
    expect(names(7)).toEqual(['knock@100', 'knock@107']);
    expect(names(60)).toEqual(['knock@100', 'knock@160']);
  });

  it('never lets two knocks sound closer than 100 ms, over a flurry of impacts', () => {
    const events = Array.from({ length: 200 }, (_, i) => hit(i * 2, 4)); // every 33 ms
    const ticks = plan(events).map((c) => c.tick);
    expect(ticks.length).toBeGreaterThan(10);
    for (let i = 1; i < ticks.length; i++) {
      expect(((ticks[i] - ticks[i - 1]) / 60) * 1000).toBeGreaterThan(100);
    }
  });

  it('counts from the last knock that sounded, not from one that was dropped', () => {
    // 0 sounds, 4 and 6 are dropped, 7 is more than 6 steps after 0 and sounds.
    expect(plan([hit(0, 5), hit(4, 5), hit(6, 5), hit(7, 5)]).map((c) => c.tick)).toEqual([0, 7]);
  });

  it('gives the same answer however the events are split into frames', () => {
    const events = [hit(10, 5), hit(14, 5), hit(40, 3), hit(43, 6), hit(90, 2)];
    const whole = plan(events).map((c) => c.tick);
    const planner = new SoundPlanner();
    const split = events.flatMap((e) => planner.plan([e], DEFAULT_TUNING)).map((c) => c.tick);
    expect(split).toEqual(whole);
    expect(whole).toEqual([10, 40, 90]);
  });

  it('follows the tuning', () => {
    const tuning = resolveTuning({ knockGapSeconds: 0.5 });
    expect(plan([hit(0, 5), hit(20, 5), hit(31, 5)], tuning).map((c) => c.tick)).toEqual([0, 31]);
  });

  it('does not hold back a whoosh, a chime or a thud', () => {
    const cues = plan([hit(100, 5), throwAt(101), outcome(102, 'success')]);
    expect(cues.map((c) => c.name)).toEqual(['knock', 'whoosh', 'chime']);
  });
});

describe('planning a real throw', () => {
  it('gives a knock and a chime for an upright landing (a placed bottle is not thrown: no whoosh)', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    run(sim, RESULT_STEPS - 5);
    expect(plan(sim.drainEvents(), sim.tuning).map((c) => c.name)).toEqual(['knock', 'chime']);
  });

  it('gives a whoosh, at least one knock and then a thud for a failed throw', () => {
    // A throw 10 points below the single-flip window of a half-full bottle turns too little and
    // falls over: the power comes from a sweep, not from a number that depends on the tuning.
    const low = widestWindow(findWindows(sweepPowers(0.5)), 1)!.low;
    const sim = new Simulation({ seed: 3 });
    sim.setWater(0.5);
    sim.throwBottle(low - 10);
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'fail' });
    const names = plan(sim.drainEvents(), sim.tuning).map((c) => c.name);
    expect(names[0]).toBe('whoosh');
    expect(names.filter((n) => n === 'knock').length).toBeGreaterThanOrEqual(1);
    expect(names.at(-1)).toBe('thud');
    expect(names).not.toContain('chime');
  });

  it('gives a thud for a plain drop (no flip)', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle(UPRIGHT);
    runToOutcome(sim);
    expect(plan(sim.drainEvents(), sim.tuning).map((c) => c.name)).toEqual(['knock', 'thud']);
  });
});
