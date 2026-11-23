import type Phaser from 'phaser';
import { PIXELS_PER_METER } from '../../core/constants';
import { offscreenMarker } from '../../core/offscreen';
import { COLORS } from '../theme';

/** Found by this name in the scene (see `src/debug/testHooks.ts`, `offscreenMarker()`). */
export const OFFSCREEN_MARKER_NAME = 'offscreenMarker';

/** The arrow's tip touches nothing: it sits just under the top edge. */
const TIP_Y = 6;
const ARROW_HEIGHT = 22;
const ARROW_HALF_WIDTH = 14;
const MARKER_DEPTH = 25;

export interface OffscreenMarkerView {
  /** Show the marker for a bottle at (x, y, angle) in meters, or hide it while the bottle shows. */
  update(bottle: { x: number; y: number; angle: number }): void;
}

/**
 * An upward arrow on the top edge of the screen, under a bottle that has flown above it. It is
 * drawn once at the origin and moved along the edge, so its position is the marker's position.
 * A fully hidden bottle gets a solid arrow, a partly cut-off one a fainter arrow.
 */
export function createOffscreenMarkerView(scene: Phaser.Scene): OffscreenMarkerView {
  const arrow = scene.add.graphics().setName(OFFSCREEN_MARKER_NAME).setDepth(MARKER_DEPTH);
  arrow.fillStyle(COLORS.offscreenMarker, 1);
  arrow.lineStyle(2, 0xffffff, 1);
  const points = [
    { x: 0, y: TIP_Y },
    { x: ARROW_HALF_WIDTH, y: TIP_Y + ARROW_HEIGHT },
    { x: -ARROW_HALF_WIDTH, y: TIP_Y + ARROW_HEIGHT },
  ];
  arrow.fillPoints(points, true);
  arrow.strokePoints(points, true);
  arrow.setVisible(false);
  return {
    update({ x, y, angle }) {
      const marker = offscreenMarker(x, y, angle);
      arrow.setVisible(marker !== null);
      if (!marker) return;
      arrow.setPosition(marker.x * PIXELS_PER_METER, 0);
      arrow.setAlpha(marker.hidden ? 1 : 0.7);
    },
  };
}
