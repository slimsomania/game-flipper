import type Phaser from 'phaser';
import { COLORS } from '../theme';
import { ICON_STROKE, type IconShape } from './speakerIcon';

/**
 * Draw a button icon (plain shapes, see `speakerIcon.ts`) centered at (`x`, `y`) in white: polygons
 * filled, arcs and lines stroked `ICON_STROKE` wide.
 */
export function drawIcon(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shapes: readonly IconShape[],
): void {
  graphics.fillStyle(COLORS.buttonIcon, 1).lineStyle(ICON_STROKE, COLORS.buttonIcon, 1);
  for (const shape of shapes) {
    switch (shape.kind) {
      case 'polygon':
        graphics.fillPoints(
          shape.points.map((point) => ({ x: x + point.x, y: y + point.y })),
          true,
        );
        break;
      case 'arc':
        graphics.beginPath();
        graphics.arc(x + shape.x, y + shape.y, shape.radius, shape.from, shape.to);
        graphics.strokePath();
        break;
      case 'line':
        graphics.lineBetween(x + shape.x1, y + shape.y1, x + shape.x2, y + shape.y2);
        break;
    }
  }
}
