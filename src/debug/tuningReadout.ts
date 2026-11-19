import { findWindows, sweepPowers, widestWindow, type FlipWindow } from '../core/flipWindow';
import type { SimSnapshot } from '../core/simulation';
import type { Tuning } from '../core/tuning';

/*
 * What the tuning panel prints about the game, as plain functions with no DOM: the last throw and
 * the flip windows of the bottle in the hand. Everything is read from the simulation's snapshot and
 * from `flipWindow.ts`, so the panel never reimplements a rule.
 */

const NONE = '-';

/** A water level (0 to 1) as a percentage without noise: 0.5 is "50%", 0.125 is "12.5%". */
export const waterText = (water: number): string => `${Number((water * 100).toFixed(1))}%`;

/** The numbers of the last throw, as the text the panel shows next to each label. */
export interface LastThrowReadout {
  water: string;
  power: string;
  outcome: string;
  turns: string;
  rotation: string;
}

export const NO_THROW: LastThrowReadout = {
  water: NONE,
  power: NONE,
  outcome: 'no throw yet',
  turns: NONE,
  rotation: NONE,
};

/**
 * Remembers the last throw that was decided. The snapshot's `outcome` only lasts until the next
 * bottle appears (about 1 s), and the panel should keep showing the throw until the next one
 * is decided, so it watches the snapshots and keeps what it saw. Feed it every snapshot you read
 * (a frame, say); a game that starts over (the tick goes back) makes it forget.
 *
 * A bottle put in place with `placeBottle` is not a throw and has no power of its own, so its
 * line shows the power of the last real throw, if there was one.
 */
export class LastThrowTracker {
  private tick = 0;
  private decidedAt = -1;
  private decided: LastThrowReadout | null = null;

  /** The readout for the game as of `snapshot`. */
  read(snapshot: SimSnapshot): LastThrowReadout {
    if (snapshot.tick < this.tick) {
      this.decidedAt = -1;
      this.decided = null;
    }
    this.tick = snapshot.tick;
    const { outcome, lastThrow } = snapshot;
    if (outcome && snapshot.throws !== this.decidedAt) {
      this.decidedAt = snapshot.throws;
      this.decided = {
        water: waterText(lastThrow?.water ?? snapshot.bottle.water),
        power: lastThrow ? String(Number(lastThrow.power.toFixed(1))) : NONE,
        outcome: `${outcome.result} (${outcome.reason})`,
        turns: String(outcome.turns),
        rotation: String(Number((outcome.rotation / (2 * Math.PI)).toFixed(2))),
      };
    }
    // A bottle in the air: show it, without an outcome (the decided one is for the throw before).
    if (snapshot.phase === 'flying' && lastThrow) {
      return {
        water: waterText(lastThrow.water),
        power: String(Number(lastThrow.power.toFixed(1))),
        outcome: 'in the air',
        turns: NONE,
        rotation: NONE,
      };
    }
    return this.decided ?? NO_THROW;
  }
}

/** One window as a line of text: its powers, center and width, or "none". */
export function windowText(label: string, window: FlipWindow | null): string {
  if (!window) return `${label}: none`;
  return `${label}: power ${window.low} to ${window.high} (center ${window.center}, width ${window.width})`;
}

/** The single- and double-flip windows of a bottle holding `water`, measured with `tuning`. */
export function measureFlipWindows(
  water: number,
  tuning: Tuning,
): { single: FlipWindow | null; double: FlipWindow | null } {
  const windows = findWindows(sweepPowers(water, tuning));
  return { single: widestWindow(windows, 1), double: widestWindow(windows, 2) };
}

/** The text of a measurement: a heading with the water level and a line each for single and double. */
export function windowsReadout(
  water: number,
  windows: { single: FlipWindow | null; double: FlipWindow | null },
): string {
  return [
    `Water ${waterText(water)}`,
    windowText('single flip', windows.single),
    windowText('double flip', windows.double),
  ].join('\n');
}
