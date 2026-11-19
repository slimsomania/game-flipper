import type { EffectCue } from './effectPlan';

/*
 * What the game has asked its small effects to do, for `window.__FLIPPER__.effects()`: the record
 * is what tests read, the same way `sounds()` records the sounds. The Game scene clears it when a
 * new simulation starts (the ticks start again from 0 with it).
 */

/** An effect the game played, as `window.__FLIPPER__.effects()` lists it. */
export type EffectLogEntry = EffectCue;

/** The oldest entries are dropped past this many, so a long session keeps a small log. */
const LOG_LIMIT = 200;

export class EffectLog {
  private entries: EffectLogEntry[] = [];

  record(cue: EffectCue): void {
    this.entries.push({ name: cue.name, intensity: cue.intensity, tick: cue.tick });
    if (this.entries.length > LOG_LIMIT) this.entries.splice(0, this.entries.length - LOG_LIMIT);
  }

  /** A copy of the entries, oldest first. */
  log(): EffectLogEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  clear(): void {
    this.entries = [];
  }
}

let shared: EffectLog | null = null;

/** The page's one effect log. */
export function sharedEffectLog(): EffectLog {
  shared ??= new EffectLog();
  return shared;
}
