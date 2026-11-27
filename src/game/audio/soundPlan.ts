import { stepsFor } from '../../core/constants';
import type { ImpactEvent, OutcomeEvent, SimEvent } from '../../core/events';
import type { Tuning } from '../../core/tuning';

/*
 * Which sound each simulation event makes, and how loud. Pure: no Web Audio, no clock. Time is the
 * events' own `tick`, so the knock rate limit gives the same answer whether a frame brings one
 * step's events or ninety steps' worth (a test stepping the simulation by hand).
 */

export type SoundName = 'whoosh' | 'knock' | 'chime' | 'fanfare' | 'thud';

/** One sound to play: its name, its loudness (above 0, up to 1) and the tick of the event behind it. */
export interface SoundCue {
  name: SoundName;
  volume: number;
  tick: number;
}

/** The knock at the slowest speed that still sounds, and the whoosh of a throw at power 0. */
export const KNOCK_QUIETEST = 0.2;
export const WHOOSH_QUIETEST = 0.35;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * How loud a knock is: `KNOCK_QUIETEST` at `knockMinSpeed`, rising in a straight line to 1 at
 * `knockFullSpeed` and above. The harder the bottle hits, the louder.
 */
export function knockVolume(speed: number, tuning: Tuning): number {
  const span = tuning.knockFullSpeed - tuning.knockMinSpeed;
  const fraction = span > 0 ? clamp01((speed - tuning.knockMinSpeed) / span) : 1;
  return KNOCK_QUIETEST + (1 - KNOCK_QUIETEST) * fraction;
}

/** How loud a throw's whoosh is: a harder throw (power 0 to 100) is louder. */
export function whooshVolume(power: number): number {
  return WHOOSH_QUIETEST + (1 - WHOOSH_QUIETEST) * clamp01(power / 100);
}

/** A cap landing plays the fanfare, any other success the chime, a fail the thud. */
function outcomeSound(event: OutcomeEvent): SoundName {
  if (event.result !== 'success') return 'thud';
  return event.reason === 'cap' ? 'fanfare' : 'chime';
}

/** Turns simulation events into sounds, keeping the one fact the rate limit needs: the last knock. */
export class SoundPlanner {
  private lastKnockTick: number | null = null;

  /** The cues for these events, in order. Events that make no sound add nothing. */
  plan(events: readonly SimEvent[], tuning: Tuning): SoundCue[] {
    const cues: SoundCue[] = [];
    for (const event of events) {
      const cue = this.cueFor(event, tuning);
      if (cue) cues.push(cue);
    }
    return cues;
  }

  private cueFor(event: SimEvent, tuning: Tuning): SoundCue | null {
    switch (event.type) {
      case 'throw':
        return { name: 'whoosh', volume: whooshVolume(event.power), tick: event.tick };
      case 'impact':
        return this.knockFor(event, tuning);
      case 'outcome':
        return { name: outcomeSound(event), volume: 1, tick: event.tick };
    }
  }

  /**
   * A knock for an impact, unless it is too soft to hear or comes within `knockGapSeconds` (counted
   * in whole steps) of the last knock that sounded. A knock that is dropped doesn't restart the gap.
   */
  private knockFor(impact: ImpactEvent, tuning: Tuning): SoundCue | null {
    if (!(impact.speed >= tuning.knockMinSpeed)) return null;
    const last = this.lastKnockTick;
    if (last !== null && impact.tick - last <= stepsFor(tuning.knockGapSeconds)) return null;
    this.lastKnockTick = impact.tick;
    return { name: 'knock', volume: knockVolume(impact.speed, tuning), tick: impact.tick };
  }
}
