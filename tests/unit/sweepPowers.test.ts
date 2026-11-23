import { describe, expect, it } from 'vitest';
import { SWEEP_POWERS, findWindows, sweepPowers } from '../../src/core/flipWindow';
import { stepsFor } from '../../src/core/constants';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';

/** The game itself, driven by hand: throw at `power` and step until the result starts. */
function playOnce(water: number, power: number, tuning = {}) {
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(power);
  let steps = 0;
  while (sim.phase === 'flying') {
    sim.step();
    steps++;
  }
  return { steps, outcome: sim.snapshot().outcome };
}

describe('sweepPowers', () => {
  it('throws once at every power from 0 to 100, in order', () => {
    const results = sweepPowers(0.5);
    expect(results).toHaveLength(101);
    expect(results.map((r) => r.power)).toEqual(Array.from({ length: 101 }, (_, i) => i));
    expect(SWEEP_POWERS).toEqual(results.map((r) => r.power));
    for (const r of results) {
      expect(['success', 'fail']).toContain(r.result);
      expect(Number.isInteger(r.turns)).toBe(true);
    }
  });

  it('is deterministic: two sweeps give equal results', () => {
    expect(sweepPowers(0.5)).toEqual(sweepPowers(0.5));
    expect(sweepPowers(0.15, { throwLinearImpulse: 11 })).toEqual(
      sweepPowers(0.15, { throwLinearImpulse: 11 }),
    );
  }, 30_000); // four sweeps of 101 throws: well over the 5 s default on a busy machine

  it('does not flip the bottle at power 0: it only drops, and that is a fail at every water level', () => {
    // 10% to 90% in 5% steps, the water levels of the game.
    for (let percent = 10; percent <= 90; percent += 5) {
      const [drop] = sweepPowers(percent / 100, {}, [0]);
      expect(drop.power).toBe(0);
      expect(drop.turns).toBe(0);
      expect(Math.abs(drop.rotation)).toBeLessThan(0.1);
      // It lands upright, but a landing needs a full turn: a fail with its own reason.
      expect(drop).toMatchObject({ result: 'fail', reason: 'noFlip', points: 0 });
      // So it is in no window at all.
      expect(findWindows([drop])).toEqual([]);
    }
  });

  it('never lands upright without a full turn, and scores its turns when it does', () => {
    for (const water of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const r of sweepPowers(water)) {
        if (r.result === 'success' && r.reason === 'cap') {
          // On the cap (design section 2, 2026-11-22): its completed full turns, at least 1.
          expect(r.points).toBe(Math.max(1, Math.abs(r.turns)));
        } else if (r.result === 'success') {
          expect(r.turns).toBeGreaterThanOrEqual(1);
          expect(r.points).toBe(r.turns);
        } else {
          expect(r.points).toBe(0);
        }
      }
    }
  }, 30_000); // five sweeps of 101 throws

  it('gives the same result as playing the throw in the game', () => {
    for (const [water, power] of [
      [0.5, 55],
      [0.2, 44],
      [0.9, 100],
      [0.3, 10],
    ]) {
      const [swept] = sweepPowers(water, {}, [power]);
      const played = playOnce(water, power);
      expect(swept).toMatchObject({ power, ...played.outcome });
    }
  });

  it('stops each run at the step that decides its outcome', () => {
    for (const power of [0, 40, 60, 100]) {
      const [swept] = sweepPowers(0.5, {}, [power]);
      const played = playOnce(0.5, power);
      expect(swept.steps).toBe(played.steps);
      expect(swept.steps).toBeGreaterThan(0);
      expect(swept.steps).toBeLessThanOrEqual(stepsFor(DEFAULT_TUNING.timeoutSeconds));
    }
  });

  it('sweeps only the powers it is given, and each throw is independent of the others', () => {
    const full = sweepPowers(0.5);
    const some = sweepPowers(0.5, {}, [100, 3, 57]);
    expect(some.map((r) => r.power)).toEqual([100, 3, 57]);
    expect(some).toEqual([full[100], full[3], full[57]]);
    expect(sweepPowers(0.5, {}, [])).toEqual([]);
  });

  it('uses the tuning it is given', () => {
    // Without any spin a bottle can't turn, at any power.
    const results = sweepPowers(0.5, { throwAngularImpulse: 0 }, [0, 25, 50, 75, 100]);
    expect(results.every((r) => r.turns === 0)).toBe(true);
    // The default tuning does turn the bottle at full power.
    expect(sweepPowers(0.5, {}, [100])[0].turns).toBeGreaterThan(0);
  });

  it('clamps the water level like the game does', () => {
    expect(sweepPowers(1.5, {}, [50])).toEqual(sweepPowers(1, {}, [50]));
  });

  it('shows more turns with more power', () => {
    const results = sweepPowers(0.5);
    expect(results[100].turns).toBeGreaterThan(results[20].turns);
  });
});
