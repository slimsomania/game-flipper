import { describe, expect, it } from 'vitest';
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING } from '../../src/core/tuning';

const RESULT_STEPS = 90;

function run(sim: Simulation, steps: number): SimSnapshot {
  for (let i = 0; i < steps; i++) sim.step();
  return sim.snapshot();
}

/** Step until the outcome is decided (the phase is then `result`). */
function runToOutcome(sim: Simulation, limit = 400): void {
  for (let i = 0; i < limit && sim.snapshot().outcome === null; i++) sim.step();
}

describe('the power bar in the simulation', () => {
  it('starts at 50 and shows it in the snapshot', () => {
    expect(new Simulation({ seed: 3 }).snapshot().power).toBe(50);
    expect(new Simulation({ seed: 3, tuning: { powerStart: 35 } }).snapshot().power).toBe(35);
  });

  it('moves with a held key as the simulation steps, in any phase', () => {
    const sim = new Simulation({ seed: 3 });
    sim.powerMeter.press(1);
    run(sim, 60);
    sim.powerMeter.release(1);
    const raised = sim.snapshot().power;
    expect(raised).toBeGreaterThan(50 + 10);

    // Now during a flight.
    expect(sim.throwBottle(raised)).toBe(true);
    sim.powerMeter.press(-1);
    run(sim, 30);
    sim.powerMeter.release(-1);
    expect(sim.snapshot().phase).toBe('flying');
    expect(sim.snapshot().power).toBeLessThan(raised - 5);
  });

  it('follows setTuning: the new step applies to the next tap', () => {
    const sim = new Simulation({ seed: 3 });
    sim.setTuning({ powerTapStep: 5 });
    sim.powerMeter.press(1);
    expect(sim.snapshot().power).toBe(55);
  });

  it('is a pure function of the seed and the inputs', () => {
    const play = (): SimSnapshot[] => {
      const sim = new Simulation({ seed: 21 });
      const states: SimSnapshot[] = [];
      for (let i = 0; i < 500; i++) {
        if (i === 5) sim.powerMeter.press(1);
        if (i === 40) sim.powerMeter.release(1);
        if (i === 41) sim.powerMeter.wheel(-4);
        if (i === 60) sim.throwOrSkip();
        if (i === 100) sim.powerMeter.press(-1);
        if (i === 150) sim.powerMeter.release(-1);
        if (i === 330) sim.throwOrSkip();
        sim.step();
        states.push(sim.snapshot());
      }
      return states;
    };
    expect(play()).toEqual(play());
  });
});

describe('throwOrSkip (Space)', () => {
  it('throws the held bottle with the bar value while aiming', () => {
    const sim = new Simulation({ seed: 4 });
    sim.powerMeter.set(37);
    expect(sim.throwOrSkip()).toBe(true);
    const state = sim.snapshot();
    expect(state.phase).toBe('flying');
    expect(state.lastThrow).toMatchObject({ power: 37, source: 'keyboard' });
    expect(state.throws).toBe(1);
  });

  it('throws exactly like throwBottle with the same power', () => {
    const viaSpace = new Simulation({ seed: 4 });
    viaSpace.powerMeter.set(64);
    viaSpace.throwOrSkip();
    const direct = new Simulation({ seed: 4 });
    direct.powerMeter.set(64);
    direct.throwBottle(64);
    expect(run(viaSpace, 200)).toEqual(run(direct, 200));
  });

  it('uses the value the bar has at that moment, including one set by a held key', () => {
    const sim = new Simulation({ seed: 4 });
    sim.powerMeter.press(1);
    run(sim, 30);
    const at = sim.snapshot().power;
    expect(at).toBeGreaterThan(51);
    sim.throwOrSkip();
    expect(sim.snapshot().lastThrow?.power).toBe(at);
  });

  it('does nothing while the bottle is flying', () => {
    const sim = new Simulation({ seed: 4 });
    sim.throwOrSkip();
    run(sim, 10);
    const before = sim.snapshot();
    sim.powerMeter.set(90);
    expect(sim.throwOrSkip()).toBe(false);
    expect(sim.snapshot()).toEqual({ ...before, power: 90 });
  });

  it('brings the next bottle during a result', () => {
    const sim = new Simulation({ seed: 4 });
    sim.placeBottle({ x: TABLE_CENTER_X, y: TABLE_TOP_Y - 0.05, angle: 0 });
    runToOutcome(sim);
    expect(sim.phase).toBe('result');
    expect(sim.throwOrSkip()).toBe(true);
    expect(sim.snapshot()).toMatchObject({ phase: 'aiming', outcome: null, throws: 1 });
    // The same call again is a throw of the new bottle, not a second skip.
    expect(sim.throwOrSkip()).toBe(true);
    expect(sim.snapshot()).toMatchObject({ phase: 'flying', throws: 2 });
  });
});

describe('the power keeps its value when the next bottle appears', () => {
  it('after the result delay runs out', () => {
    const sim = new Simulation({ seed: 6 });
    sim.powerMeter.set(72);
    sim.throwOrSkip();
    runToOutcome(sim);
    expect(sim.snapshot().power).toBe(72);
    expect(run(sim, RESULT_STEPS - 1).phase).toBe('result');
    const next = run(sim, 1);
    expect(next.phase).toBe('aiming');
    expect(next.power).toBe(72);
  });

  it('after a skip', () => {
    const sim = new Simulation({ seed: 6 });
    sim.powerMeter.set(18);
    sim.throwOrSkip();
    runToOutcome(sim);
    sim.skip();
    expect(sim.snapshot()).toMatchObject({ phase: 'aiming', power: 18 });
  });

  it('and the player can change it during the result for the next throw', () => {
    const sim = new Simulation({ seed: 6 });
    sim.throwOrSkip();
    runToOutcome(sim);
    sim.powerMeter.wheel(5);
    sim.skip();
    expect(sim.snapshot().power).toBe(50 + 5 * DEFAULT_TUNING.powerWheelStep);
    sim.throwOrSkip();
    expect(sim.snapshot().lastThrow?.power).toBe(50 + 5 * DEFAULT_TUNING.powerWheelStep);
  });
});
