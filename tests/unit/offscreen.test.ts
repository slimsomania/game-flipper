import { describe, expect, it } from 'vitest';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { BOTTLE_BODY_WIDTH, BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { WORLD_WIDTH_M } from '../../src/core/constants';
import { OFFSCREEN_MARKER_MARGIN, offscreenMarker } from '../../src/core/offscreen';
import { Simulation } from '../../src/core/simulation';

describe('offscreenMarker', () => {
  it('is null for a bottle fully on screen: held, standing, or with its cap just at the top', () => {
    expect(offscreenMarker(HAND_X, HAND_Y, 0)).toBeNull();
    expect(offscreenMarker(5, BOTTLE_HEIGHT, 0)).toBeNull(); // the cap touches y = 0
  });

  it('shows, faint, when only the top of the bottle is cut off', () => {
    const marker = offscreenMarker(4, BOTTLE_HEIGHT - 0.2, 0);
    expect(marker).toMatchObject({ x: 4, height: 0, hidden: false });
  });

  it('shows, solid, with the height of the bottle’s lowest point when it is all above the screen', () => {
    const marker = offscreenMarker(4, -1.5, 0); // the base is 1.5 m above the top edge
    expect(marker?.hidden).toBe(true);
    expect(marker?.x).toBeCloseTo(4, 9);
    expect(marker?.height).toBeCloseTo(1.5, 9);
  });

  it('follows the middle of a turned bottle, and stays inside the screen near the edges', () => {
    const lying = offscreenMarker(4, -2, Math.PI / 2); // lying on its side
    expect(lying).not.toBeNull();
    expect(Math.abs(lying!.x - 4)).toBeCloseTo(BOTTLE_HEIGHT / 2, 1);
    expect(offscreenMarker(-3, -1, 0)?.x).toBe(OFFSCREEN_MARKER_MARGIN);
    expect(offscreenMarker(WORLD_WIDTH_M + 3, -1, 0)?.x).toBe(
      WORLD_WIDTH_M - OFFSCREEN_MARKER_MARGIN,
    );
    expect(offscreenMarker(4, -1, 0)!.x).toBeGreaterThan(4 - BOTTLE_BODY_WIDTH);
  });

  // Design section 2 (2026-11-22): flying above the screen is not a fail; only the landing counts.
  it('a bottle that flies above the screen and lands upright on the table is a success', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.1);
    // A 10% double flip from the sweep: the middle of the powers that land upright after two turns.
    const doubles = Array.from({ length: 101 }, (_, p) => p).filter((p) => {
      const probe = new Simulation({ seed: 1 });
      probe.setWater(0.1);
      probe.throwBottle(p);
      for (let i = 0; i < 400 && probe.phase === 'flying'; i++) probe.step();
      const { outcome } = probe.snapshot();
      return outcome?.result === 'success' && outcome.turns === 2;
    });
    const power = doubles[Math.floor(doubles.length / 2)];
    expect(power).toBeDefined();
    sim.throwBottle(power!);
    let seenHidden = false;
    for (let i = 0; i < 400 && sim.phase === 'flying'; i++) {
      sim.step();
      const { x, y, angle } = sim.snapshot().bottle;
      if (offscreenMarker(x, y, angle)?.hidden) seenHidden = true;
    }
    expect(seenHidden, 'the whole bottle was above the screen for a moment').toBe(true);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'success', turns: 2 });
  });

  it('shows during a full-power throw of a nearly empty bottle, and not once it has landed', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.1);
    sim.throwBottle(100);
    let seenHidden = false;
    for (let i = 0; i < 600 && sim.phase === 'flying'; i++) {
      sim.step();
      const { x, y, angle } = sim.snapshot().bottle;
      if (offscreenMarker(x, y, angle)?.hidden) seenHidden = true;
    }
    expect(seenHidden).toBe(true);
    const { x, y, angle } = sim.snapshot().bottle;
    expect(offscreenMarker(x, y, angle)).toBeNull();
  });
});
