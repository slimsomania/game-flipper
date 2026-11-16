import Phaser from 'phaser';
import { PIXELS_PER_METER } from '../../core/constants';
import { BOTTLE_HALF_HEIGHT, BOTTLE_HALF_WIDTH } from '../../core/simulation';
import { COLORS } from '../theme';

/** Creates placeholder textures in code (there are no image files yet), then starts the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.createBottleTexture();
    this.scene.start('Game');
  }

  /** A bottle the same size as the physics body, with a red cap so its orientation is obvious. */
  private createBottleTexture(): void {
    const w = Math.round(BOTTLE_HALF_WIDTH * 2 * PIXELS_PER_METER);
    const h = Math.round(BOTTLE_HALF_HEIGHT * 2 * PIXELS_PER_METER);
    const g = this.make.graphics({}, false);
    g.fillStyle(COLORS.bottle, 0.85).fillRoundedRect(0, h * 0.25, w, h * 0.75, 12);
    g.fillStyle(COLORS.bottle, 0.85).fillRect(w * 0.3, h * 0.1, w * 0.4, h * 0.16);
    g.fillStyle(COLORS.cap, 1).fillRect(w * 0.26, 0, w * 0.48, h * 0.1);
    g.fillStyle(COLORS.label, 0.9).fillRect(0, h * 0.45, w, h * 0.16);
    g.fillStyle(COLORS.water, 0.95).fillRoundedRect(4, h * 0.72, w - 8, h * 0.28 - 4, 8);
    g.generateTexture('bottle', w, h);
    g.destroy();
  }
}
