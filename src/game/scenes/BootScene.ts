import Phaser from 'phaser';
import { COLORS } from '../theme';

/** Key of the generated vertical gradient texture (the background of every scene). */
export const GRADIENT_TEXTURE = 'background-gradient';
/** The texture is a small strip, stretched over the canvas: smooth, and cheap to keep in memory. */
const GRADIENT_HEIGHT = 256;

/**
 * First scene. Everything is drawn in code, so there is nothing to load: it generates the
 * background gradient texture, shows it behind the (transparent) canvas and opens the title screen.
 * The gradient is not drawn by the scenes: a full-canvas image every frame made slow machines (and
 * the software renderer of the e2e tests) stutter, while a CSS background costs nothing per frame.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const texture = this.textures.exists(GRADIENT_TEXTURE)
      ? null
      : this.textures.createCanvas(GRADIENT_TEXTURE, 4, GRADIENT_HEIGHT);
    if (texture) {
      const ctx = texture.getContext();
      const gradient = ctx.createLinearGradient(0, 0, 0, GRADIENT_HEIGHT);
      gradient.addColorStop(0, COLORS.gradientTop);
      gradient.addColorStop(1, COLORS.gradientBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 4, GRADIENT_HEIGHT);
      texture.refresh();
      const canvas = this.game.canvas;
      canvas.style.backgroundColor = COLORS.background;
      canvas.style.backgroundImage = `url(${texture.getCanvas().toDataURL('image/png')})`;
      canvas.style.backgroundSize = '100% 100%';
    }
    this.scene.start('Title');
  }
}
