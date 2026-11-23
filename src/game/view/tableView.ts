import type Phaser from 'phaser';
import { GAME_HEIGHT, PIXELS_PER_METER } from '../../core/constants';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_THICKNESS, TABLE_TOP_Y } from '../../core/table';
import { OVERSCAN_PX } from '../effects/effects';
import { COLORS } from '../theme';

/** Legs are drawn this far in from each end of the table, so a falling bottle clears them. */
const LEG_INSET_M = 0.7;
const LEG_WIDTH_M = 0.4;
const EDGE_STRIP_PX = 5;
/** The shadow under the slab: stacked bands that get shorter, so it fades downward. */
const SHADOW_PX = 36;
const SHADOW_BANDS = 4;

/** Draw the table from the constants in src/core/table.ts: a flat slab on two plain legs. */
export function createTableView(scene: Phaser.Scene): void {
  const px = (meters: number): number => meters * PIXELS_PER_METER;
  const slabBottom = px(TABLE_TOP_Y + TABLE_THICKNESS);

  // The legs hang from the slab and run off the bottom of the screen, and a little further so a
  // camera shake never shows where they end.
  for (const legX of [TABLE_LEFT_X + LEG_INSET_M, TABLE_RIGHT_X - LEG_INSET_M - LEG_WIDTH_M]) {
    scene.add
      .rectangle(
        px(legX),
        slabBottom,
        px(LEG_WIDTH_M),
        GAME_HEIGHT + OVERSCAN_PX - slabBottom,
        COLORS.tableLegs,
      )
      .setOrigin(0, 0);
  }

  scene.add
    .rectangle(
      px(TABLE_LEFT_X),
      px(TABLE_TOP_Y),
      px(TABLE_RIGHT_X - TABLE_LEFT_X),
      px(TABLE_THICKNESS),
      COLORS.table,
    )
    .setOrigin(0, 0);

  // A lighter strip along the top edge, and a soft shadow under the slab across the legs.
  const left = px(TABLE_LEFT_X);
  const width = px(TABLE_RIGHT_X - TABLE_LEFT_X);
  scene.add
    .rectangle(left, px(TABLE_TOP_Y), width, EDGE_STRIP_PX, COLORS.tableEdge)
    .setOrigin(0, 0);
  const soft = scene.add.graphics();
  for (let i = 0; i < SHADOW_BANDS; i++) {
    const band = (SHADOW_PX / SHADOW_BANDS) * (SHADOW_BANDS - i);
    soft
      .fillStyle(0x000000, 0.07)
      .fillRect(left + px(LEG_INSET_M) - 4, slabBottom, width - px(2 * LEG_INSET_M) + 8, band);
  }
}
