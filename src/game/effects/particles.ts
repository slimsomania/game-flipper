import { BOTTLE_BODY_WIDTH } from '../../core/bottleShape';
import { PIXELS_PER_METER, SIM_HZ } from '../../core/constants';
import { createRng } from '../../core/rng';
import { COLORS } from '../theme';

/*
 * The burst of small particles on a success, as a pure function of simulation ticks (like the
 * shake): the same burst always flies the same way, freezes with the game, and a test or snap that
 * steps the simulation sees an exact frame of it. Each particle's launch is drawn once from a
 * seeded generator when the burst starts; after that its place is plain ballistic motion.
 * Positions are in logical pixels, y pointing down.
 */

/** How long a particle lives, in seconds. */
export const PARTICLE_LIFE_SECONDS = 0.7;
/** The burst fans out upward within this many degrees either side of straight up. */
const FAN_DEGREES = 70;
/** The cap's burst fans out wider. */
export const CAP_FAN_DEGREES = 88;
const SPEED_MIN = 240;
const SPEED_MAX = 580;
/** Pixels per second squared: falls back down like the bottle does, only a little lighter. */
const GRAVITY = 1100;
const RADIUS_MIN = 4;
const RADIUS_MAX = 8;
/**
 * A particle starts anywhere along the bottle's base, this many pixels either side of its middle:
 * half the body's width, so the burst follows the shape (F034 made the bottle slimmer).
 */
export const BASE_HALF_WIDTH_PX = (BOTTLE_BODY_WIDTH * PIXELS_PER_METER) / 2;
/** A particle is fully opaque for this fraction of its life, then fades out. */
const SOLID_FRACTION = 0.5;

interface Launch {
  /** Where along the base it starts, in pixels either side of the burst's x. */
  offset: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
}

export interface Burst {
  /** The tick the burst began at. */
  tick: number;
  /** Where it began, in pixels: the middle of the bottle's base. */
  x: number;
  y: number;
  launches: readonly Launch[];
}

/** A particle to draw right now. */
export interface Particle {
  x: number;
  y: number;
  radius: number;
  color: number;
  /** 0 to 1. */
  alpha: number;
}

/** The steps a burst lasts; it is over (and nothing of it is drawn) from this age on. */
export const BURST_STEPS = Math.round(PARTICLE_LIFE_SECONDS * SIM_HZ);

/** Start a burst of `count` particles at (`x`, `y`) pixels on `tick`. The same inputs give the same burst. */
export function makeBurst(
  x: number,
  y: number,
  count: number,
  tick: number,
  fanDegrees: number = FAN_DEGREES,
): Burst {
  const rng = createRng(tick * 7919 + Math.round(count));
  const launches: Launch[] = [];
  for (let i = 0; i < Math.max(0, Math.round(count)); i++) {
    const angle = ((rng.range(-fanDegrees, fanDegrees) - 90) * Math.PI) / 180;
    const speed = rng.range(SPEED_MIN, SPEED_MAX);
    launches.push({
      offset: rng.range(-BASE_HALF_WIDTH_PX, BASE_HALF_WIDTH_PX),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: rng.range(RADIUS_MIN, RADIUS_MAX),
      color: COLORS.burst[rng.int(0, COLORS.burst.length - 1)],
    });
  }
  return { tick, x, y, launches };
}

/**
 * The burst's particles at `tick`: none before it starts or once it is over. They shrink as they
 * age and fade away over the last half of their life.
 */
export function burstParticles(burst: Burst, tick: number): Particle[] {
  const age = tick - burst.tick;
  if (age < 0 || age >= BURST_STEPS) return [];
  const t = age / SIM_HZ;
  const life = age / BURST_STEPS;
  const fade = life <= SOLID_FRACTION ? 1 : 1 - (life - SOLID_FRACTION) / (1 - SOLID_FRACTION);
  return burst.launches.map((launch) => ({
    x: burst.x + launch.offset + launch.vx * t,
    y: burst.y + launch.vy * t + 0.5 * GRAVITY * t * t,
    radius: launch.radius * (1 - 0.5 * life),
    color: launch.color,
    alpha: fade,
  }));
}
