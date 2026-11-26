import type Phaser from 'phaser';
import { MAX_POWER } from '../../core/throw';
import { COLORS, FONT_FAMILY } from '../theme';
import { BAR_BOTTOM, BAR_HEIGHT, BAR_LEFT, BAR_TOP, BAR_WIDTH, BAR_X } from './powerBarLayout';

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
  const track = scene.add.graphics();
  track
    .fillStyle(COLORS.powerTrack, 1)
    .fillRoundedRect(BAR_LEFT, BAR_TOP, BAR_WIDTH, BAR_HEIGHT, 8);
  track.lineStyle(2, COLORS.powerOutline, 1);
  track.strokeRoundedRect(BAR_LEFT, BAR_TOP, BAR_WIDTH, BAR_HEIGHT, 8);

  const fill = scene.add.graphics();

  // Quarter marks, drawn over the fill, so the height reads at a glance.
  const marks = scene.add.graphics();
  marks.lineStyle(2, COLORS.powerOutline, 0.6);
  for (const quarter of [0.25, 0.5, 0.75]) {
    const y = BAR_BOTTOM - BAR_HEIGHT * quarter;
    marks.lineBetween(BAR_LEFT, y, BAR_LEFT + 10, y);
    marks.lineBetween(BAR_LEFT + BAR_WIDTH - 10, y, BAR_LEFT + BAR_WIDTH, y);
  }

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
