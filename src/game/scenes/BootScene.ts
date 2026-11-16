import Phaser from 'phaser';

/**
 * First scene. Everything is drawn in code for now, so there is nothing to load or generate yet:
 * it starts the game straight away. Load assets (and generate textures) here when they appear.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Game');
  }
}
