import { SIM_DT, stepsFor } from './constants';
import type { Tuning } from './tuning';

/** How many simulation steps a replay of `clipLength` frames lasts at `speed` (0 for no clip). */
export function replayStepCount(clipLength: number, speed: number): number {
  if (clipLength <= 0 || !(speed > 0)) return 0;
  return Math.ceil(clipLength / speed);
}

/**
 * The clip frame shown `replayStep` steps into a replay (0 = the first step) at `speed`, or null
 * outside the replay.
 */
export function replayFrameAt(
  clip: readonly ReplayFrame[],
  replayStep: number,
  speed: number,
): ReplayFrame | null {
  if (replayStep < 0 || replayStep >= replayStepCount(clip.length, speed)) return null;
  return clip[Math.min(clip.length - 1, Math.floor(replayStep * speed))];
}

/** The bottle's pose after one simulation step, for replaying the throw. */
export interface ReplayFrame {
  /** The simulation tick (fixed steps simulated so far) this frame was taken at. */
  tick: number;
  x: number;
  y: number;
  angle: number;
  /** How far the water has slid toward the cap, in meters (0 with solid water). */
  waterOffset: number;
}

/** What `ThrowRecorder.record` reads from the bottle each step. */
export type ReplayPose = Omit<ReplayFrame, 'tick'>;

/**
 * Records the current throw: one frame per step from the release to the step that decides the
 * outcome, and where the bottle first touched the table. The landing clip is the slice of frames
 * around that first contact. It holds at most the timeout's worth of frames, and is cleared for
 * the next bottle.
 */
export class ThrowRecorder {
  private frames: ReplayFrame[] = [];
  /** Index in `frames` of the first step with a table contact, or null for none. */
  private contactIndex: number | null = null;
  private recording = false;

  constructor(private readonly tuning: () => Tuning) {}

  /** Forget the last throw and start recording a new one (the bottle was released). */
  begin(): void {
    this.clear();
    this.recording = true;
  }

  /** Stop recording: the outcome is decided. The frames stay until `clear()`. */
  end(): void {
    this.recording = false;
  }

  /** Forget everything (the next bottle appeared). */
  clear(): void {
    this.frames = [];
    this.contactIndex = null;
    this.recording = false;
  }

  /** Add the frame for the step just taken; `touched` says the bottle began touching the table in it. */
  record(tick: number, pose: ReplayPose, touched: boolean): void {
    if (!this.recording || this.frames.length >= stepsFor(this.tuning().timeoutSeconds)) return;
    if (touched && this.contactIndex === null) this.contactIndex = this.frames.length;
    this.frames.push({
      tick,
      x: pose.x,
      y: pose.y,
      angle: pose.angle,
      waterOffset: pose.waterOffset,
    });
  }

  /** Every frame of the throw so far, oldest first (a copy). */
  allFrames(): ReplayFrame[] {
    return this.frames.map((frame) => ({ ...frame }));
  }

  /**
   * The frames from `replayLeadSeconds` before the first table contact to `replayTailSeconds`
   * after it (or the last frame, if the recording ends sooner). Empty if the bottle never touched
   * the table.
   */
  clip(): ReplayFrame[] {
    if (this.contactIndex === null) return [];
    const { replayLeadSeconds, replayTailSeconds } = this.tuning();
    const from = Math.max(0, this.contactIndex - Math.round(replayLeadSeconds / SIM_DT));
    const to = Math.min(
      this.frames.length - 1,
      this.contactIndex + Math.round(replayTailSeconds / SIM_DT),
    );
    return this.frames.slice(from, to + 1).map((frame) => ({ ...frame }));
  }
}
