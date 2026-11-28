import type Phaser from 'phaser';
import { GAME_WIDTH } from '../../core/constants';
import { MAX_POWER } from '../../core/throw';
import { COLORS, FONT_FAMILY } from '../theme';
import { bakedTexture } from './bakedGraphics';
import { BAR_BOTTOM, BAR_HEIGHT, BAR_LEFT, BAR_TOP, BAR_WIDTH, BAR_X } from './powerBarLayout';

/** Room around the baked track so its outline isn't cut. */
const BAR_PAD = 4;
/** The track's corner radius and outline width. */
const TRACK_RADIUS = 8;
const OUTLINE = 2;
/** The fill stays this far inside the track's edge, clear of the outline. */
const FILL_INSET = 3;
const FILL_HEIGHT = BAR_HEIGHT - 2 * FILL_INSET;
const FILL_RADIUS = TRACK_RADIUS - FILL_INSET;

export interface PowerBarView {
  /** Fill the bar to `power` (0 to 100) and show it as a whole percentage. */
  update(power: number, mirrored?: boolean): void;
}

/** Name of the bar in the scene, for the test hook. */
export const POWER_BAR_NAME = 'power-bar';

/** The bar's track as drawn (game pixels) and the value it shows. */
export interface DrawnPowerBar {
  left: number;
  right: number;
  top: number;
  bottom: number;
  value: number;
}

/** What the hook reports: the bar as last drawn. */
export function drawnPowerBar(scene: Phaser.Scene): DrawnPowerBar | null {
  const bar = scene.children.getByName(POWER_BAR_NAME) as Phaser.GameObjects.Container | null;
  if (!bar) return null;
  return {
    left: BAR_LEFT + bar.x,
    right: BAR_LEFT + BAR_WIDTH + bar.x,
    top: BAR_TOP,
    bottom: BAR_BOTTOM,
    value: Number(bar.getData('value')),
  };
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
  const container = scene.add.container(0, 0).setName(POWER_BAR_NAME);
  const bakedImage = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    container.add(
      scene.add
        .image(boxLeft, boxTop, bakedTexture(scene, key, boxWidth, boxHeight, draw))
        .setOrigin(0, 0),
    );
  };
  bakedImage('powerBarTrack', (g) => {
    g.fillStyle(COLORS.powerTrack, 1).fillRoundedRect(
      BAR_PAD,
      BAR_PAD,
      BAR_WIDTH,
      BAR_HEIGHT,
      TRACK_RADIUS,
    );
    g.lineStyle(OUTLINE, COLORS.powerOutline, 1);
    g.strokeRoundedRect(BAR_PAD, BAR_PAD, BAR_WIDTH, BAR_HEIGHT, TRACK_RADIUS);
  });

  const fill = scene.add.graphics();
  container.add(fill);

  // Quarter marks, drawn over the fill, so the height reads at a glance.
  bakedImage('powerBarMarks', (g) => {
    g.lineStyle(2, COLORS.powerOutline, 0.6);
    for (const quarter of [0.25, 0.5, 0.75]) {
      const y = BAR_PAD + BAR_HEIGHT * (1 - quarter);
      g.lineBetween(BAR_PAD, y, BAR_PAD + 10, y);
      g.lineBetween(BAR_PAD + BAR_WIDTH - 10, y, BAR_PAD + BAR_WIDTH, y);
    }
  });

  const caption = scene.add
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
  container.add([caption, label]);

  let drawn = Number.NaN;
  return {
    update(power, mirrored = false) {
      // Mirrored (Player 2): the bar stands by the right hand, the mirror of its place by the left.
      container.setX(mirrored ? GAME_WIDTH - 2 * BAR_X : 0);
      if (power === drawn) return;
      drawn = power;
      container.setData('value', power);
      const height = (FILL_HEIGHT * power) / MAX_POWER;
      fill.clear();
      if (height > 0) {
        // Inside the outline, with its corners rounded to follow the track's: flat on top until
        // the bar is full, so the level reads as a line.
        const bottomRadius = Math.min(FILL_RADIUS, height / 2);
        const topRadius = height >= FILL_HEIGHT - FILL_RADIUS ? bottomRadius : 0;
        fill
          .fillStyle(COLORS.powerFill, 1)
          .fillRoundedRect(
            BAR_LEFT + FILL_INSET,
            BAR_BOTTOM - FILL_INSET - height,
            BAR_WIDTH - 2 * FILL_INSET,
            height,
            { tl: topRadius, tr: topRadius, bl: bottomRadius, br: bottomRadius },
          );
      }
      label.setText(`${Math.round(power)}%`);
    },
  };
}
