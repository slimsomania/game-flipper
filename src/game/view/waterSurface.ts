import {
  BOTTLE_BODY_HEIGHT,
  BOTTLE_BODY_WIDTH,
  BOTTLE_WALL,
  waterRect,
  type Point,
} from '../../core/bottleShape';

/*
 * The water as the player sees it. It is presentation only: the simulation's water (the solid
 * fixture and the sliding body in src/core) decides how the bottle flies and lands, and this file
 * decides how the water looks. The water keeps its volume and its surface stays square to the
 * "apparent gravity" (gravity minus the bottle's acceleration), which lags and wobbles, so a bottle
 * lying on its side has a layer along the table and a landing makes the water slosh.
 */

const G = 9.81;
/** Spring pulling the surface toward the apparent gravity: about 1.6 sloshes per second. */
const SPRING = (2 * Math.PI * 1.6) ** 2;
const DAMPING = 2 * 0.22 * Math.sqrt(SPRING);
/** The bottle's acceleration is clamped so a table hit tilts the water but never flips it over. */
const MAX_ACCEL = 2.5 * G;
/** Smoothing of the speed estimate taken from the drawn poses (seconds). */
const VELOCITY_SMOOTHING = 0.04;
/** A pose that moves farther than this in one frame is a jump (new bottle, replay): start over. */
const JUMP_METERS = 1.5;
const MAX_FRAME = 1 / 20;
const SUBSTEP = 1 / 120;

export interface WaterShape {
  /** Corners of the water, in the bottle's local coordinates (meters). */
  polygon: Point[];
  /** The two ends of the free surface, or null when the body is full. */
  surface: [Point, Point] | null;
}

/** Cut the convex polygon to the points with `n·p >= c`. */
function clip(polygon: readonly Point[], n: Point, c: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const da = n.x * a.x + n.y * a.y - c;
    const db = n.x * b.x + n.y * b.y - c;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function area(polygon: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * The water for a bottle whose "down" (where the water settles) is the unit vector `down`, in the
 * bottle's local coordinates. The volume is the same as the upright fill of `level`, found by
 * bisection on where the surface cuts the body. Null when there is no water.
 */
export function waterShape(level: number, down: Point): WaterShape | null {
  const rect = waterRect(level);
  if (!rect) return null;
  const half = BOTTLE_BODY_WIDTH / 2 - BOTTLE_WALL;
  const inner: Point[] = [
    { x: -half, y: -BOTTLE_BODY_HEIGHT },
    { x: half, y: -BOTTLE_BODY_HEIGHT },
    { x: half, y: -BOTTLE_WALL },
    { x: -half, y: -BOTTLE_WALL },
  ];
  const volume = (rect.y1 - rect.y0) * (rect.x1 - rect.x0);
  if (volume >= area(inner) - 1e-9) return { polygon: inner, surface: null };

  const length = Math.hypot(down.x, down.y) || 1;
  const n = { x: down.x / length, y: down.y / length };
  let lo = Math.min(...inner.map((p) => n.x * p.x + n.y * p.y));
  let hi = Math.max(...inner.map((p) => n.x * p.x + n.y * p.y));
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (area(clip(inner, n, mid)) > volume) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  const polygon = clip(inner, n, c);
  const onSurface = polygon.filter((p) => Math.abs(n.x * p.x + n.y * p.y - c) < 1e-6);
  const surface: [Point, Point] | null =
    onSurface.length >= 2 ? [onSurface[0]!, onSurface[onSurface.length - 1]!] : null;
  return { polygon, surface };
}

/** The water's motion: call `step` every frame with the drawn pose, then read `down`. */
export class WaterMotion {
  /** Direction the water settles toward, in world coordinates (unit length, y down). */
  private sx = 0;
  private sy = 1;
  private svx = 0;
  private svy = 0;
  private px = Number.NaN;
  private py = Number.NaN;
  private vx = 0;
  private vy = 0;

  step(dt: number, x: number, y: number): void {
    const frame = Math.min(dt, MAX_FRAME);
    if (frame <= 0) return;
    if (!Number.isFinite(this.px) || Math.hypot(x - this.px, y - this.py) > JUMP_METERS) {
      this.reset(x, y);
      return;
    }
    const nvx = (x - this.px) / dt;
    const nvy = (y - this.py) / dt;
    this.px = x;
    this.py = y;
    const mix = 1 - Math.exp(-frame / VELOCITY_SMOOTHING);
    const ax = ((nvx - this.vx) * mix) / frame;
    const ay = ((nvy - this.vy) * mix) / frame;
    this.vx += (nvx - this.vx) * mix;
    this.vy += (nvy - this.vy) * mix;
    // Apparent gravity: gravity (down) minus the bottle's acceleration.
    let gx = -ax;
    let gy = G - ay;
    const size = Math.hypot(gx, gy);
    const cap = Math.min(size, MAX_ACCEL + G);
    if (size > 0) {
      gx = (gx / size) * cap;
      gy = (gy / size) * cap;
    }
    // In free fall there is nothing to pull the water, so it keeps its direction.
    const weight = Math.min(1, Math.hypot(gx, gy) / G);
    const ux = size > 1e-6 ? gx / Math.hypot(gx, gy) : this.sx;
    const uy = size > 1e-6 ? gy / Math.hypot(gx, gy) : this.sy;
    let left = frame;
    while (left > 1e-9) {
      const h = Math.min(SUBSTEP, left);
      left -= h;
      this.svx += (SPRING * weight * (ux - this.sx) - DAMPING * this.svx) * h;
      this.svy += (SPRING * weight * (uy - this.sy) - DAMPING * this.svy) * h;
      this.sx += this.svx * h;
      this.sy += this.svy * h;
    }
    const len = Math.hypot(this.sx, this.sy);
    if (len > 1e-6) {
      this.sx /= len;
      this.sy /= len;
    } else {
      this.sx = 0;
      this.sy = 1;
    }
  }

  /** The settling direction in the bottle's local coordinates, for a bottle turned by `angle`. */
  down(angle: number): Point {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotate the world vector by -angle (the bottle's rotation is clockwise positive on screen).
    return { x: this.sx * cos + this.sy * sin, y: -this.sx * sin + this.sy * cos };
  }

  private reset(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.sx = 0;
    this.sy = 1;
    this.svx = 0;
    this.svy = 0;
  }
}
