import type Phaser from 'phaser';
import { PIXELS_PER_METER } from '../../core/constants';
import { TABLE_TOP_Y } from '../../core/table';
import { bottleShadow, SHADOW_FLATNESS, type Shadow } from './bottleShadow';

/** The shadow's name in the scene, and the key of its data, for the test hook. */
export const SHADOW_NAME = 'bottle-shadow';

export interface BottleShadowView {
  update(pose: { x: number; y: number; angle: number }): void;
}

/** What the hook reports: the shadow as last drawn, width in game pixels. */
export function drawnShadow(scene: Phaser.Scene): { width: number; alpha: number } | null {
  const g = scene.children.getByName(SHADOW_NAME) as Phaser.GameObjects.Graphics | null;
  return g?.visible ? (g.getData('shadow') as { width: number; alpha: number }) : null;
}

/** A soft elliptical shadow on the tabletop: two stacked ellipses fake a soft edge. */
export function createBottleShadowView(scene: Phaser.Scene): BottleShadowView {
  const g = scene.add.graphics().setName(SHADOW_NAME).setVisible(false);
  let drawn: Shadow | null = null;
  let drawnX = Number.NaN;
  return {
    update(pose) {
      const shadow = bottleShadow(pose);
      if (!shadow) {
        g.setVisible(false);
        drawn = null;
        return;
      }
      const x = pose.x * PIXELS_PER_METER;
      if (drawn && drawn.width === shadow.width && drawn.alpha === shadow.alpha && x === drawnX) {
        g.setVisible(true);
        return;
      }
      drawn = shadow;
      drawnX = x;
      const w = shadow.width * PIXELS_PER_METER;
      const h = w * SHADOW_FLATNESS;
      g.clear();
      // Outer, wider ring is faint; the core is darker: together a soft falloff.
      g.fillStyle(0x243040, shadow.alpha * 0.45).fillEllipse(
        x,
        TABLE_TOP_Y * PIXELS_PER_METER,
        w,
        h,
      );
      g.fillStyle(0x243040, shadow.alpha * 0.55).fillEllipse(
        x,
        TABLE_TOP_Y * PIXELS_PER_METER,
        w * 0.7,
        h * 0.7,
      );
      g.setData('shadow', { width: w, alpha: shadow.alpha });
      g.setVisible(true);
    },
  };
}
