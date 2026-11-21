import type { Tuning } from './tuning';

/*
 * The bottle's shape and mass, as plain geometry with no physics engine. The physics body
 * (bottle.ts) and the drawing (src/game/view/bottleView.ts) both build from these numbers, so
 * what you see is what is simulated.
 *
 * Local coordinates, in meters: the origin is the center of the flat base, x points right and y
 * points down like the screen, so the bottle extends toward negative y. The base is the line
 * y = 0 and the cap is the highest point, at y = -BOTTLE_HEIGHT.
 */

export interface Point {
  x: number;
  y: number;
}

/*
 * The proportions are a calibration lever, and a look: the bottle has to read as a plastic water
 * bottle (design section 3), so it is at least 1.8 times as tall as it is wide (`bottle.test.ts`
 * locks that, and a visible neck, shoulder and cap, as minimums). F009 made it squat on purpose
 * (1.0 m wide, 1.13 m tall, a 6 cm neck: 1.13:1) because a wide, low bottle tips back onto its
 * base from a much larger landing angle than a tall thin one, which is what gives a single flip a
 * window of powers; it looked like a jar. F034 (D23) made it 0.80 m wide and 1.48 m tall (1.85:1)
 * with a real neck and retuned the throw to the same targets. The F002 shape (0.66 by 1.74 m,
 * 2.6:1) gives single windows only 3 to 4 powers wide. Change the proportions only together with
 * a look at the flip-windows table (`npx tsx scripts/flip-windows.ts`) and `calibration.test.ts`.
 */

/** Straight-sided body, from the flat base up to where the shoulder starts. */
export const BOTTLE_BODY_WIDTH = 0.8;
export const BOTTLE_BODY_HEIGHT = 0.95;
/** The shoulder narrows from the body width to the neck width. */
export const BOTTLE_SHOULDER_HEIGHT = 0.28;
export const BOTTLE_NECK_WIDTH = 0.25;
export const BOTTLE_NECK_HEIGHT = 0.12;
/** The cap is a little wider than the neck. */
export const BOTTLE_CAP_WIDTH = 0.3;
export const BOTTLE_CAP_HEIGHT = 0.13;
/** Thickness of the plastic wall: the water sits inside it. */
export const BOTTLE_WALL = 0.03;

export const BOTTLE_HEIGHT =
  BOTTLE_BODY_HEIGHT + BOTTLE_SHOULDER_HEIGHT + BOTTLE_NECK_HEIGHT + BOTTLE_CAP_HEIGHT;

export type BottlePartName = 'body' | 'shoulder' | 'neck' | 'cap';

/** One convex piece of the bottle's outline. The pieces together make the silhouette. */
export interface BottlePart {
  name: BottlePartName;
  vertices: readonly Point[];
}

/** A box centered on x = 0 between two heights above the base (`bottom` < `top`). */
function slab(name: BottlePartName, width: number, bottom: number, top: number): BottlePart {
  const half = width / 2;
  return {
    name,
    vertices: [
      { x: -half, y: -bottom },
      { x: half, y: -bottom },
      { x: half, y: -top },
      { x: -half, y: -top },
    ],
  };
}

const SHOULDER_BOTTOM = BOTTLE_BODY_HEIGHT;
const NECK_BOTTOM = SHOULDER_BOTTOM + BOTTLE_SHOULDER_HEIGHT;
const CAP_BOTTOM = NECK_BOTTOM + BOTTLE_NECK_HEIGHT;

/** The four convex pieces, from the base up: body, shoulder, neck, cap. */
export const BOTTLE_PARTS: readonly BottlePart[] = [
  slab('body', BOTTLE_BODY_WIDTH, 0, BOTTLE_BODY_HEIGHT),
  {
    name: 'shoulder',
    vertices: [
      { x: -BOTTLE_BODY_WIDTH / 2, y: -SHOULDER_BOTTOM },
      { x: BOTTLE_BODY_WIDTH / 2, y: -SHOULDER_BOTTOM },
      { x: BOTTLE_NECK_WIDTH / 2, y: -NECK_BOTTOM },
      { x: -BOTTLE_NECK_WIDTH / 2, y: -NECK_BOTTOM },
    ],
  },
  slab('neck', BOTTLE_NECK_WIDTH, NECK_BOTTOM, CAP_BOTTOM),
  slab('cap', BOTTLE_CAP_WIDTH, CAP_BOTTOM, BOTTLE_HEIGHT),
];

/** A water fill thinner than this (in meters) doesn't exist: the body is treated as empty. */
const MIN_WATER_HEIGHT = 0.005;

/**
 * The water as a rectangle inside the body (local coordinates, `y0` the top and `y1` the bottom).
 * The level is the filled fraction of the body height, from the base to where the shoulder
 * starts, so the surface sits at `level * BOTTLE_BODY_HEIGHT` above the base. Returns null when
 * there is no water to speak of.
 */
export function waterRect(
  level: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const clamped = Math.min(1, Math.max(0, level));
  const top = -clamped * BOTTLE_BODY_HEIGHT;
  const bottom = -BOTTLE_WALL;
  if (bottom - top < MIN_WATER_HEIGHT) return null;
  const half = BOTTLE_BODY_WIDTH / 2 - BOTTLE_WALL;
  return { x0: -half, y0: top, x1: half, y1: bottom };
}

/** Vertices of the water rectangle, or null when empty. */
export function waterVertices(level: number): Point[] | null {
  const rect = waterRect(level);
  if (!rect) return null;
  return [
    { x: rect.x0, y: rect.y1 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x0, y: rect.y0 },
  ];
}

/**
 * The water fill when it has slid `offset` meters from the base toward the cap (sloshing). The
 * offset is clamped to [0, the empty height above the water], so the fill always stays inside the
 * body. With offset 0 this is exactly `waterVertices(level)`.
 */
export function slidWaterVertices(level: number, offset: number): Point[] | null {
  const vertices = waterVertices(level);
  if (!vertices) return null;
  const clampedLevel = Math.min(1, Math.max(0, level));
  const limit = Math.max(0, (1 - clampedLevel) * BOTTLE_BODY_HEIGHT - BOTTLE_WALL);
  const dy = -Math.min(limit, Math.max(0, Number.isFinite(offset) ? offset : 0));
  return vertices.map((p) => ({ x: p.x, y: p.y + dy }));
}

/** Area and centroid of a simple polygon (shoelace formula). */
function polygonAreaAndCentroid(vertices: readonly Point[]): {
  area: number;
  cx: number;
  cy: number;
} {
  let twiceArea = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    sx += (a.x + b.x) * cross;
    sy += (a.y + b.y) * cross;
  }
  return { area: Math.abs(twiceArea) / 2, cx: sx / (3 * twiceArea), cy: sy / (3 * twiceArea) };
}

export interface BottleMassProperties {
  /** Mass of the shell plus the water. */
  mass: number;
  /** Height of the center of mass above the base, in meters. */
  centerHeight: number;
}

/**
 * Mass and center of mass of the bottle with the given water level, computed from the same
 * geometry the physics body is built from. The water is extra mass filling the body from the
 * base up to the level.
 */
export function bottleMassProperties(
  level: number,
  tuning: Pick<Tuning, 'shellDensity' | 'waterDensity'>,
): BottleMassProperties {
  let mass = 0;
  let moment = 0; // sum of mass * height above the base
  const add = (vertices: readonly Point[], density: number): void => {
    const { area, cy } = polygonAreaAndCentroid(vertices);
    mass += area * density;
    moment += area * density * -cy;
  };
  for (const part of BOTTLE_PARTS) add(part.vertices, tuning.shellDensity);
  const water = waterVertices(level);
  if (water) add(water, tuning.waterDensity);
  return { mass, centerHeight: moment / mass };
}
