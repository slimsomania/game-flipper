import type { SimEvent } from '../../core/events';
import type { Tuning } from '../../core/tuning';

/*
 * Which small effect each simulation event makes, and how strong. Pure: no Phaser, no clock, no
 * randomness. Like the sounds (soundPlan.ts) the effects react to the events the simulation queues,
 * never to its state, and time is the events' own `tick`.
 */

export type EffectName = 'shake' | 'burst' | 'capBurst' | 'pop';

/**
 * One effect to play. `intensity` says how strong, in the unit of each effect: a `shake` is the
 * farthest it moves the picture in logical pixels (never above `shakeMaxPixels`), a `burst` is the
 * number of particles, and a `pop` is always 1 (the message pops in at full size).
 */
export interface EffectCue {
  name: EffectName;
  intensity: number;
  /** The simulation tick of the event behind it. */
  tick: number;
}

/** The shake of the softest impact that still shakes, as a fraction of the cap. */
export const SHAKE_QUIETEST = 0.2;
/** A burst for a single flip has this many particles; each further point adds some, up to the max. */
export const BURST_BASE_COUNT = 14;
export const BURST_PER_EXTRA_POINT = 6;
export const BURST_MAX_COUNT = 40;
/** The cap's burst: more particles than any flip's, thrown in a wider fan (see particles.ts). */
export const CAP_BURST_COUNT = 64;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * How far an impact at `speed` (m/s) shakes the picture, in pixels: 0 below `shakeMinSpeed` (no
 * shake at all), `SHAKE_QUIETEST` of the cap at that speed, rising in a straight line to
 * `shakeMaxPixels` at `shakeFullSpeed` and staying there for anything harder. So a harder landing
 * always shakes at least as much as a gentler one, and nothing goes over the cap.
 */
export function shakeIntensity(speed: number, tuning: Tuning): number {
  if (!(speed >= tuning.shakeMinSpeed)) return 0;
  const span = tuning.shakeFullSpeed - tuning.shakeMinSpeed;
  const fraction = span > 0 ? clamp01((speed - tuning.shakeMinSpeed) / span) : 1;
  return tuning.shakeMaxPixels * (SHAKE_QUIETEST + (1 - SHAKE_QUIETEST) * fraction);
}

/** The particles in the burst for a landing worth `points`: a bigger flip throws a bigger burst. */
export function burstCount(points: number): number {
  const extra = Math.max(0, Math.round(points) - 1);
  return Math.min(BURST_MAX_COUNT, BURST_BASE_COUNT + BURST_PER_EXTRA_POINT * extra);
}

/**
 * The effects for these events, in order. An impact shakes (unless it is too soft). A throw's
 * outcome pops the message in, and a success also bursts. A throw alone makes none.
 */
export function planEffects(events: readonly SimEvent[], tuning: Tuning): EffectCue[] {
  const cues: EffectCue[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'impact': {
        const intensity = shakeIntensity(event.speed, tuning);
        if (intensity > 0) cues.push({ name: 'shake', intensity, tick: event.tick });
        break;
      }
      case 'outcome':
        cues.push({ name: 'pop', intensity: 1, tick: event.tick });
        if (event.result === 'success' && event.reason === 'cap') {
          cues.push({ name: 'capBurst', intensity: CAP_BURST_COUNT, tick: event.tick });
        } else if (event.result === 'success') {
          cues.push({ name: 'burst', intensity: burstCount(event.points), tick: event.tick });
        }
        break;
      case 'throw':
        break;
    }
  }
  return cues;
}
