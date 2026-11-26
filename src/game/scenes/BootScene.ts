import Phaser from 'phaser';
import { COLORS } from '../theme';

/**
 * First scene. Everything is drawn in code, so there is nothing to load: it paints the background
 * gradient behind the (transparent) canvas and opens the title screen.
 * The gradient is not drawn by the scenes: a full-canvas image every frame made slow machines (and
 * the software renderer of the e2e tests) stutter, while a CSS background costs nothing per frame.
 * It goes on the page, not the canvas, so it also fills the letterbox bars and the safe-area
 * padding (notch, home indicator): the whole screen is one seamless background, with no frame
 * around the 16:9 canvas.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const page = document.documentElement.style;
    page.backgroundColor = COLORS.background;
    page.backgroundImage = `linear-gradient(${COLORS.gradientTop}, ${COLORS.gradientBottom})`;
    this.scene.start('Title');
  }
}
