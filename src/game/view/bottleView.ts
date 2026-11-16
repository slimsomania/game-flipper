import type Phaser from 'phaser';
import { BOTTLE_PARTS, waterVertices, type Point } from '../../core/bottleShape';
import { PIXELS_PER_METER } from '../../core/constants';
import type { BottleSnapshot } from '../../core/simulation';
import { COLORS } from '../theme';

/** Opacity of the plastic: the table and the background show through a little. */
const SHELL_ALPHA = 0.55;
const WATER_ALPHA = 0.92;

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

  return {
    update(bottle) {
      container
        .setPosition(bottle.x * PIXELS_PER_METER, bottle.y * PIXELS_PER_METER)
        .setRotation(bottle.angle);
      if (bottle.water === drawnLevel) return;
      drawnLevel = bottle.water;
      water.clear();
      const vertices = waterVertices(bottle.water);
      if (!vertices) return;
      water.fillStyle(COLORS.water, WATER_ALPHA).fillPoints(toPixels(vertices), true);
    },
  };
}
