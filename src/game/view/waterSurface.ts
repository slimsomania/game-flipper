import {
  BOTTLE_BODY_HEIGHT,
  BOTTLE_BODY_WIDTH,
  BOTTLE_NECK_HEIGHT,
  BOTTLE_NECK_WIDTH,
  BOTTLE_SHOULDER_HEIGHT,
  BOTTLE_WALL,
  waterRect,
  type Point,
} from '../../core/bottleShape';

/*
 * The water as the player sees it. It is presentation only: the simulation's water (the solid
 * fixture and the sliding body in src/core) decides how the bottle flies and lands, and this file
 * decides how the water looks (D36).
 *
 * The water keeps its volume and fills the inside of the bottle (body, shoulder and neck; the cap
 * is closed) up to a flat surface. The surface is square to the "apparent gravity" felt by the
 * water in the bottle's own frame: gravity minus the bottle's acceleration, plus the centrifugal
 * push of the spin. (The push of a change of spin is left out: the simulation slows the spin with
 * a strong angular damping, a gameplay knob, which would tilt the water in every flight.) A spinning bottle in the air presses its water
 * onto the base (the water is nearer the base than the center of mass), and on the table gravity
 * and the hit make it slosh. A damped spring follows that direction, so the water lags and wobbles.
 */

const G = 9.81;
/** Spring pulling the surface toward the apparent gravity, at 1 g: about 1.6 sloshes per second. */
const SPRING = (2 * Math.PI * 1.6) ** 2;
const DAMPING = 2 * 0.22 * Math.sqrt(SPRING);
/** The spring is this many times stiffer at most (a hard spin pins the water firmly). */
const MAX_PULL = 4;
/** The bottle's acceleration is clamped so a table hit tilts the water but never flips it over. */
const MAX_ACCEL = 2.5 * G;
/**
 * A push weaker than this leaves the water where it is. The simulation slows the bottle in the air
 * (linear and angular damping, gameplay knobs) where a real one would fall freely, and that small
 * push would otherwise tip the water once the spin has died down.
 */
const DEAD_ZONE = 0.3 * G;
/** Smoothing of the acceleration and spin estimates taken from the drawn poses (seconds). */
const SMOOTHING = 0.04;
/**
 * A pose that moves faster than this (m/s) between two steps is a jump, not a motion (a new bottle
 * in the hand, the replay starting or ending): the water starts over. Real throws stay far below.
 */
const JUMP_SPEED = 25;
const MAX_FRAME = 1 / 20;
const SUBSTEP = 1 / 120;

/** The inside of the bottle as convex pieces, base up, in local coordinates (y down). */
const INNER: readonly (readonly Point[])[] = (() => {
  const body = BOTTLE_BODY_WIDTH / 2 - BOTTLE_WALL;
  const neck = BOTTLE_NECK_WIDTH / 2 - BOTTLE_WALL;
  const shoulderBottom = -BOTTLE_BODY_HEIGHT;
  const neckBottom = shoulderBottom - BOTTLE_SHOULDER_HEIGHT;
  const neckTop = neckBottom - BOTTLE_NECK_HEIGHT;
  return [
    [
      { x: -body, y: -BOTTLE_WALL },
      { x: body, y: -BOTTLE_WALL },
      { x: body, y: shoulderBottom },
      { x: -body, y: shoulderBottom },
    ],
    [
      { x: -body, y: shoulderBottom },
      { x: body, y: shoulderBottom },
      { x: neck, y: neckBottom },
      { x: -neck, y: neckBottom },
    ],
    [
      { x: -neck, y: neckBottom },
      { x: neck, y: neckBottom },
      { x: neck, y: neckTop },
      { x: -neck, y: neckTop },
    ],
  ];
})();

export interface WaterShape {
  /** The water in each inner piece that holds some (local coordinates, meters). */
  pieces: Point[][];
  /** The free surface, one segment per piece it crosses (empty when the bottle is full). */
  surface: [Point, Point][];
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

export function polygonArea(polygon: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

const filledArea = (n: Point, c: number): number =>
  INNER.reduce((sum, piece) => sum + polygonArea(clip(piece, n, c)), 0);

/** Area of the upright fill of `level` (the water's volume per meter of depth), 0 when empty. */
export function waterVolume(level: number): number {
  const rect = waterRect(level);
  return rect ? (rect.y1 - rect.y0) * (rect.x1 - rect.x0) : 0;
}

/**
 * The water for a bottle whose "down" (where the water settles) is `down`, in the bottle's local
 * coordinates. The volume is the upright fill of `level`; where the surface cuts the bottle is
 * found by bisection. Null when there is no water.
 */
export function waterShape(level: number, down: Point): WaterShape | null {
  const volume = waterVolume(level);
  if (volume <= 0) return null;
  const length = Math.hypot(down.x, down.y) || 1;
  const n = { x: down.x / length, y: down.y / length };
  const along = INNER.flat().map((p) => n.x * p.x + n.y * p.y);
  let lo = Math.min(...along);
  let hi = Math.max(...along);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (filledArea(n, mid) > volume) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  const pieces: Point[][] = [];
  const surface: [Point, Point][] = [];
  for (const piece of INNER) {
    const wet = clip(piece, n, c);
    if (wet.length < 3 || polygonArea(wet) < 1e-9) continue;
    pieces.push(wet);
    const onSurface = wet.filter((p) => Math.abs(n.x * p.x + n.y * p.y - c) < 1e-6);
    if (onSurface.length >= 2) surface.push([onSurface[0]!, onSurface[onSurface.length - 1]!]);
  }
  return { pieces, surface };
}

/** Where the bottle is drawn: base center in meters and angle in radians (clockwise positive). */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

/**
 * The water's motion. Call `step` with the simulated time since the last call and the drawn pose,
 * then read `down` (local).
 * `centerHeight` is the bottle's center of mass above the base and `waterHeight` the water's
 * centroid above the base, both in meters.
 */
export class WaterMotion {
  /** Direction the water settles toward, in the bottle's local coordinates (unit length). */
  private sx = 0;
  private sy = 1;
  private svx = 0;
  private svy = 0;
  private cx = Number.NaN;
  private cy = Number.NaN;
  private angle = 0;
  /** The last measured speed of the center of mass, and the smoothed acceleration and spin. */
  private vx = 0;
  private vy = 0;
  private ax = 0;
  private ay = 0;
  private omega = 0;
  /**
   * What has been measured since the last start: 0 nothing, 1 a speed, 2 an acceleration. The
   * water only moves from stage 2: a replay starts mid-flight, and reading its speed as a jump from
   * rest (or its free fall as a slow start) would fling the water round the bottle.
   */
  private stage = 0;

  step(dt: number, pose: Pose, centerHeight: number, waterHeight: number): void {
    const frame = Math.min(dt, MAX_FRAME);
    if (frame <= 0) return;
    // The center of mass: from the base, `centerHeight` up the bottle's axis.
    const sin = Math.sin(pose.angle);
    const cos = Math.cos(pose.angle);
    const cx = pose.x + centerHeight * sin;
    const cy = pose.y - centerHeight * cos;
    if (!Number.isFinite(this.cx) || Math.hypot(cx - this.cx, cy - this.cy) > JUMP_SPEED * dt) {
      this.reset(cx, cy, pose.angle);
      return;
    }
    const mix = 1 - Math.exp(-frame / SMOOTHING);
    const nvx = (cx - this.cx) / dt;
    const nvy = (cy - this.cy) / dt;
    const turn = Math.atan2(Math.sin(pose.angle - this.angle), Math.cos(pose.angle - this.angle));
    const nomega = turn / dt;
    this.cx = cx;
    this.cy = cy;
    this.angle = pose.angle;
    const rawAx = (nvx - this.vx) / dt;
    const rawAy = (nvy - this.vy) / dt;
    this.vx = nvx;
    this.vy = nvy;
    if (this.stage === 0) {
      this.omega = nomega;
      this.stage = 1;
      return;
    }
    if (this.stage === 1) {
      this.ax = rawAx;
      this.ay = rawAy;
      this.stage = 2;
    } else {
      this.ax += (rawAx - this.ax) * mix;
      this.ay += (rawAy - this.ay) * mix;
    }
    this.omega += (nomega - this.omega) * mix;
    const { ax, ay } = this;

    // Gravity minus the bottle's acceleration (world), turned into the bottle's frame.
    let gx = -ax;
    let gy = G - ay;
    const linear = Math.hypot(gx, gy);
    if (linear > MAX_ACCEL + G) {
      gx = (gx / linear) * (MAX_ACCEL + G);
      gy = (gy / linear) * (MAX_ACCEL + G);
    }
    const ux = gx * cos + gy * sin;
    let uy = -gx * sin + gy * cos;
    // The water's offset from the center of mass, along the axis (positive y: toward the base).
    const r = centerHeight - waterHeight;
    // Centrifugal push away from the center of mass.
    uy += this.omega * this.omega * r;

    const size = Math.hypot(ux, uy);
    // In free fall with no spin nothing pulls the water, so it keeps its direction.
    const pull = Math.min(MAX_PULL, Math.max(0, size - DEAD_ZONE) / G);
    let tx = size > 1e-6 ? ux / size : this.sx;
    let ty = size > 1e-6 ? uy / size : this.sy;
    if (tx * this.sx + ty * this.sy < -0.95) {
      // Pulled straight away from where it lies (a bottle turned upside down): a balance the
      // water would not keep. A small sideways nudge lets it fall one way.
      tx -= 0.3 * this.sy;
      ty += 0.3 * this.sx;
    }
    const damping = DAMPING * Math.max(0.3, Math.sqrt(pull));
    let left = frame;
    while (left > 1e-9) {
      const h = Math.min(SUBSTEP, left);
      left -= h;
      this.svx += (SPRING * pull * (tx - this.sx) - damping * this.svx) * h;
      this.svy += (SPRING * pull * (ty - this.sy) - damping * this.svy) * h;
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

  /** The settling direction in the bottle's local coordinates (unit length). */
  down(): Point {
    return { x: this.sx, y: this.sy };
  }

  /** Forget the motion: the next `step` starts over from the pose it is given. */
  restart(): void {
    this.cx = Number.NaN;
  }

  private reset(cx: number, cy: number, angle: number): void {
    this.cx = cx;
    this.cy = cy;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.omega = 0;
    this.stage = 0;
    // On the base: a bottle appears upright in the hand, and a replay starts in a spinning flight.
    this.sx = 0;
    this.sy = 1;
    this.svx = 0;
    this.svy = 0;
  }
}
