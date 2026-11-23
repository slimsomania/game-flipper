import type Phaser from 'phaser';
import { PIXELS_PER_METER } from '../../core/constants';
import { TABLE_TOP_Y } from '../../core/table';
import { bottleShadow, SHADOW_FLATNESS } from './bottleShadow';
import { shadowBlobTexture } from './softTextures';

/** The shadow's name in the scene, and the key of its data, for the test hook. */
export const SHADOW_NAME = 'bottle-shadow';

export interface BottleShadowView {
  update(pose: { x: number; y: number; angle: number }): void;
}

/** What the hook reports: the shadow as last drawn, width in game pixels. */
export function drawnShadow(scene: Phaser.Scene): { width: number; alpha: number } | null {
  const image = scene.children.getByName(SHADOW_NAME) as Phaser.GameObjects.Image | null;
  return image?.visible ? (image.getData('shadow') as { width: number; alpha: number }) : null;
}

/** A soft elliptical shadow on the tabletop: a radial gradient, squashed flat, that fades smoothly. */
export function createBottleShadowView(scene: Phaser.Scene): BottleShadowView {
  const image = scene.add
    .image(0, TABLE_TOP_Y * PIXELS_PER_METER, shadowBlobTexture(scene))
    .setName(SHADOW_NAME)
    .setVisible(false);
  return {
    update(pose) {
      const shadow = bottleShadow(pose);
      if (!shadow) {
        image.setVisible(false);
        return;
      }
      const w = shadow.width * PIXELS_PER_METER;
      image
        .setX(pose.x * PIXELS_PER_METER)
        .setDisplaySize(w, w * SHADOW_FLATNESS)
        .setAlpha(shadow.alpha)
        .setData('shadow', { width: w, alpha: shadow.alpha })
        .setVisible(true);
    },
  };
}
