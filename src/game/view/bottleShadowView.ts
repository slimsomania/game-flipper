import type Phaser from 'phaser';
import { PIXELS_PER_METER } from '../../core/constants';
import { TABLE_TOP_Y } from '../../core/table';
import { bottleShadow } from './bottleShadow';
import { SHADOW_BAR_END, SHADOW_BAR_HEIGHT, shadowBarTexture } from './softTextures';

/** The shadow's name in the scene, and the key of its data, for the test hook. */
export const SHADOW_NAME = 'bottle-shadow';

export interface BottleShadowView {
  update(pose: { x: number; y: number; angle: number }): void;
}

export interface DrawnShadow {
  /** Center along the table, game pixels. */
  x: number;
  /** Width along the table, game pixels. */
  width: number;
  /** Depth (its height as drawn), game pixels: it depends on the height of the bottle only. */
  depth: number;
  /** Opacity, 0 to 1. */
  alpha: number;
}

/** What the hook reports: the shadow as last drawn, in game pixels. */
export function drawnShadow(scene: Phaser.Scene): DrawnShadow | null {
  const shadow = scene.children.getByName(SHADOW_NAME) as Phaser.GameObjects.Container | null;
  return shadow?.visible ? (shadow.getData('shadow') as DrawnShadow) : null;
}

/**
 * A soft shadow on the tabletop: two rounded ends and a middle stretched between them, cut from
 * one gradient texture, so it stays a smooth rounded bar however long the footprint is (one
 * stretched ellipse would only be dark in its middle).
 */
export function createBottleShadowView(scene: Phaser.Scene): BottleShadowView {
  const key = shadowBarTexture(scene);
  const left = scene.add.image(0, 0, key, 'left').setOrigin(1, 0.5);
  const middle = scene.add.image(0, 0, key, 'middle').setOrigin(0.5, 0.5);
  const right = scene.add.image(0, 0, key, 'right').setOrigin(0, 0.5);
  const container = scene.add
    .container(0, TABLE_TOP_Y * PIXELS_PER_METER, [left, middle, right])
    .setName(SHADOW_NAME)
    .setVisible(false);
  return {
    update(pose) {
      const shadow = bottleShadow(pose);
      if (!shadow) {
        container.setVisible(false);
        return;
      }
      const x = shadow.x * PIXELS_PER_METER;
      const width = shadow.width * PIXELS_PER_METER;
      const scale = (shadow.depth * PIXELS_PER_METER) / SHADOW_BAR_HEIGHT;
      const end = SHADOW_BAR_END * scale;
      const mid = Math.max(0, width - 2 * end);
      left.setScale(scale).setX(-mid / 2);
      right.setScale(scale).setX(mid / 2);
      middle.setDisplaySize(mid, SHADOW_BAR_HEIGHT * scale).setVisible(mid > 0);
      container
        .setX(x)
        .setAlpha(shadow.alpha)
        .setData('shadow', {
          x,
          width: Math.max(width, 2 * end),
          depth: SHADOW_BAR_HEIGHT * scale,
          alpha: shadow.alpha,
        })
        .setVisible(true);
    },
  };
}
