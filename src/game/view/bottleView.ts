import type Phaser from 'phaser';
import { BOTTLE_PARTS, bottleMassProperties, waterRect, type Point } from '../../core/bottleShape';
import { PIXELS_PER_METER, SIM_DT } from '../../core/constants';
import type { BottleSnapshot } from '../../core/simulation';
import { DEFAULT_TUNING } from '../../core/tuning';
import { COLORS } from '../theme';
import { bakedTexture } from './bakedGraphics';
import { WaterMotion, waterShape } from './waterSurface';

/** Opacity of the plastic: the table and the background show through a little. */
const SHELL_ALPHA = 0.55;
const WATER_ALPHA = 0.92;
const SURFACE_LINE_PX = 3;
/** Room around the baked shell so its antialiased edge isn't cut. */
const SHELL_PAD_PX = 2;
/** More simulation steps than this between two draws means the water starts over. */
const MAX_STEPS_BETWEEN_DRAWS = 30;

/** The bottle's name in the scene, for the test hook. */
export const BOTTLE_NAME = 'bottle';

/** The pose the bottle view last drew: base center in game pixels, angle in radians. */
export interface DrawnBottle {
  x: number;
  y: number;
  angle: number;
}

/** What the hook reports: the bottle as last drawn. */
export function drawnBottle(scene: Phaser.Scene): DrawnBottle | null {
  const bottle = scene.children.getByName(BOTTLE_NAME) as Phaser.GameObjects.Container | null;
  return bottle ? { x: bottle.x, y: bottle.y, angle: bottle.rotation } : null;
}

export interface BottleView {
  /**
   * Move the bottle to the snapshot's pose and redraw the water. `tick` is the simulation step the
   * pose belongs to (the replay frame's own tick during the replay): the water moves in simulated
   * time, so it holds still while the game is paused and slows down with the replay.
   */
  update(bottle: BottleSnapshot, tick: number): void;
}

const toPixels = (points: readonly Point[]): Point[] =>
  points.map((p) => ({ x: p.x * PIXELS_PER_METER, y: p.y * PIXELS_PER_METER }));

/**
 * Draw the bottle from the shape in src/core/bottleShape.ts (the same pieces the physics body is
 * built from): a translucent blue shell, a lighter cap and a blue water fill. The water's volume
 * comes from the snapshot's `water` level and its surface moves as in waterSurface.ts (D36).
 * Nothing here is text: the player reads the level from the fill alone.
 */
export function createBottleView(scene: Phaser.Scene): BottleView {
  // The shell never changes: it is drawn once into a texture (see bakedGraphics.ts).
  const all = BOTTLE_PARTS.flatMap((part) => toPixels(part.vertices));
  const minX = Math.floor(Math.min(...all.map((p) => p.x))) - SHELL_PAD_PX;
  const minY = Math.floor(Math.min(...all.map((p) => p.y))) - SHELL_PAD_PX;
  const maxX = Math.ceil(Math.max(...all.map((p) => p.x))) + SHELL_PAD_PX;
  const maxY = Math.ceil(Math.max(...all.map((p) => p.y))) + SHELL_PAD_PX;
  const shell = scene.add
    .image(
      minX,
      minY,
      bakedTexture(scene, 'bottleShell', maxX - minX, maxY - minY, (g) => {
        for (const part of BOTTLE_PARTS) {
          if (part.name === 'cap') g.fillStyle(COLORS.cap, 1);
          else g.fillStyle(COLORS.bottle, SHELL_ALPHA);
          g.fillPoints(
            toPixels(part.vertices).map((p) => ({ x: p.x - minX, y: p.y - minY })),
            true,
          );
        }
      }),
    )
    .setOrigin(0, 0);

  const water = scene.add.graphics();
  // The container carries the pose; both graphics are drawn in the bottle's local coordinates.
  const container = scene.add.container(0, 0, [shell, water]).setName(BOTTLE_NAME);
  const motion = new WaterMotion();
  // Heights above the base of the center of mass and of the water's centroid, per water level.
  // The densities are the default tuning's: the drawing only needs them roughly.
  let heightsLevel = Number.NaN;
  let centerHeight = 0;
  let waterHeight = 0;
  let lastTick = Number.NaN;

  return {
    update(bottle, tick) {
      container
        .setPosition(bottle.x * PIXELS_PER_METER, bottle.y * PIXELS_PER_METER)
        .setRotation(bottle.angle);
      // A tick going back (the replay starting) or far ahead, or another water level (a new
      // bottle), is a new scene for the water.
      const steps = tick - lastTick;
      if (!(steps >= 0 && steps <= MAX_STEPS_BETWEEN_DRAWS) || bottle.water !== heightsLevel)
        motion.restart();
      lastTick = tick;
      if (bottle.water !== heightsLevel) {
        heightsLevel = bottle.water;
        centerHeight = bottleMassProperties(bottle.water, DEFAULT_TUNING).centerHeight;
        const rect = waterRect(bottle.water);
        waterHeight = rect ? -(rect.y0 + rect.y1) / 2 : 0;
      }
      motion.step(
        Number.isFinite(steps) && steps > 0 ? steps * SIM_DT : 0,
        bottle,
        centerHeight,
        waterHeight,
      );
      water.clear();
      const shape = waterShape(bottle.water, motion.down());
      if (!shape) return;
      water.fillStyle(COLORS.water, WATER_ALPHA);
      for (const piece of shape.pieces) water.fillPoints(toPixels(piece), true);
      // A light line along the free surface, so the level reads.
      water.lineStyle(SURFACE_LINE_PX, 0xffffff, 0.7);
      for (const segment of shape.surface) {
        const [a, b] = toPixels(segment) as [Point, Point];
        water.lineBetween(a.x, a.y, b.x, b.y);
      }
    },
  };
}
