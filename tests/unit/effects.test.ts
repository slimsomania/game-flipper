import { describe, expect, it } from 'vitest';
import { PIXELS_PER_METER } from '../../src/core/constants';
import type { SimEvent } from '../../src/core/events';
import { Simulation } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { shakeIntensity } from '../../src/game/effects/effectPlan';
import { BASE_HALF_WIDTH_PX, BURST_STEPS } from '../../src/game/effects/particles';
import { Effects } from '../../src/game/effects/effects';
import { FLIPPED, SIDE, UPRIGHT } from '../shared';
import { placed, run, runToOutcome } from './helpers';

/*
 * The effects fed with the events of a real simulation: a bottle dropped from a height hits the
 * table at about sqrt(2 g h) plus whatever speed it was given, which is how a hard landing and a
 * gentle one are made here.
 */

const T = DEFAULT_TUNING;

/** Drop an upright bottle (no turns credited, so it is a fail in the end) from `height` m with `vy` m/s. */
const dropped = (height: number, vy = 0): Simulation =>
  placed({ x: TABLE_CENTER_X, y: TABLE_TOP_Y - height, angle: 0, vy });

/** Step until `ticks` and collect every event on the way, like a scene draining once per frame. */
function eventsFor(sim: Simulation, ticks: number): SimEvent[] {
  run(sim, ticks);
  return sim.drainEvents();
}

const base = (sim: Simulation) => sim.snapshot().bottle;

describe('Effects with the events of a simulation', () => {
  it('shakes harder for a hard landing than for a gentle one, both within the cap', () => {
    const firstShake = (sim: Simulation) => {
      const cues = new Effects().handle(eventsFor(sim, 30), base(sim), T);
      return cues.find((cue) => cue.name === 'shake')!;
    };
    const gentleShake = firstShake(dropped(0.2));
    const hardShake = firstShake(dropped(0.05, 7));
    expect(gentleShake).toBeDefined();
    expect(hardShake).toBeDefined();
    expect(hardShake.intensity).toBeGreaterThan(gentleShake.intensity);
    expect(gentleShake.intensity).toBeGreaterThan(0);
    expect(hardShake.intensity).toBeLessThanOrEqual(T.shakeMaxPixels);
    expect(gentleShake.intensity).toBeLessThanOrEqual(T.shakeMaxPixels);
  });

  it('gives a shake whose intensity is the impact speed through the shake curve', () => {
    const sim = dropped(0.05, 7);
    const events = eventsFor(sim, 30);
    const impact = events.find((event) => event.type === 'impact');
    expect(impact?.type).toBe('impact');
    if (impact?.type !== 'impact') return;
    const cues = new Effects().handle(events, base(sim), T);
    const shake = cues.find((cue) => cue.name === 'shake')!;
    expect(shake.tick).toBe(impact.tick);
    expect(shake.intensity).toBeCloseTo(shakeIntensity(impact.speed, T), 9);
  });

  it('shakes nothing for a bottle standing still: in the hand, or resting on the table', () => {
    const hand = new Simulation({ seed: 1 });
    expect(new Effects().handle(eventsFor(hand, 120), base(hand), T)).toEqual([]);

    // Resting on the tabletop with no speed: whatever touch it makes is far under the minimum.
    const resting = placed({ x: TABLE_CENTER_X, y: TABLE_TOP_Y, angle: 0 });
    const cues = new Effects().handle(eventsFor(resting, 25), base(resting), T);
    expect(cues.filter((cue) => cue.name === 'shake')).toEqual([]);
  });

  it('moves the camera after a hard landing and has it back at rest after the shake seconds', () => {
    const sim = dropped(0.05, 7);
    const effects = new Effects();
    const events = eventsFor(sim, 20);
    const impact = events.find((event) => event.type === 'impact')!;
    effects.handle(events, base(sim), T);
    const during = Array.from({ length: 6 }, (_, i) => effects.cameraOffset(impact.tick + 1 + i));
    expect(during.some((offset) => Math.abs(offset.x) > 0.1 || Math.abs(offset.y) > 0.1)).toBe(
      true,
    );
    for (const offset of during) {
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(T.shakeMaxPixels);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(T.shakeMaxPixels);
    }
    expect(effects.cameraOffset(impact.tick + Math.round(T.shakeSeconds * 60))).toEqual({
      x: 0,
      y: 0,
    });
    expect(effects.cameraOffset(impact.tick + 30)).toEqual({ x: 0, y: 0 });
  });

  it('bursts at the base of a bottle that lands, with particles in the air then and none later', () => {
    const sim = placed(FLIPPED);
    runToOutcome(sim);
    const effects = new Effects();
    const snapshot = sim.snapshot();
    const cues = effects.handle(sim.drainEvents(), snapshot.bottle, T);
    expect(cues.map((cue) => cue.name)).toContain('burst');
    const outcomeTick = snapshot.tick;

    const now = effects.particles(outcomeTick + 3);
    expect(now.length).toBeGreaterThan(0);
    const bx = snapshot.bottle.x * PIXELS_PER_METER;
    const by = snapshot.bottle.y * PIXELS_PER_METER;
    for (const particle of now) {
      // Within the width of the base and what a fast particle covers in three steps.
      expect(Math.abs(particle.x - bx)).toBeLessThan(BASE_HALF_WIDTH_PX + 40);
      expect(Math.abs(particle.y - by)).toBeLessThan(40);
    }
    // 0.5 s later the burst is nearly over; a little after its life there is nothing.
    expect(effects.particles(outcomeTick + BURST_STEPS).length).toBe(0);
  });

  it('makes no burst for a fail, and no particles', () => {
    for (const pose of [UPRIGHT, SIDE]) {
      const sim = placed(pose);
      runToOutcome(sim);
      const effects = new Effects();
      const snapshot = sim.snapshot();
      expect(snapshot.outcome?.result).toBe('fail');
      const cues = effects.handle(sim.drainEvents(), snapshot.bottle, T);
      expect(cues.map((cue) => cue.name)).not.toContain('burst');
      expect(cues.map((cue) => cue.name)).toContain('pop');
      expect(effects.particles(snapshot.tick + 2)).toEqual([]);
    }
  });

  it('makes a bigger burst for a double flip than for a single', () => {
    const count = (turns: number): number => {
      const sim = placed({ ...UPRIGHT, turns });
      runToOutcome(sim);
      const cues = new Effects().handle(sim.drainEvents(), base(sim), T);
      return cues.find((cue) => cue.name === 'burst')!.intensity;
    };
    expect(count(2)).toBeGreaterThan(count(1));
  });

  it('forgets everything on clear: no shake, no particles', () => {
    const sim = placed(FLIPPED);
    run(sim, 25);
    const effects = new Effects();
    const events = sim.drainEvents();
    effects.handle(events, base(sim), T);
    runToOutcome(sim);
    effects.handle(sim.drainEvents(), base(sim), T);
    effects.clear();
    const tick = sim.snapshot().tick;
    expect(effects.particles(tick + 1)).toEqual([]);
    expect(effects.cameraOffset(tick + 1)).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic: the same events give the same offsets and particles', () => {
    const run1 = (): unknown => {
      const sim = placed(FLIPPED);
      runToOutcome(sim);
      const effects = new Effects();
      effects.handle(sim.drainEvents(), base(sim), T);
      const tick = sim.snapshot().tick;
      return [effects.cameraOffset(tick - 20), effects.particles(tick + 5)];
    };
    expect(run1()).toEqual(run1());
  });
});
