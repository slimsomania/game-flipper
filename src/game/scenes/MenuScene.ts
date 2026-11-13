import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { markReady } from '../../debug/testHooks';
import { COLORS, FONT_FAMILY } from '../theme';

/** Title screen: tap or press SPACE to start. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, GAME_HEIGHT * 0.3, 'FLIPPER', {
        fontFamily: FONT_FAMILY,
        fontSize: '120px',
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, GAME_HEIGHT * 0.3 + 110, 'Flip it. Land it.', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: COLORS.accent,
      })
      .setOrigin(0.5);
    this.add.image(cx, GAME_HEIGHT * 0.58, 'bottle').setRotation(0.35);

    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.8, 'Tap or press SPACE to start', {
        fontFamily: FONT_FAMILY,
        fontSize: '36px',
        color: COLORS.text,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      this.scene.start('Game');
    };
    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);

    markReady();
  }
}
