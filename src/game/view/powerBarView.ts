import type Phaser from 'phaser';
import { MAX_POWER } from '../../core/throw';
import { COLORS, FONT_FAMILY } from '../theme';
import { bakedTexture } from './bakedGraphics';
import { BAR_BOTTOM, BAR_HEIGHT, BAR_LEFT, BAR_TOP, BAR_WIDTH, BAR_X } from './powerBarLayout';

/** Room around the baked track so its outline isn't cut. */
const BAR_PAD = 4;

export interface PowerBarView {
  /** Fill the bar to `power` (0 to 100) and show it as a whole percentage. */
  update(power: number): void;
}

/**
 * The power bar: a vertical track that fills from the bottom, a "POWER" caption above it and the
 * value as a percentage below it. Only the player's own setting is shown: it says nothing about
 * the bottle.
 */
export function createPowerBarView(scene: Phaser.Scene): PowerBarView {
  // The track and the marks never change: each is drawn once into a texture (bakedGraphics.ts).
  const boxLeft = BAR_LEFT - BAR_PAD;
  const boxTop = BAR_TOP - BAR_PAD;
  const boxWidth = BAR_WIDTH + 2 * BAR_PAD;
  const boxHeight = BAR_HEIGHT + 2 * BAR_PAD;
  const bakedImage = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) =>
    scene.add
      .image(boxLeft, boxTop, bakedTexture(scene, key, boxWidth, boxHeight, draw))
      .setOrigin(0, 0);
  bakedImage('powerBarTrack', (g) => {
    g.fillStyle(COLORS.powerTrack, 1).fillRoundedRect(BAR_PAD, BAR_PAD, BAR_WIDTH, BAR_HEIGHT, 8);
    g.lineStyle(2, COLORS.powerOutline, 1);
    g.strokeRoundedRect(BAR_PAD, BAR_PAD, BAR_WIDTH, BAR_HEIGHT, 8);
  });

  const fill = scene.add.graphics();

  // Quarter marks, drawn over the fill, so the height reads at a glance.
  bakedImage('powerBarMarks', (g) => {
    g.lineStyle(2, COLORS.powerOutline, 0.6);
    for (const quarter of [0.25, 0.5, 0.75]) {
      const y = BAR_PAD + BAR_HEIGHT * (1 - quarter);
      g.lineBetween(BAR_PAD, y, BAR_PAD + 10, y);
      g.lineBetween(BAR_PAD + BAR_WIDTH - 10, y, BAR_PAD + BAR_WIDTH, y);
    }
  });

  scene.add
    .text(BAR_X, BAR_TOP - 10, 'POWER', {
      fontFamily: FONT_FAMILY,
      fontSize: '24px',
      fontStyle: 'bold',
      color: COLORS.muted,
    })
    .setOrigin(0.5, 1);
  const label = scene.add
    .text(BAR_X, BAR_BOTTOM + 8, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '30px',
      fontStyle: 'bold',
      color: COLORS.text,
    })
    .setOrigin(0.5, 0);

  let drawn = Number.NaN;
  return {
    update(power) {
      if (power === drawn) return;
      drawn = power;
      const height = (BAR_HEIGHT * power) / MAX_POWER;
      fill.clear();
      if (height > 0) {
        // A flat-topped rectangle: the track's rounded corners show at the very bottom and top.
        fill
          .fillStyle(COLORS.powerFill, 1)
          .fillRect(BAR_LEFT + 3, BAR_BOTTOM - height, BAR_WIDTH - 6, height);
      }
      label.setText(`${Math.round(power)}%`);
    },
  };
}
