import { describe, expect, it } from 'vitest';
import { replayFrameAt, replayStepCount } from '../../src/core/replay';
import { stepsFor } from '../../src/core/constants';
import { REPLAY_SPEED } from '../../src/core/tuning';
import { FLIPPED } from '../shared';
import { judged, run } from './helpers';

const ON = { replaySpeed: REPLAY_SPEED };

describe('replay timing (F027)', () => {
  it('the default replay speed is 0.4', () => {
    expect(REPLAY_SPEED).toBe(0.4);
  });

  it('replayStepCount: clip length divided by the speed, rounded up; none without a clip or speed', () => {
    expect(replayStepCount(40, 0.4)).toBe(100);
    expect(replayStepCount(41, 0.4)).toBe(103);
    expect(replayStepCount(0, 0.4)).toBe(0);
    expect(replayStepCount(40, 0)).toBe(0);
  });

  it('replayFrameAt walks through the clip at the replay speed and is null outside it', () => {
    const clip = [0, 1, 2, 3].map((tick) => ({ tick, x: 0, y: 0, angle: 0, waterOffset: 0 }));
    expect(replayFrameAt(clip, -1, 0.5)).toBeNull();
    expect(replayFrameAt(clip, 0, 0.5)?.tick).toBe(0);
    expect(replayFrameAt(clip, 2, 0.5)?.tick).toBe(1);
    expect(replayFrameAt(clip, 7, 0.5)?.tick).toBe(3);
    expect(replayFrameAt(clip, 8, 0.5)).toBeNull();
    expect(replayFrameAt([], 0, 0.5)).toBeNull();
  });

  it('the result phase lasts the result delay plus the clip length divided by the speed', () => {
    const sim = judged(FLIPPED, { tuning: ON });
    const clip = sim.landingClip.length;
    expect(clip).toBeGreaterThan(0);
    const total = stepsFor(1) + replayStepCount(clip, REPLAY_SPEED);
    expect(run(sim, total - 1).phase).toBe('result');
    expect(run(sim, 1).phase).toBe('aiming');
  });

  it('with no clip (replay off) the result lasts just the result delay', () => {
    const off = judged(FLIPPED, { tuning: { replaySpeed: 0 } });
    expect(run(off, stepsFor(1) - 1).phase).toBe('result');
    expect(run(off, 1).phase).toBe('aiming');
    expect(off.snapshot().replay).toBeNull();
  });

  it('the snapshot carries a replay frame only after the delay, and it is cleared with the result', () => {
    const sim = judged(FLIPPED, { tuning: ON });
    expect(sim.snapshot().replay).toBeNull();
    run(sim, stepsFor(1) - 1);
    expect(sim.snapshot().replay).toBeNull();
    run(sim, 1);
    const first = sim.snapshot().replay;
    expect(first).toEqual(sim.landingClip[0]);
    run(sim, 20);
    const later = sim.snapshot().replay!;
    expect(later.tick).toBeGreaterThan(first!.tick);
    sim.skip();
    expect(sim.snapshot().replay).toBeNull();
  });

  it('a skip during the replay brings the next bottle at once', () => {
    const sim = judged(FLIPPED, { tuning: ON });
    run(sim, stepsFor(1) + 5);
    expect(sim.snapshot().replay).not.toBeNull();
    expect(sim.skip()).toBe(true);
    expect(sim.phase).toBe('aiming');
  });
});
