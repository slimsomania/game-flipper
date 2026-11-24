import type Phaser from 'phaser';
import { BOTTLE_PARTS, type Point } from '../../core/bottleShape';
import { PIXELS_PER_METER } from '../../core/constants';
import type { BottleSnapshot } from '../../core/simulation';
import { COLORS } from '../theme';
import { WaterMotion, waterShape } from './waterSurface';

/** Opacity of the plastic: the table and the background show through a little. */
const SHELL_ALPHA = 0.55;
const WATER_ALPHA = 0.92;
const SURFACE_LINE_PX = 3;

export interface BottleView {
  /** Move the bottle to the snapshot's pose and redraw the water. `dt` is the frame time in seconds. */
  update(bottle: BottleSnapshot, dt?: number): void;
}

const toPixels = (points: readonly Point[]): Point[] =>
  points.map((p) => ({ x: p.x * PIXELS_PER_METER, y: p.y * PIXELS_PER_METER }));

/**
 * Draw the bottle from the shape in src/core/bottleShape.ts (the same pieces the physics body is
 * built from): a translucent blue shell, a lighter cap and a blue water fill. The water's volume
 * comes from the snapshot's `water` level and its surface moves as in waterSurface.ts. Nothing here is text: the player reads the level from
 * the fill alone.
 */
export function createBottleView(scene: Phaser.Scene): BottleView {
  const shell = scene.add.graphics();
  for (const part of BOTTLE_PARTS) {
    if (part.name === 'cap') shell.fillStyle(COLORS.cap, 1);
    else shell.fillStyle(COLORS.bottle, SHELL_ALPHA);
    shell.fillPoints(toPixels(part.vertices), true);
  }

  const water = scene.add.graphics();
  // The container carries the pose; both graphics are drawn in the bottle's local coordinates.
  const container = scene.add.container(0, 0, [shell, water]);
  const motion = new WaterMotion();

  return {
    update(bottle, dt = 0) {
      container
        .setPosition(bottle.x * PIXELS_PER_METER, bottle.y * PIXELS_PER_METER)
        .setRotation(bottle.angle);
      motion.step(dt, bottle.x, bottle.y);
      water.clear();
      const shape = waterShape(bottle.water, motion.down(bottle.angle));
      if (!shape) return;
      water.fillStyle(COLORS.water, WATER_ALPHA).fillPoints(toPixels(shape.polygon), true);
      if (shape.surface) {
        // A light line along the free surface, so the level reads.
        const [a, b] = toPixels(shape.surface) as [Point, Point];
        water.lineStyle(SURFACE_LINE_PX, 0xffffff, 0.7).lineBetween(a.x, a.y, b.x, b.y);
      }
    },
  };
}
