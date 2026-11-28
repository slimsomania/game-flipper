import { stepsFor } from './constants';
import { replayFrameAt, replayStepCount, type ReplayFrame } from './replay';
import type { Tuning } from './tuning';

/**
 * The wait after a throw is judged (D15): the result delay and then the slow-motion landing replay.
 * Its length is fixed when the outcome is set, from the tuning at that moment.
 */
export class ResultWait {
  /** Steps since the outcome was decided. */
  steps = 0;
  private delaySteps = 0;
  private replaySpeed = 1;
  private totalSteps = 0;
  /** The landing clip taken when the outcome was decided; it is replayed after the delay. */
  private clip: ReplayFrame[] = [];

  begin(tuning: Tuning, clip: ReplayFrame[]): void {
    this.clip = clip;
    this.steps = 0;
    this.delaySteps = stepsFor(tuning.resultDelaySeconds);
    this.replaySpeed = tuning.replaySpeed;
    this.totalSteps = this.delaySteps + replayStepCount(clip.length, this.replaySpeed);
  }

  /** Count one step; true once the whole wait has passed. */
  step(): boolean {
    this.steps++;
    return this.steps >= this.totalSteps;
  }

  /** The replay frame to draw now, or null (during the delay, or with no clip). */
  frame(): ReplayFrame | null {
    return replayFrameAt(this.clip, this.steps - this.delaySteps, this.replaySpeed);
  }

  clear(): void {
    this.clip = [];
  }
}
