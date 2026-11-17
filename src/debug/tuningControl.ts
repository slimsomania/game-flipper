import type { Simulation, SimulationOptions } from '../core/simulation';
import { DEFAULT_TUNING, type Tuning } from '../core/tuning';
import { currentSimulation } from './currentSimulation';
import { panelEnabled } from './debugMode';
import {
  editedValues,
  isTuningKey,
  loadSaved,
  saveSaved,
  type TuningKey,
  type TuningStorage,
} from './tuningStore';

/*
 * The one place that changes the feel of a running game: the tuning panel and the test hooks
 * (`tuning()`, `setTuningValue()`) both go through it, so a value edited from either shows up in
 * the other, in the simulation and in localStorage. It holds the edited tuning values and the
 * water lock, applies them to the running simulation through `Simulation.setTuning` and
 * `lockWater` (so they reach the next bottle and throw, never a flight already under way), and
 * hands them to every new simulation, so a restarted game keeps them. It has no DOM.
 */

export interface TuningControl {
  /** The tuning in effect: the defaults with the edits on top. */
  values(): Tuning;
  /** True when `key` has been edited to something other than its default. */
  isEdited(key: TuningKey): boolean;
  /**
   * Edit one value. Returns false, changing nothing, for a key that isn't in the tuning or a value
   * that isn't a finite number.
   */
  set(key: string, value: number): boolean;
  /** Put every value back to its default (the water lock is a separate switch and stays). */
  reset(): void;
  /** The locked water level, or null while bottles get random levels. */
  waterLock(): number | null;
  /** Lock every bottle's water to `level` (clamped to 0..1), or null for random levels again. */
  setWaterLock(level: number | null): void;
  /** What a new simulation should start with, so a restarted game keeps the edits and the lock. */
  simulationOptions(): Pick<SimulationOptions, 'tuning' | 'lockedWater'>;
  /** Call `listener` after every change, however it was made; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

export function createTuningControl(
  storage: TuningStorage | null,
  simulation: () => Simulation | null,
): TuningControl {
  const saved = loadSaved(storage);
  let edits = saved.values;
  let lock = saved.waterLock;
  const listeners = new Set<() => void>();

  const changed = (): void => {
    saveSaved(storage, { values: edits, waterLock: lock });
    for (const listener of [...listeners]) listener();
  };

  return {
    values: () => ({ ...DEFAULT_TUNING, ...edits }),
    isEdited: (key) => key in edits,
    set(key, value) {
      if (!isTuningKey(key) || !Number.isFinite(value)) return false;
      edits = editedValues({ ...edits, [key]: value });
      simulation()?.setTuning({ [key]: value });
      changed();
      return true;
    },
    reset() {
      edits = {};
      simulation()?.setTuning({ ...DEFAULT_TUNING });
      changed();
    },
    waterLock: () => lock,
    setWaterLock(level) {
      if (level !== null && !Number.isFinite(level)) return;
      lock = level === null ? null : Math.min(1, Math.max(0, level));
      simulation()?.lockWater(lock);
      changed();
    },
    simulationOptions: () => ({ tuning: { ...edits }, lockedWater: lock }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** localStorage, or null when the browser blocks it (the tool then just forgets on reload). */
function browserStorage(): TuningStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let shared: TuningControl | null = null;

/**
 * The control of this page. It remembers edits in localStorage only where the developer panel is
 * on (a dev build or `?debug`), so a player's game is never changed by leftovers; elsewhere (for
 * example `?testhooks` alone) it works in memory.
 */
export function tuningControl(): TuningControl {
  shared ??= createTuningControl(panelEnabled() ? browserStorage() : null, currentSimulation);
  return shared;
}
