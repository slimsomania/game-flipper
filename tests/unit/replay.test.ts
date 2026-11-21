import { describe, expect, it } from 'vitest';
import { stepsFor } from '../../src/core/constants';
import { ThrowRecorder } from '../../src/core/replay';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING, resolveTuning } from '../../src/core/tuning';

const LEAD = Math.round(DEFAULT_TUNING.replayLeadSeconds * 60);
const TAIL = Math.round(DEFAULT_TUNING.replayTailSeconds * 60);

/** Throw and step to the outcome, collecting the snapshot pose after each step. */
function throwAndRecord(sim: Simulation, power: number) {
  sim.throwBottle(power);
  const poses: { x: number; y: number; angle: number; waterOffset: number; tick: number }[] = [];
  while (sim.phase === 'flying') {
    sim.step();
    const { x, y, angle, waterOffset } = sim.snapshot().bottle;
    poses.push({ x, y, angle, waterOffset, tick: sim.tick });
  }
  return poses;
}

describe('throw recording', () => {
  it('is empty before a throw', () => {
    const sim = new Simulation({ seed: 3 });
    expect(sim.recording).toEqual([]);
    expect(sim.landingClip).toEqual([]);
  });

  it('has one frame per step from release to the outcome, matching the snapshot pose', () => {
    for (const sloshing of [0, 1]) {
      const sim = new Simulation({ seed: 3, tuning: { sloshing } });
      const poses = throwAndRecord(sim, 50);
      expect(sim.phase).toBe('result');
      expect(sim.recording).toEqual(poses);
      expect(poses.length).toBeGreaterThan(30);
    }
  });

  it('stops at the outcome: the bottle moving on during the result adds no frames', () => {
    const sim = new Simulation({ seed: 3 });
    const poses = throwAndRecord(sim, 50);
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.recording.length).toBe(poses.length);
  });

  it('holds at most the timeout’s worth of frames', () => {
    const sim = new Simulation({ seed: 3, tuning: { timeoutSeconds: 1 } });
    // Never lands: hovers far from anything for the whole timeout is not possible, so just
    // check the bound on a throw that the timeout decides.
    const poses = throwAndRecord(sim, 50);
    expect(poses.length).toBeLessThanOrEqual(stepsFor(1));
    expect(sim.recording.length).toBeLessThanOrEqual(stepsFor(1));
    const long = new Simulation({ seed: 5 });
    throwAndRecord(long, 20);
    expect(long.recording.length).toBeLessThanOrEqual(stepsFor(DEFAULT_TUNING.timeoutSeconds));
  });

  it('is cleared when the next bottle appears, and by a restart', () => {
    const sim = new Simulation({ seed: 3 });
    throwAndRecord(sim, 50);
    expect(sim.recording.length).toBeGreaterThan(0);
    sim.skip();
    expect(sim.phase).toBe('aiming');
    expect(sim.recording).toEqual([]);
    expect(sim.landingClip).toEqual([]);

    throwAndRecord(sim, 50);
    sim.restartRound();
    expect(sim.recording).toEqual([]);
  });

  it('is replaced, not appended to, by the next throw', () => {
    const sim = new Simulation({ seed: 3 });
    const first = throwAndRecord(sim, 50);
    sim.skip();
    const second = throwAndRecord(sim, 60);
    expect(sim.recording).toEqual(second);
    expect(sim.recording[0].tick).toBeGreaterThan(first[first.length - 1].tick);
  });
});

describe('landing clip', () => {
  it('starts the lead before the first table contact and ends the tail after it', () => {
    const sim = new Simulation({ seed: 3 });
    // Stand on the table, upright, from just above it, then let the bottle settle: the outcome
    // comes well after the first touch.
    throwAndRecord(sim, 50);
    const all = sim.recording;
    const clip = sim.landingClip;
    expect(clip.length).toBeGreaterThan(0);
    const first =
      all.indexOf(clip[0]) >= 0
        ? all.indexOf(clip[0])
        : all.findIndex((f) => f.tick === clip[0].tick);
    const last = all.findIndex((f) => f.tick === clip[clip.length - 1].tick);
    // Contiguous slice of the recording.
    expect(clip).toEqual(all.slice(first, last + 1));
    // The first contact is `LEAD` frames after the clip's start (unless the recording starts later).
    const contact = first + LEAD;
    if (first > 0) expect(contact).toBeLessThan(all.length);
    expect(last).toBe(Math.min(all.length - 1, contact + TAIL));
  });

  it('is exactly lead + 1 + tail frames when the recording is long enough around the contact', () => {
    const sim = new Simulation({ seed: 3, tuning: { uprightHoldSeconds: 3, failRestSeconds: 3 } });
    throwAndRecord(sim, 50);
    expect(sim.landingClip.length).toBe(LEAD + 1 + TAIL);
  });

  it('follows the tuning', () => {
    const sim = new Simulation({
      seed: 3,
      tuning: {
        uprightHoldSeconds: 3,
        failRestSeconds: 3,
        replayLeadSeconds: 0.1,
        replayTailSeconds: 0.2,
      },
    });
    throwAndRecord(sim, 50);
    expect(sim.landingClip.length).toBe(6 + 1 + 12);
  });

  it('is empty if the bottle never touched the table', () => {
    const sim = new Simulation({ seed: 3 });
    sim.placeBottle({ x: -8, y: 1, angle: 0 });
    while (sim.phase === 'flying') sim.step();
    expect(sim.recording.length).toBeGreaterThan(0);
    expect(sim.landingClip).toEqual([]);
  });
});

describe('ThrowRecorder', () => {
  const pose = { x: 0, y: 0, angle: 0, waterOffset: 0 };

  it('ignores frames while not recording and past the timeout', () => {
    const rec = new ThrowRecorder(() => resolveTuning({ timeoutSeconds: 1 }));
    rec.record(1, pose, false);
    expect(rec.allFrames()).toEqual([]);
    rec.begin();
    for (let i = 1; i <= 100; i++) rec.record(i, pose, false);
    expect(rec.allFrames().length).toBe(60);
    rec.end();
    rec.clear();
    expect(rec.allFrames()).toEqual([]);
  });

  it('keeps the first contact, clamps the clip to the recording and returns copies', () => {
    const rec = new ThrowRecorder(() => resolveTuning());
    rec.begin();
    for (let i = 1; i <= 10; i++) rec.record(i, pose, i === 3 || i === 5);
    const clip = rec.clip();
    expect(clip.map((f) => f.tick)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    clip[0].x = 99;
    expect(rec.allFrames()[0].x).toBe(0);
  });
});
