import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { createTuningControl } from '../../src/debug/tuningControl';
import { TUNING_STORAGE_KEY } from '../../src/debug/tuningStore';
import { runToOutcome } from './helpers';
import { fakeStorage } from './tuningHelpers';

/** The speed a bottle with this tuning leaves the hand at, thrown at `power` with 50% water. */
function launchSpeed(tuning: Partial<typeof DEFAULT_TUNING>, power: number): number {
  const sim = new Simulation({ seed: 1, tuning, lockedWater: 0.5 });
  sim.throwBottle(power);
  const { vx, vy } = sim.snapshot().bottle;
  return Math.hypot(vx, vy);
}

describe('the tuning control', () => {
  it('starts with the defaults and no edits', () => {
    const control = createTuningControl(fakeStorage(), () => null);
    expect(control.values()).toEqual(DEFAULT_TUNING);
    expect(control.isEdited('throwLinearImpulse')).toBe(false);
    expect(control.waterLock()).toBeNull();
    expect(control.simulationOptions()).toEqual({ tuning: {}, lockedWater: null });
  });

  it('applies an edit to the running simulation, so the next throw is stronger', () => {
    const sim = new Simulation({ seed: 1, lockedWater: 0.5 });
    const control = createTuningControl(fakeStorage(), () => sim);
    expect(control.set('throwLinearImpulse', DEFAULT_TUNING.throwLinearImpulse * 1.5)).toBe(true);
    expect(sim.tuning.throwLinearImpulse).toBe(DEFAULT_TUNING.throwLinearImpulse * 1.5);
    expect(control.values().throwLinearImpulse).toBe(DEFAULT_TUNING.throwLinearImpulse * 1.5);
    expect(control.isEdited('throwLinearImpulse')).toBe(true);

    sim.throwBottle(60);
    const edited = Math.hypot(sim.snapshot().bottle.vx, sim.snapshot().bottle.vy);
    expect(edited).toBeCloseTo(launchSpeed({}, 60) * 1.5, 6);
  });

  it('never changes a bottle already in flight, only the next one', () => {
    const sim = new Simulation({ seed: 1, lockedWater: 0.5 });
    const control = createTuningControl(fakeStorage(), () => sim);
    sim.throwBottle(60);
    const before = { ...sim.snapshot().bottle };
    control.set('throwLinearImpulse', 30);
    control.set('bottleFriction', 0.1);
    expect(sim.snapshot().bottle).toEqual(before);
    runToOutcome(sim);
    sim.skip();
    sim.throwBottle(60);
    expect(Math.hypot(sim.snapshot().bottle.vx, sim.snapshot().bottle.vy)).toBeGreaterThan(
      launchSpeed({}, 60),
    );
  });

  it('refuses an unknown key or a value that is not a finite number, changing nothing', () => {
    const storage = fakeStorage();
    const control = createTuningControl(storage, () => null);
    expect(control.set('nope', 3)).toBe(false);
    expect(control.set('toString', 3)).toBe(false);
    expect(control.set('shellDensity', Number.NaN)).toBe(false);
    expect(control.set('shellDensity', Number.POSITIVE_INFINITY)).toBe(false);
    expect(control.values()).toEqual(DEFAULT_TUNING);
    expect(storage.data.size).toBe(0);
  });

  it('keeps edits across a reload: a second control on the same storage starts with them', () => {
    const storage = fakeStorage();
    const first = createTuningControl(storage, () => null);
    first.set('throwLinearImpulse', 12);
    first.setWaterLock(0.35);
    const second = createTuningControl(storage, () => null);
    expect(second.values().throwLinearImpulse).toBe(12);
    expect(second.isEdited('throwLinearImpulse')).toBe(true);
    expect(second.waterLock()).toBe(0.35);
    // ...and hands them to the simulation it starts.
    const sim = new Simulation({ seed: 1, ...second.simulationOptions() });
    expect(sim.tuning.throwLinearImpulse).toBe(12);
    expect(sim.lockedWater).toBe(0.35);
    expect(sim.snapshot().bottle.water).toBe(0.35);
  });

  it('is not an edit once a value is back at its default', () => {
    const storage = fakeStorage();
    const control = createTuningControl(storage, () => null);
    control.set('shellDensity', 2);
    control.set('shellDensity', DEFAULT_TUNING.shellDensity);
    expect(control.isEdited('shellDensity')).toBe(false);
    expect(storage.data.has(TUNING_STORAGE_KEY)).toBe(false);
  });

  it('resets every value to its default, in the simulation and in the storage', () => {
    const sim = new Simulation({ seed: 1 });
    const storage = fakeStorage();
    const control = createTuningControl(storage, () => sim);
    control.set('throwLinearImpulse', 12);
    control.set('bottleFriction', 0.1);
    control.reset();
    expect(control.values()).toEqual(DEFAULT_TUNING);
    expect(sim.tuning).toEqual(DEFAULT_TUNING);
    expect(control.isEdited('throwLinearImpulse')).toBe(false);
    expect(storage.data.has(TUNING_STORAGE_KEY)).toBe(false);
  });

  it('leaves the water lock alone when the values are reset', () => {
    const control = createTuningControl(fakeStorage(), () => null);
    control.setWaterLock(0.5);
    control.set('shellDensity', 2);
    control.reset();
    expect(control.waterLock()).toBe(0.5);
  });

  it('locks the water of the running simulation, clamped, and unlocks it', () => {
    const sim = new Simulation({ seed: 1 });
    const control = createTuningControl(fakeStorage(), () => sim);
    control.setWaterLock(0.5);
    expect(sim.lockedWater).toBe(0.5);
    expect(sim.snapshot().bottle.water).toBe(0.5);
    control.setWaterLock(4);
    expect(control.waterLock()).toBe(1);
    control.setWaterLock(Number.NaN);
    expect(control.waterLock()).toBe(1);
    control.setWaterLock(null);
    expect(control.waterLock()).toBeNull();
    expect(sim.lockedWater).toBeNull();
  });

  it('tells its listeners about every change, until they stop listening', () => {
    const control = createTuningControl(fakeStorage(), () => null);
    let calls = 0;
    const stop = control.subscribe(() => calls++);
    control.set('shellDensity', 2);
    control.setWaterLock(0.5);
    control.reset();
    expect(calls).toBe(3);
    control.set('nope', 1); // refused: not a change
    expect(calls).toBe(3);
    stop();
    control.set('shellDensity', 3);
    expect(calls).toBe(3);
  });

  it('works in memory only with no storage', () => {
    const control = createTuningControl(null, () => null);
    expect(control.set('shellDensity', 2)).toBe(true);
    expect(control.values().shellDensity).toBe(2);
    expect(createTuningControl(null, () => null).values()).toEqual(DEFAULT_TUNING);
  });

  it('does not let a damaged saved entry stop a game from starting', () => {
    const storage = fakeStorage({
      [TUNING_STORAGE_KEY]: '{"version":1,"values":{"shellDensity":"x"}}',
    });
    const control = createTuningControl(storage, () => null);
    expect(() => new Simulation({ seed: 1, ...control.simulationOptions() })).not.toThrow();
    expect(control.values()).toEqual(DEFAULT_TUNING);
  });
});
