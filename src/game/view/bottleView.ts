import type Phaser from 'phaser';
import { BOTTLE_PARTS, slidWaterVertices, type Point } from '../../core/bottleShape';
import { PIXELS_PER_METER } from '../../core/constants';
import type { BottleSnapshot } from '../../core/simulation';
import { COLORS } from '../theme';

/** Opacity of the plastic: the table and the background show through a little. */
const SHELL_ALPHA = 0.55;
const WATER_ALPHA = 0.92;
const SURFACE_LINE_PX = 3;

export interface BottleView {
  /** Move the bottle to the snapshot's pose and redraw the water if its level changed. */
  update(bottle: BottleSnapshot): void;
}

const toPixels = (points: readonly Point[]): Point[] =>
  points.map((p) => ({ x: p.x * PIXELS_PER_METER, y: p.y * PIXELS_PER_METER }));

/**
 * Draw the bottle from the shape in src/core/bottleShape.ts (the same pieces the physics body is
 * built from): a translucent blue shell, a lighter cap and a blue water fill. The water's height
 * comes from the snapshot's `water` level. Nothing here is text: the player reads the level from
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
  let drawnLevel = Number.NaN;
  let drawnOffset = Number.NaN;

  return {
    update(bottle) {
      container
        .setPosition(bottle.x * PIXELS_PER_METER, bottle.y * PIXELS_PER_METER)
        .setRotation(bottle.angle);
      if (bottle.water === drawnLevel && bottle.waterOffset === drawnOffset) return;
      drawnLevel = bottle.water;
      drawnOffset = bottle.waterOffset;
      water.clear();
      const vertices = slidWaterVertices(bottle.water, bottle.waterOffset);
      if (!vertices) return;
      const px = toPixels(vertices);
      water.fillStyle(COLORS.water, WATER_ALPHA).fillPoints(px, true);
      // A light line along the surface (the top edge: the last two vertices), so the level reads.
      const [, , right, left] = px as [Point, Point, Point, Point];
      water.fillStyle(0xffffff, 0.7).fillRect(left.x, left.y, right.x - left.x, SURFACE_LINE_PX);
      // A faint highlight strip down the shell's left side, drawn over the water.
      const top = Math.min(left.y, right.y);
      const bottom = px[0]!.y;
      water
        .fillStyle(0xffffff, 0.2)
        .fillRect(left.x + 5, top + 4, 5, Math.max(0, bottom - top - 8));
    },
  };
}
