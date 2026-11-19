import { describe, expect, it } from 'vitest';
import {
  BASE_HALF_WIDTH_PX,
  BURST_STEPS,
  PARTICLE_LIFE_SECONDS,
  burstParticles,
  makeBurst,
} from '../../src/game/effects/particles';
import { COLORS } from '../../src/game/theme';

const X = 640;
const Y = 560;

describe('makeBurst', () => {
  it('has the particles it was asked for, and the same inputs give the same burst', () => {
    const burst = makeBurst(X, Y, 14, 100);
    expect(burst.launches).toHaveLength(14);
    expect(makeBurst(X, Y, 14, 100)).toEqual(burst);
  });

  it('is a different burst for a different tick', () => {
    expect(makeBurst(X, Y, 14, 101).launches).not.toEqual(makeBurst(X, Y, 14, 100).launches);
  });

  it('launches every particle upward, from the bottle, in the theme colors', () => {
    const burst = makeBurst(X, Y, 40, 7);
    for (const launch of burst.launches) {
      expect(launch.vy).toBeLessThan(0);
      expect(COLORS.burst).toContain(launch.color);
      expect(launch.radius).toBeGreaterThan(0);
    }
    const sideways = burst.launches.map((launch) => Math.sign(launch.vx));
    expect(sideways).toContain(1);
    expect(sideways).toContain(-1);
  });

  it('makes no particles for a count of zero or less', () => {
    expect(makeBurst(X, Y, 0, 1).launches).toEqual([]);
    expect(makeBurst(X, Y, -4, 1).launches).toEqual([]);
  });
});

describe('burstParticles', () => {
  const burst = makeBurst(X, Y, 20, 100);

  it('shows nothing before the burst starts', () => {
    expect(burstParticles(burst, 99)).toEqual([]);
  });

  it('starts every particle along the bottle base, fully opaque', () => {
    const particles = burstParticles(burst, 100);
    expect(particles).toHaveLength(20);
    for (const particle of particles) {
      expect(Math.abs(particle.x - X)).toBeLessThanOrEqual(BASE_HALF_WIDTH_PX);
      expect(particle.y).toBeCloseTo(Y, 9);
      expect(particle.alpha).toBe(1);
    }
    const xs = particles.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(BASE_HALF_WIDTH_PX / 2);
  });

  it('flies the particles up and out, so a moment later they are above the base', () => {
    const particles = burstParticles(burst, 106); // 0.1 s
    const above = particles.filter((p) => p.y < Y).length;
    expect(above).toBeGreaterThanOrEqual(particles.length * 0.9);
    expect(Math.min(...particles.map((p) => p.y))).toBeLessThan(Y - 20);
    expect(particles.some((p) => p.x > X + 5)).toBe(true);
    expect(particles.some((p) => p.x < X - 5)).toBe(true);
  });

  it('lets the particles fall back down: they pass their highest point', () => {
    const highest = (tick: number): number =>
      Math.min(...burstParticles(burst, tick).map((p) => p.y));
    expect(highest(112)).toBeLessThan(highest(103));
    const lowestLate = Math.max(...burstParticles(burst, 100 + BURST_STEPS - 1).map((p) => p.y));
    expect(lowestLate).toBeGreaterThan(Math.min(...burstParticles(burst, 112).map((p) => p.y)));
  });

  it('fades the particles out over the second half of their life and shrinks them', () => {
    const first = burstParticles(burst, 100)[0];
    const middle = burstParticles(burst, 100 + Math.floor(BURST_STEPS * 0.5))[0];
    const late = burstParticles(burst, 100 + BURST_STEPS - 1)[0];
    expect(middle.alpha).toBe(1);
    expect(late.alpha).toBeGreaterThan(0);
    expect(late.alpha).toBeLessThan(0.2);
    expect(late.radius).toBeLessThan(first.radius);
  });

  it('is over after its life: nothing is drawn from then on', () => {
    expect(BURST_STEPS).toBe(Math.round(PARTICLE_LIFE_SECONDS * 60));
    expect(burstParticles(burst, 100 + BURST_STEPS - 1).length).toBeGreaterThan(0);
    expect(burstParticles(burst, 100 + BURST_STEPS)).toEqual([]);
    expect(burstParticles(burst, 5000)).toEqual([]);
  });

  it('is gone well within a second, so a snap half a second later sees little of it', () => {
    expect(PARTICLE_LIFE_SECONDS).toBeLessThanOrEqual(0.8);
  });

  it('only depends on the tick (asking twice, or out of order, gives the same particles)', () => {
    const a = burstParticles(burst, 110);
    burstParticles(burst, 130);
    expect(burstParticles(burst, 110)).toEqual(a);
  });
});
