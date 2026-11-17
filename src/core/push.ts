import { clampPower } from './throw';
import { DEFAULT_TUNING, type Tuning } from './tuning';

/*
 * The mouse push: the pointer samples of a drag become one power value (0 to 100), the same number
 * the power bar holds, so the physics doesn't care which input made it. Only upward movement in the
 * last moments before the release counts, and it counts twice: how far the pointer travelled and
 * how fast it was going. The pointer's path is the straight lines between its samples, so the same
 * motion gives the same power whether the mouse reported it at 60 Hz or at 1000 Hz.
 */

/** One pointer sample: when it was taken (seconds) and where (logical game pixels, y down). */
export interface PushSample {
  t: number;
  y: number;
}

/** The numbers a push reads. */
export type PushTuning = Pick<
  Tuning,
  | 'pushWindowSeconds'
  | 'pushSpeedSpanSeconds'
  | 'pushDistanceWeight'
  | 'pushSpeedWeight'
  | 'pushFullDistance'
  | 'pushFullSpeed'
>;

/** How many places inside the window the speed is measured. Fine enough that the peak is found. */
const SPEED_PROBES = 20;

/**
 * A mouse reports where it is when it moves, so a long gap between two samples means the pointer
 * sat still and then moved. Over a gap longer than this the pointer is taken to stay where it was
 * and to cover the distance in the last stretch before the next sample, so a flick right after a
 * pause isn't smeared over the whole pause. Samples closer together than this (one frame at
 * 60 Hz) are joined by a straight line.
 */
const MAX_BRIDGE_SECONDS = 1 / 60;

/** Less upward movement than this, in logical pixels, is rounding noise, not a push. */
const MIN_DISTANCE = 1e-6;

function fraction(value: number, full: number): number {
  return Math.min(1, Math.max(0, value / full));
}

/**
 * The power of a push, from the pointer `samples` of a drag, oldest first. The newest sample is the
 * release, so calling this while the button is still down gives the live value. Add a sample at the
 * release itself (the pointer's position then) so a pointer that stopped before the release counts
 * as stopped.
 *
 * Over the last `pushWindowSeconds` before the release it measures the net upward distance and the
 * fastest upward speed (over any `pushSpeedSpanSeconds`), each as a fraction of its full-power
 * value (`pushFullDistance`, `pushFullSpeed`), and mixes the two by their weights. Earlier motion
 * is ignored. A pointer that ends no higher than the window began, a single sample and an empty
 * list all give 0. A drag younger than the window counts as still before its first sample.
 */
export function pushPower(
  samples: readonly PushSample[],
  tuning: PushTuning = DEFAULT_TUNING,
): number {
  const points = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.y));
  const latest = points[points.length - 1];
  const windowSeconds = tuning.pushWindowSeconds;
  if (points.length < 2 || !(windowSeconds > 0)) return 0;

  // Keep only what the window can see: its samples and the one just before it, which the path
  // through the window start is drawn from.
  const start = latest.t - windowSeconds;
  let first = points.length - 1;
  while (first > 0 && points[first].t > start) first--;
  const recent = points.slice(first);

  /** The pointer's height at `time`: before the first sample it hasn't moved, after the last it has. */
  const yAt = (time: number): number => {
    if (time <= recent[0].t) return recent[0].y;
    for (let i = 1; i < recent.length; i++) {
      const a = recent[i - 1];
      const b = recent[i];
      if (time > b.t) continue;
      const movedFrom = Math.max(a.t, b.t - MAX_BRIDGE_SECONDS);
      if (time <= movedFrom) return a.y;
      return a.y + ((b.y - a.y) * (time - movedFrom)) / (b.t - movedFrom);
    }
    return latest.y;
  };

  const distance = yAt(start) - latest.y;
  if (!(distance > MIN_DISTANCE)) return 0;

  const span = Math.min(tuning.pushSpeedSpanSeconds, windowSeconds);
  if (!(span > 0)) return 0;
  let speed = 0;
  for (let k = 0; k <= SPEED_PROBES; k++) {
    const a = start + ((windowSeconds - span) * k) / SPEED_PROBES;
    speed = Math.max(speed, (yAt(a) - yAt(a + span)) / span);
  }

  const wd = tuning.pushDistanceWeight;
  const ws = tuning.pushSpeedWeight;
  const mix =
    (wd * fraction(distance, tuning.pushFullDistance) +
      ws * fraction(speed, tuning.pushFullSpeed)) /
    (wd + ws);
  return Number.isFinite(mix) ? clampPower(mix * 100) : 0;
}
